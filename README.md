# LendLoop

**Borrow what you need. Lend what you don't.**

LendLoop is a neighbourhood tool-lending board. Neighbours list tools, request them for a date range, and approve or decline requests. n8n workflows send the emails: a notification whenever a request changes state, and a daily reminder for overdue loans.

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), Tailwind v4 |
| Auth | Clerk (Core 3), JWT passed to Convex |
| Data / backend | Convex (queries, mutations, scheduled actions, HTTP actions, cron) |
| Automation | n8n 2.x, self-hosted with Docker, plus Mailpit as a local SMTP inbox |
| Language | TypeScript throughout; the n8n Code nodes are plain JS |

---

## Contents

1. [Quick start](#quick-start)
2. [Environment variables](#environment-variables)
3. [Architecture](#architecture)
4. [Roles and RBAC](#roles-and-rbac)
5. [n8n workflows](#n8n-workflows)
6. [Security decisions](#security-decisions)
7. [Data minimisation](#data-minimisation)
8. [Reliability](#reliability)
9. [Design](#design)
10. [What was tested](#what-was-tested)
11. [What I'd change for production](#what-id-change-for-production)

---

## Quick start

Prerequisites: Node 22+, Docker with Compose, a free [Clerk](https://clerk.com) application, and a free [Convex](https://convex.dev) account (optional, see step 2).

### 1. Install

```bash
npm install
```

### 2. Convex

The fastest full local loop is a **local Convex deployment**. Convex, n8n and the browser then all run on your machine, so n8n can call Convex and Convex can call n8n without a tunnel.

```bash
npx convex dev                 # choose "local deployment" when prompted (or log in and pick cloud, see below)
```

This writes `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` to `.env.local` and keeps your functions in sync. Leave it running.

> **Cloud deployment instead?** Convex cloud can't reach `localhost:5678`. Expose n8n with a tunnel (for example `cloudflared tunnel --url http://localhost:5678`) and use the tunnel URL in `N8N_LOAN_EVENTS_WEBHOOK_URL`. Then set `LENDLOOP_CONVEX_SITE_URL=https://<deployment>.convex.site` in `.env.n8n`.

### 3. Clerk

1. Create a Clerk application with email sign-in enabled.
2. In the Clerk dashboard, go to **Integrations → Convex** and activate it. Older Clerk instances can create a JWT template named **`convex`** instead. Copy the **Frontend API URL**.
3. Add the keys to `.env.local` (see `.env.local.example`):
   ```bash
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```
4. Tell Convex who issues tokens, and who the admins are:
   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
   npx convex env set ADMIN_EMAILS you@example.com
   ```

> Notification emails need `email` (and, for admin bootstrap, `email_verified`) in the token Convex receives. If **My listings** says *"We don't have an email for your account"*, add `email`, `email_verified` and `given_name` claims to the `convex` JWT template.

### 4. Shared secrets

Each direction gets its own secret:

```bash
N8N_WEBHOOK_SECRET=$(openssl rand -hex 32)      # Convex → n8n
N8N_TO_CONVEX_SECRET=$(openssl rand -hex 32)    # n8n → Convex

npx convex env set N8N_WEBHOOK_SECRET   "$N8N_WEBHOOK_SECRET"
npx convex env set N8N_TO_CONVEX_SECRET "$N8N_TO_CONVEX_SECRET"
npx convex env set N8N_LOAN_EVENTS_WEBHOOK_URL http://localhost:5678/webhook/lendloop-loan-events

cp .env.n8n.example .env.n8n
# paste the same two values into LENDLOOP_N8N_WEBHOOK_SECRET / LENDLOOP_N8N_TO_CONVEX_SECRET
```

### 5. n8n and Mailpit

```bash
docker compose up -d     # n8n on :5678, Mailpit inbox on :8025
./n8n/setup.sh           # creates the Mailpit SMTP credential, imports and publishes the 3 workflows
```

Open http://localhost:5678 once to create the n8n owner account. Every email the workflows send shows up in the Mailpit inbox at http://localhost:8025. All three ports are bound to `127.0.0.1` only, so neither the n8n editor nor the inbox is reachable from your network.

> On Linux, n8n reaches the local Convex backend at `host.docker.internal:3211` through Docker's host gateway. If your firewall blocks container→host traffic, allow port 3211 from the Docker bridge.

### 6. Run the app

```bash
npm run dev              # http://localhost:3000
```

Sign in with two different accounts (a private window works) to try both sides of a loan. To trigger the overdue job without waiting for 09:00, open **LendLoop · Daily overdue reminders** in n8n and click *Execute workflow* (it uses the manual trigger).

---

## Environment variables

**Next.js (`.env.local`)**

| Name | Purpose |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Convex client URL. Written by `npx convex dev`. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend key |
| `CLERK_SECRET_KEY` | Clerk server key. Used only by the Next.js proxy route guard. |

**Convex deployment (`npx convex env set …`)**

| Name | Purpose |
|---|---|
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk Frontend API URL. Convex verifies JWTs against it. |
| `ADMIN_EMAILS` | Comma-separated **verified** emails promoted to admin on sign-in |
| `N8N_LOAN_EVENTS_WEBHOOK_URL` | n8n production webhook URL for loan events |
| `N8N_WEBHOOK_SECRET` | HMAC key for Convex → n8n requests |
| `N8N_TO_CONVEX_SECRET` | HMAC key for n8n → Convex requests |

**n8n container (`.env.n8n`, gitignored)**

| Name | Purpose |
|---|---|
| `LENDLOOP_N8N_WEBHOOK_SECRET` | Same value as `N8N_WEBHOOK_SECRET` |
| `LENDLOOP_N8N_TO_CONVEX_SECRET` | Same value as `N8N_TO_CONVEX_SECRET` |
| `LENDLOOP_CONVEX_SITE_URL` | Convex HTTP actions base URL |
| `LENDLOOP_MAIL_FROM` | Sender address |
| `LENDLOOP_APP_URL` | Base URL for links in emails |

No secret appears in source code or in the exported workflow JSON. The SMTP credential is referenced by id and name only.

---

## Architecture

```
            ┌──────────────┐  Clerk JWT   ┌───────────────────────────────────────────┐
 Browser ──►│  Next.js app │─────────────►│ Convex                                    │
            │ (client UI)  │ realtime     │  queries / mutations (RBAC enforced here) │
            └──────────────┘ queries      │                                           │
                                          │  mutation ─► webhookDeliveries (outbox)   │
                                          │                │ scheduler               │
                                          │                ▼                          │
                                          │  internalAction deliver ──HMAC POST──────┼──┐
                                          │       retries + backoff, cron sweeper     │  │
                                          │                                           │  │
                                          │  HTTP actions (HMAC-verified):            │  │
                                          │   POST /n8n/overdue-loans   ◄─────────────┼──┼──┐
                                          │   POST /n8n/reminder-status ◄─────────────┼──┼──┤
                                          │   POST /n8n/workflow-error  ◄─────────────┼──┼──┤
                                          └───────────────────────────────────────────┘  │  │
                                                                                         ▼  │
                                          ┌───────────────────────────────────────────┐     │
                                          │ n8n                                       │     │
                                          │  1. Loan event notifications (webhook) ───┼─SMTP─► Mailpit / provider
                                          │  2. Daily overdue reminders (cron 09:00) ─┼─────┘
                                          │  3. Error handler (Error Trigger) ────────┘
                                          └───────────────────────────────────────────┘
```

**Code map**

| Path | What's there |
|---|---|
| `convex/schema.ts` | Tables: `users`, `tools`, `loans`, `webhookDeliveries` (outbox), `automationEvents` (per-loan timeline and errors), `auditLog` |
| `convex/lib/auth.ts` | `getViewer` / `ensureViewer` / `requireAdmin`: the single place identity and role are resolved |
| `convex/lib/hmac.ts` | Sign and verify with Web Crypto, constant-time compare, timestamp window |
| `convex/lib/claims.ts` | Atomic send reservations used by n8n (dedupe that survives concurrent executions) |
| `convex/lib/rateLimit.ts` | Fixed-window rate limits stored in Convex |
| `convex/tools.ts`, `convex/loans.ts` | Domain logic: validation, ownership checks, state machine, overlap checks |
| `convex/webhooks.ts` | Outbox enqueue, delivery action, retry/backoff, admin retry, stuck-delivery sweeper |
| `convex/automation.ts` | Internal functions behind the n8n endpoints; admin health query |
| `convex/http.ts` | HTTP router. Every route goes through `signed()` (verify → parse → validate). |
| `convex/crons.ts` | Outbox sweeper every 5 minutes |
| `tests/*.test.ts` | Vitest + `convex-test` suite (runs the real Convex functions in memory) |
| `app/page.tsx` | Public landing page (tagline, live board of tools, sign-in) |
| `app/(board)/*` | All tools · My listings · My requests · Incoming · Admin |
| `app/_components/` | Header rail, board slot and tool silhouettes, tool tile, loan strip, shared UI |
| `n8n/workflows/*.json` | Exported workflows |
| `n8n/setup.sh`, `docker-compose.yml` | Local automation stack |

**Loan state machine** (enforced in `convex/loans.ts`):

```
pending ──approve (lender)──► approved ──mark returned (lender/admin)──► returned
   │ └─decline (lender)──► declined
   └───cancel (borrower)──► cancelled
```

"Overdue" is not a stored state. It is derived as `approved && endDate < today (UTC)`, so it can never drift out of sync.

Design choices worth calling out:

- **Client-rendered pages on Convex realtime queries.** Lists update live when a neighbour approves a request or n8n writes a reminder back. The Next.js proxy only redirects signed-out users; it is not a security boundary.
- **Soft delete for tools.** Loan history and the audit trail stay intact when a listing is removed.
- **Dates are UTC calendar days** (`YYYY-MM-DD`), compared as strings. This keeps overlap checks simple and avoids timezone surprises.

---

## Roles and RBAC

Every rule below is enforced **inside Convex functions**. The UI hiding a button is cosmetic only.

| Action | Function | Who |
|---|---|---|
| See public list (name and category only) | `tools.publicList` | anyone, unauthenticated |
| Browse with availability and owner first name | `tools.list` | signed in |
| Create a listing | `tools.create` | signed in |
| Edit a listing | `tools.update` | owner only |
| Delete a listing | `tools.remove` | owner (blocked while lent out), or **admin** for any listing |
| Request to borrow | `loans.request` | signed in, not the owner, no overlap with approved loans, ≤30 days, ≤90 days ahead |
| Approve / decline | `loans.approve` / `loans.decline` | the tool's lender only |
| Cancel a request | `loans.cancel` | the borrower only, while pending |
| Mark returned | `loans.markReturned` | the lender, or **admin** |
| View all loans | `loans.adminAll` | **admin** |
| Mark a lender "Trusted Lender" | `users.setTrustedLender` | **admin** |
| Automation health / retry failed delivery | `automation.health` / `webhooks.retryDelivery` | **admin** |

**Abuse limits** (`convex/lib/rateLimit.ts`). Requests and cancellations both email someone, so they are capped:

| Limit | Value |
|---|---|
| Borrow requests per user | 10 / hour |
| Requests per user **per tool** | 3 / day (stops cancel → re-request loops) |
| Cancellations per user | 10 / hour |
| New listings per user | 10 / day, and at most 50 active |

The counters live in Convex, so they are transactional. A call that is rejected for another reason rolls back and doesn't use up quota.

How identity and roles work:

- Identity always comes from `ctx.auth.getUserIdentity()` (the verified Clerk JWT), never from arguments.
- Roles live in the Convex `users` table. Nobody can grant themselves admin from the client.
- Admins are bootstrapped from `ADMIN_EMAILS`, which only applies when the token says the email is verified. Ops can also run `npx convex run users:setRole '{"email":"…","role":"admin"}'`. That function is internal, so clients can't call it.
- Admin actions (listing removal, trust changes, admin returns, delivery retries) are written to `auditLog`.

---

## n8n workflows

All three live in `n8n/workflows/`. `n8n/setup.sh` imports and publishes them.

### 1. LendLoop · Loan event notifications (`loan-event-notifications.json`)

`Webhook → Verify signature → valid? → claim in Convex → granted? → Compose → Send email → complete → 200`

- Triggered by Convex on `request.created`, `request.approved`, `request.declined`, `request.cancelled` and `loan.returned`.
- **Verify signature** recomputes the HMAC and checks the 5-minute timestamp window, using `timingSafeEqual`. Invalid requests get a **401** and never reach the email step.
- **Atomic dedupe:** before sending, the workflow calls `POST /n8n/claim` with `event:<eventId>`. Convex mutations are serializable, so when several executions race for the same event exactly one gets `granted`. The others get `busy` (n8n answers **409**, and Convex retries later) or `duplicate` (n8n answers 200, nothing is sent). After the email goes out the workflow calls `/n8n/complete`. If the send fails it calls `/n8n/release` and fails the execution, so a retry can claim again. A claim whose holder crashed expires after 2 minutes. (An earlier version deduped in n8n workflow static data, which is check-then-act and not reliable under concurrent executions.)
- The webhook responds only after the email is sent. A 200 therefore means the recipient was notified, and Convex counts any failure as a retry.
- Send email retries 3 times. If it still fails: release the claim, then *Stop and Error*. The webhook returns 5xx, Convex backs off and retries, and the error workflow records the failure.

### 2. LendLoop · Daily overdue reminders (`overdue-reminders.json`)

`Schedule 09:00 (or Manual) → POST /n8n/overdue-loans → one item per loan → claim → granted? → Compose → Send reminder → POST /n8n/reminder-status`, plus a `More pages?` branch that loops back with the cursor.

- Convex returns only approved, un-returned loans past their end date that **haven't already been reminded today**, with just the fields the email needs.
- **Paginated:** the endpoint walks the index with a cursor and filters per page. It keeps paging inside one call until it finds work or reaches the end. n8n loops on `isDone`, so already-reminded loans can't hide the ones behind them, however many there are. (Tested live with 130 overdue loans across two pages.)
- **Claimed per loan:** each reminder claims its `reminderKey` before sending, so two overlapping runs can't both email the same borrower.
- **Send reminder** uses *continue on error*, so one bad address doesn't block the rest. Each item writes back `sent` or `failed`.
- **Idempotent write-back:** each loan carries `reminderKey = reminder:<loanId>:<date>`. Convex records only the first `sent` per key (a later `sent` supersedes an earlier `failed`) and rejects keys that don't belong to the loan. The write-back also settles the claim: `sent` completes it, `failed` releases it for the next run. Re-running the workflow the same day sends nothing new.
- The HTTP nodes retry 3× with 5 s spacing.

### 3. LendLoop · Error handler (`error-handler.json`)

`Error Trigger → Sign report → POST /n8n/workflow-error`

- Workflows 1 and 2 have `settings.errorWorkflow` pointing at this one.
- It sends a compact, PII-free report (workflow, node, short message, execution id). Convex stores it idempotently per execution id, and admins see it under **Admin → Automation health**.

### Bonus: per-loan automation activity

Every request card shows its timeline from `automationEvents`, for example *"Overdue reminder emailed to borrower · 2 days ago"*, *"Lender notified of new request · just now"*, or failures in red.

---

## Security decisions

- **HMAC in both directions, with separate keys.** `X-LendLoop-Signature: sha256=HMAC(secret, "<timestamp>.<body>")` plus `X-LendLoop-Timestamp`. Receivers reject timestamps more than 300 s off, which bounds replay, and compare in constant time. Separate keys mean a leak on one side doesn't let an attacker forge the other direction.
- **Verify before parse, with a real byte limit.** Convex HTTP actions reject a `Content-Length` over 16 KB up front, then read the stream and abort as soon as 16 KB of *bytes* is crossed, so an oversized or lying client can't make us buffer everything. Invalid UTF-8 is refused. Only then is the signature verified and the body `JSON.parse`d. Field types and lengths are validated before anything reaches a mutation. Errors don't reveal which check failed.
- **Abuse limits** on everything that sends email or creates data (see [Roles and RBAC](#roles-and-rbac)). List queries cap page size server-side at 50.
- **Local services stay local.** Docker publishes n8n, the Mailpit inbox and SMTP on `127.0.0.1` only.
- **IDs from n8n are untrusted.** `ctx.db.normalizeId` validates loan ids, and `reminderKey` must match the loan.
- **The signature covers the exact bytes.** Convex signs `JSON.stringify(payload)`. n8n verifies against `JSON.stringify(parsedBody)`, which reproduces the same bytes because key order and escaping survive a parse→stringify round trip of `JSON.stringify` output.
- **Secrets stay in env vars and credentials only.** Convex env, `.env.n8n` (gitignored), and the n8n credential store for SMTP. The workflow JSON references credentials by id and name only. Code nodes read secrets from `$env`, so only the *signature* ever appears in n8n execution data.
- **Server-side RBAC everywhere**, as above. Mutations upsert the user from the verified token, so there is no window where an action runs without a known user.
- **Admin bootstrap requires a verified email**, so an unverified sign-up with an admin's address gets nothing.
- **Input validation:** length limits, enum validators for category and condition, real calendar dates, a max loan length, no booking in the past, no double-booking.
- **Auditability:** admin actions go to `auditLog`. Tools are soft-deleted. Loans are never deleted.

## Data minimisation

- **Public page:** tool name and category only. No owner, no availability, no description.
- **Signed-in neighbours** see a lender's **first name** and Trusted badge, never their email. The borrower's note is shown only to the lender.
- **Webhook payloads** carry only what the template needs: event, loan id, status, dates, tool name, the recipient's email and first name, and the counterpart's first name. They exclude user ids, Clerk subjects, the counterpart's email, and free-text notes (which could contain anything).
- **The outbox drops the payload snapshot** as soon as a delivery succeeds or permanently fails.
- **The overdue endpoint** returns only due loans with the borrower's email and first name, the lender's first name, the tool name, and dates.
- **Error reports** to Convex include the node name and a truncated message, no item data.
- **n8n execution logs** are pruned after 7 days (`EXECUTIONS_DATA_MAX_AGE=168`), because they contain recipient emails.

## Reliability

| Failure | What happens |
|---|---|
| State change commits but the webhook call fails | A **transactional outbox** row is written in the same mutation. A scheduled action delivers it, with up to 5 attempts at 10 s / 1 m / 5 m / 30 m backoff. After that it is marked `failed`, shown in Admin with a **Retry** button, and logged on the loan timeline. |
| Delivery action dies mid-flight | A **cron sweeper** (every 5 min) re-queues pending deliveries that are past due. n8n's `eventId` dedupe prevents a duplicate email. |
| SMTP down | n8n node retries 3×, then the execution fails, the webhook returns 5xx, Convex retries later, and the error workflow records it. |
| One reminder email fails | That loan writes back `failed` and the others still go out. The next daily run (or a manual re-run) retries it, and the key allows `failed → sent`. |
| Convex endpoint briefly down | n8n HTTP nodes retry 3×. If they still fail, the error workflow fires. |
| Duplicate or replayed n8n write-back | Idempotent on `reminderKey` / execution id, and replays are bounded by the timestamp window. |
| Two n8n executions for the same event or reminder at once | Atomic claim in Convex: one sends, the others get `busy`/`duplicate`. Verified live: 3 concurrent deliveries of one event gave one 200, two 409s, and one email. |
| Hundreds of overdue loans, most already reminded | Cursor pagination with per-page filtering, so nothing is starved. |
| Many deleted listings | Removed tools are excluded *by the index* (`removedAt` in the index key), so pagination never returns empty pages of deleted rows. |

Remaining gap, inherent to SMTP: if n8n crashes *after* the mail server accepted an email but *before* `/complete`, the claim expires and a retry sends it again. Delivery is at-least-once with a window of one crashed execution, never silently dropped.

---

## Design

The UI is a **shadow board**, the pegboard a tool library paints with each tool's outline. Every tool hangs as a silhouette over its painted place. When it is out on loan, only the outline is left, labelled with the day it comes back. This makes availability visible without a single badge, and it keeps the app away from the generic marketplace grid of photo cards.

- **Palette:** perforated hardboard (`#b4895a`, holes drawn in CSS with no image assets), tool black, white paint where forms and loan details live, and safety yellow reserved for actions and active states. Overdue is the board's one alarm: a yellow and black hazard stripe.
- **Type:** Big Shoulders Stencil for anything "painted on the board" (tagline, titles, tool names) and Archivo for the interface.
- **Loans:** each loan shows a date rail with a marker on today, and the n8n activity log underneath.
- **Docs:** the full system (tokens, rules, components) is recorded in [`DESIGN.md`](DESIGN.md). [`PRODUCT.md`](PRODUCT.md) holds the product context it was designed against.

It is a single light theme on purpose (the world is a physical board). It follows the `prefers-reduced-motion` setting, and text contrast is at least 5:1.

---

## What was tested

**Automated** (`npm test`: Vitest + `convex-test`, 31 tests, runs in CI):

- **RBAC:** non-owners can't edit or delete listings; admins can remove any (and it is audited); only the lender approves, declines or returns; only the borrower cancels; admin queries and mutations reject regular users; `ADMIN_EMAILS` ignores unverified emails; signed-out callers get nothing private.
- **Loan state machine:** valid transitions, final states, date validation, and two overlapping requests approved *concurrently* (exactly one succeeds).
- **Abuse limits:** the cancel → re-request loop stops at 3 per tool per day; listing creation is capped; rejected calls don't consume quota.
- **HTTP endpoints:** unsigned, forged, wrong-key, stale and tampered requests get 401; oversized bodies get 413 by *byte* count (multi-byte characters) and from a lying `Content-Length`.
- **Pagination:** 250 overdue loans with 230 already reminded: following the cursor finds exactly the 20 remaining. 250 newer deleted tools don't hide an older active one. Page size is capped.
- **Claims:** 5 concurrent claimants give exactly one `granted`; release → re-claim; complete → `duplicate`; expired lease can be taken over; a failed reminder releases its claim; malformed or unknown keys get 422.
- **Outbox:** the request is HMAC-signed and verifiable; on success the payload is cleared; 5 failures mark it `failed`, visible in admin health, and an admin can retry; the sweeper re-queues stuck deliveries; payloads never include the note, the counterpart's email or identity tokens.

The suite was checked against deliberate regressions (removing the owner check, the `busy` branch, or the byte limit), and each one makes the relevant test fail.

**Live** (local Convex + the Docker n8n/Mailpit stack, acting as users via `npx convex run --identity`):

- Request → signed webhook → claim → email → claim `done`. Replaying the same event 3× concurrently → three `duplicate` responses, still one email.
- Three concurrent executions of an *unsent* event → one 200, two 409s, one email. Convex's own retry then came back as `duplicate`.
- SMTP down → n8n retries → claim released → *Stop and Error* → error workflow → `workflow_error` in Convex → SMTP back → Convex retry delivers.
- 130 overdue loans → the reminder workflow loops over two pages → 130 emails, 130 write-backs. A second run sends 0.

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm audit` (0 vulnerabilities; `minimatch` is pinned through `overrides` because npm's own fix would downgrade `eslint-config-next`) all pass.

**Manual:** the full flow was clicked through locally with two real Clerk accounts: list a tool, request it, approve, and receive both emails in Mailpit. There are no automated browser tests yet (see below).

---

## What I'd change for production

**Infrastructure**
- n8n in queue mode on Postgres (not SQLite) behind HTTPS, with `N8N_ENCRYPTION_KEY` pinned and backed up, basic auth/SSO on the editor, and the webhook path behind a WAF.
- A real email provider (SES or Postmark) with SPF/DKIM/DMARC. Bounce and complaint webhooks would feed back into Convex to mark bad addresses.
- Secrets in a manager (AWS Secrets Manager or Doppler), injected into Convex env and n8n via n8n's external secrets. A **rotation scheme** with two accepted keys during rollover (e.g. `kid` in the signature header).

**Security**
- Replace the `$env` + `require('crypto')` Code-node approach with a credential-backed signing step or n8n's built-in webhook header auth plus HMAC. Then `N8N_BLOCK_ENV_ACCESS_IN_NODE` can go back to `true`.
- Rate limit the HTTP endpoints too, by source (Convex can't see client IPs well; put a WAF or API gateway in front). Tune the mutation limits from real usage, and consider per-IP limits on sign-up through Clerk.
- Add a nonce replay cache on the Convex side, not only the timestamp window plus idempotent writes.
- Move roles to Clerk organisations or roles if the product grows multiple neighbourhoods, while still enforcing them in Convex. Add a Clerk webhook to sync profile changes and handle user deletion (GDPR erasure across `users`, loans and outbox).

**Data, scale and UX**
- Paginate the remaining lists (requests, incoming and admin views currently show the newest 100–300) and denormalise availability onto `tools` so "Available now" can be an index instead of a per-page filter. Add retention jobs for `automationEvents`, `automationClaims`, `rateLimits` and `auditLog`.
- Per-user timezones for "overdue". Today it is UTC days.
- In-app messaging so pickup can be arranged without exposing contact details.

**Quality**
- Extend the tests: Playwright for the main UI flows with Clerk test users, and a CI job that boots n8n in Docker, imports the workflows and runs them against a seeded Convex (the live checks above, automated).
- Observability: Sentry on the frontend, log streaming from Convex to Datadog, alerts on `failed` deliveries and workflow errors.
