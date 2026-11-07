# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Two audiences, weighted equally:
- **Neighbours** in one neighbourhood who lend and borrow household tools. Lenders list tools and decide on requests; borrowers browse, request a date range, and return on time. Use is occasional and task-shaped: find a tool, ask, approve, mark returned.
- **Reviewers at Fluence International** evaluating this as a full-stack take-home (Step 1 of 3). They judge code structure, security thinking, UX and practicality, n8n integration design, and documentation, and they see many generic submissions.

## Product Purpose
LendLoop is a neighbourhood tool-lending board with automated workflows. Success: a neighbour can list a tool or get one lent to them in a few clicks, gets emailed at each step, and is reminded when a loan is overdue. For reviewers, success is understanding what it does within seconds and seeing deliberate craft.

## Positioning
Lending between neighbours, run by real automation: every request, decision, return and overdue loan produces a signed, deduplicated notification through n8n, and each loan shows its own automation timeline ("Reminder sent 2 days ago").

## Operating Context
- Public landing page: tagline, read-only list of tools (name and category only, no owner details), sign-in.
- Signed-in views: All tools (filter by category, availability), My listings, My requests, Incoming requests, Admin.
- Roles: `user` and `admin` (remove any listing, view all loans, mark a lender "Trusted Lender", automation health).
- Loan states: pending, approved, declined, cancelled, returned; "overdue" is derived (approved and past end date).
- Emails arrive via n8n (locally captured in Mailpit).

## Capabilities and Constraints
- Stack is fixed by the assignment: Next.js 16 App Router, Clerk, Convex, n8n, TypeScript. Styling is Tailwind v4.
- All functionality, screens, roles and flows must be preserved; redesign is visual.
- Interface copy stays in English.
- Must stay fast: no heavy animation or large assets.
- Must stay easy to operate: finding a tool and approving a request cannot get harder.
- Tool categories: Power tools, Hand tools, Garden, Ladders & access, Cleaning, Camping & outdoor, Kitchen, Other. Conditions: Like new, Good, Fair, Worn.
- Data minimisation is a product rule: public views never show owners; signed-in views show a lender's first name only.

## Brand Commitments
- Name: **LendLoop** (fictional company from the assignment).
- Tagline: **"Borrow what you need. Lend what you don't."** (given by the assignment).
- Must not read as generic SaaS, as childish, or as experimental to the point of hurting usability.

## Evidence on Hand
- No real users, testimonials, photos, or usage statistics exist. Do not invent counts, testimonials, or neighbourhood names presented as real.
- Tool data is whatever users list; the landing list may be empty.

## Product Principles
1. Neighbourly, not corporate: it should feel like the neighbourhood's own board, not a startup's dashboard.
2. Privacy by default: show the minimum about people.
3. The automation is the proof: make notifications and reminders visible where they matter.
4. Clarity before character: personality never costs a task.
