import { describe, expect, test } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import { signBody } from "../convex/lib/hmac";
import { as, isoDay, listTool, setup, signedPost, type T } from "./helpers";

async function overdueLoan(t: T, n = 1) {
  const alice = await as(t, "Alice");
  await as(t, "Bob");
  const toolId = await listTool(alice);
  const ids = await t.run(async (ctx) => {
    const lender = (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "alice@example.com")).unique())!;
    const borrower = (await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", "bob@example.com")).unique())!;
    const out: Id<"loans">[] = [];
    for (let i = 0; i < n; i++) {
      out.push(
        await ctx.db.insert("loans", {
          toolId,
          lenderId: lender._id,
          borrowerId: borrower._id,
          startDate: isoDay(-10),
          endDate: isoDay(-3 - (i % 5)),
          status: "approved",
        }),
      );
    }
    return out;
  });
  return ids;
}

describe("signature checks on n8n → Convex", () => {
  test("unsigned, forged, wrong-key and stale requests are rejected", async () => {
    const t = setup();
    const unsigned = await t.fetch("/n8n/overdue-loans", { method: "POST", body: "{}" });
    expect(unsigned.status).toBe(401);

    const forged = await t.fetch("/n8n/overdue-loans", {
      method: "POST",
      headers: { "x-lendloop-timestamp": `${Math.floor(Date.now() / 1000)}`, "x-lendloop-signature": "sha256=00" },
      body: "{}",
    });
    expect(forged.status).toBe(401);

    expect((await signedPost(t, "/n8n/overdue-loans", {}, { secret: "wrong" })).status).toBe(401);
    expect((await signedPost(t, "/n8n/overdue-loans", {}, { now: Date.now() - 10 * 60_000 })).status).toBe(401);
    expect((await signedPost(t, "/n8n/overdue-loans", {})).status).toBe(200);
  });

  test("a signed body that is tampered with fails", async () => {
    const t = setup();
    const { timestamp, signature } = await signBody("test-inbound-secret", '{"asOf":"2026-01-01"}');
    const res = await t.fetch("/n8n/overdue-loans", {
      method: "POST",
      headers: { "x-lendloop-timestamp": timestamp, "x-lendloop-signature": signature },
      body: '{"asOf":"2026-01-02"}',
    });
    expect(res.status).toBe(401);
  });

  test("oversized bodies are refused by byte count, before verification", async () => {
    const t = setup();
    // 6,000 three-byte characters = 18,000 bytes but only 6,000 JS chars.
    const res = await signedPost(t, "/n8n/workflow-error", { workflowName: "x", message: "€".repeat(6000) });
    expect(res.status).toBe(413);

    const lying = await t.fetch("/n8n/overdue-loans", {
      method: "POST",
      headers: { "content-length": "999999" },
      body: "{}",
    });
    expect(lying.status).toBe(413);
  });
});

describe("overdue reminders", () => {
  test("pages past any number of already-reminded loans", async () => {
    const t = setup();
    // 250 overdue loans; mark the first 230 (in index order) as reminded today.
    await overdueLoan(t, 250);
    const asOf = isoDay(0);
    const ordered = await t.run((ctx) =>
      ctx.db
        .query("loans")
        .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", asOf))
        .collect(),
    );
    await t.run(async (ctx) => {
      for (const l of ordered.slice(0, 230)) {
        await ctx.db.insert("automationEvents", {
          loanId: l._id,
          kind: "reminder_sent",
          source: "n8n",
          detail: "x",
          idempotencyKey: `reminder:${l._id}:${asOf}`,
        });
      }
    });

    // Follow cursors exactly like the n8n loop does.
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let calls = 0; calls < 20; calls++) {
      const res = await signedPost(t, "/n8n/overdue-loans", { asOf, ...(cursor ? { cursor } : {}) });
      const body = await res.json();
      for (const l of body.loans) seen.add(l.loanId);
      if (body.isDone) break;
      cursor = body.cursor;
    }
    expect(seen.size).toBe(20);
    expect([...seen].sort()).toEqual(ordered.slice(230).map((l) => l._id).sort());
  });

  test("returns only the fields the email needs", async () => {
    const t = setup();
    await overdueLoan(t);
    const body = await (await signedPost(t, "/n8n/overdue-loans", {})).json();
    expect(body.loans).toHaveLength(1);
    expect(Object.keys(body.loans[0]).sort()).toEqual(
      ["borrower", "daysOverdue", "dueDate", "lender", "loanId", "reminderKey", "toolName"].sort(),
    );
    expect(body.loans[0].lender).toEqual({ firstName: "Alice" });
  });

  test("write-back is idempotent and checks the key belongs to the loan", async () => {
    const t = setup();
    const [loanId] = await overdueLoan(t);
    const reminderKey = `reminder:${loanId}:${isoDay(0)}`;

    const first = await signedPost(t, "/n8n/reminder-status", { loanId, reminderKey, status: "sent" });
    expect(await first.json()).toMatchObject({ ok: true, duplicate: false });
    const replay = await signedPost(t, "/n8n/reminder-status", { loanId, reminderKey, status: "sent" });
    expect(await replay.json()).toMatchObject({ ok: true, duplicate: true });

    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan!.reminderCount).toBe(1);

    const mismatched = await signedPost(t, "/n8n/reminder-status", {
      loanId,
      reminderKey: "reminder:someoneelse:2026-01-01",
      status: "sent",
    });
    expect(mismatched.status).toBe(422);

    // Once reminded today, the loan no longer shows up.
    const body = await (await signedPost(t, "/n8n/overdue-loans", {})).json();
    expect(body.loans).toHaveLength(0);
  });
});

describe("atomic send claims", () => {
  test("exactly one concurrent claimant wins", async () => {
    const t = setup();
    const [loanId] = await overdueLoan(t);
    const key = `reminder:${loanId}:${isoDay(0)}`;

    const results = await Promise.all(
      Array.from({ length: 5 }, () => signedPost(t, "/n8n/claim", { key }).then((r) => r.json())),
    );
    expect(results.filter((r) => r.result === "granted")).toHaveLength(1);
    expect(results.filter((r) => r.result === "busy")).toHaveLength(4);
  });

  test("release lets a retry claim; complete makes it a duplicate", async () => {
    const t = setup();
    const [loanId] = await overdueLoan(t);
    const key = `reminder:${loanId}:${isoDay(0)}`;
    const claim = async () => (await (await signedPost(t, "/n8n/claim", { key })).json()).result;

    expect(await claim()).toBe("granted");
    await signedPost(t, "/n8n/release", { key });
    expect(await claim()).toBe("granted");
    await signedPost(t, "/n8n/complete", { key });
    expect(await claim()).toBe("duplicate");
  });

  test("an expired lease (crashed holder) can be taken over", async () => {
    const t = setup();
    const [loanId] = await overdueLoan(t);
    const key = `reminder:${loanId}:${isoDay(0)}`;
    await signedPost(t, "/n8n/claim", { key });
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("automationClaims").withIndex("by_key", (q) => q.eq("key", key)).unique())!;
      await ctx.db.patch(row._id, { leaseUntil: Date.now() - 1 });
    });
    expect((await (await signedPost(t, "/n8n/claim", { key })).json()).result).toBe("granted");
  });

  test("a failed reminder write-back releases the claim for the next run", async () => {
    const t = setup();
    const [loanId] = await overdueLoan(t);
    const reminderKey = `reminder:${loanId}:${isoDay(0)}`;
    await signedPost(t, "/n8n/claim", { key: reminderKey });
    await signedPost(t, "/n8n/reminder-status", { loanId, reminderKey, status: "failed", error: "SMTP down" });
    expect((await (await signedPost(t, "/n8n/claim", { key: reminderKey })).json()).result).toBe("granted");
  });

  test("keys must be well-formed and point at real rows", async () => {
    const t = setup();
    for (const key of ["anything", "event:../../etc", "reminder:abc:2026-01-01", "event:" + "a".repeat(32)]) {
      expect((await signedPost(t, "/n8n/claim", { key })).status).toBe(422);
    }
  });
});
