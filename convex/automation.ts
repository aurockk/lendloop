/**
 * Internal functions backing the n8n -> Convex HTTP endpoints (see http.ts),
 * plus the admin "Automation health" query.
 */
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { requireViewer } from "./lib/auth";
import { claim, complete, release, validClaimKey } from "./lib/claims";
import { daysBetween } from "./lib/dates";

export const reminderKey = (loanId: string, asOf: string) => `reminder:${loanId}:${asOf}`;

/**
 * One page of approved, un-returned loans whose end date is before `asOf`,
 * minus those already reminded for that day. Pagination walks the index, and
 * filtering happens per page, so already-reminded loans can never hide the
 * ones behind them (the HTTP endpoint keeps paging until it finds work).
 * Returns only what the reminder email needs.
 */
export const overdueLoansPage = internalQuery({
  args: { asOf: v.string(), cursor: v.union(v.string(), v.null()), numItems: v.number() },
  handler: async (ctx, { asOf, cursor, numItems }) => {
    const page = await ctx.db
      .query("loans")
      .withIndex("by_status_end", (q) => q.eq("status", "approved").lt("endDate", asOf))
      .paginate({ cursor, numItems });

    const loans = [];
    for (const loan of page.page) {
      const key = reminderKey(loan._id, asOf);
      const already = await ctx.db
        .query("automationEvents")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", key))
        .first();
      if (already?.kind === "reminder_sent") continue;

      const [borrower, tool, lender] = await Promise.all([
        ctx.db.get(loan.borrowerId),
        ctx.db.get(loan.toolId),
        ctx.db.get(loan.lenderId),
      ]);
      if (!borrower?.email) continue;
      loans.push({
        loanId: loan._id,
        reminderKey: key,
        borrower: { email: borrower.email, firstName: borrower.firstName ?? null },
        lender: { firstName: lender?.firstName ?? "your neighbour" },
        toolName: tool?.name ?? "the tool",
        dueDate: loan.endDate,
        daysOverdue: daysBetween(loan.endDate, asOf),
      });
    }
    return { loans, continueCursor: page.continueCursor, isDone: page.isDone };
  },
});

/** n8n reserves a send before emailing. See lib/claims.ts. */
export const claimSend = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    if (!(await validClaimKey(ctx, key))) return { ok: false as const, reason: "unknown key" };
    return { ok: true as const, result: await claim(ctx, key) };
  },
});

export const finishSend = internalMutation({
  args: { key: v.string(), outcome: v.union(v.literal("sent"), v.literal("failed")) },
  handler: async (ctx, { key, outcome }) => {
    if (!(await validClaimKey(ctx, key))) return { ok: false as const, reason: "unknown key" };
    if (outcome === "sent") await complete(ctx, key);
    else await release(ctx, key);
    return { ok: true as const };
  },
});

/**
 * Idempotent write-back. The same reminderKey may arrive multiple times
 * (n8n retries, replays); only the first "sent" is recorded. A "failed"
 * result can later be superseded by a "sent" for the same key.
 */
export const recordReminder = internalMutation({
  args: {
    loanId: v.string(),
    reminderKey: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const loanId = ctx.db.normalizeId("loans", args.loanId);
    if (!loanId) return { ok: false as const, reason: "unknown loan" };
    if (!args.reminderKey.startsWith(`reminder:${loanId}:`)) {
      return { ok: false as const, reason: "reminderKey does not match loan" };
    }
    const loan = await ctx.db.get(loanId);
    if (!loan) return { ok: false as const, reason: "unknown loan" };

    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.reminderKey))
      .first();

    // The write-back also settles the send reservation taken via /n8n/claim.
    if (args.status === "sent") await complete(ctx, args.reminderKey);
    else await release(ctx, args.reminderKey);

    if (existing?.kind === "reminder_sent") return { ok: true as const, duplicate: true };

    if (args.status === "sent") {
      if (existing) await ctx.db.delete(existing._id); // supersede an earlier failure
      await ctx.db.insert("automationEvents", {
        loanId,
        kind: "reminder_sent",
        source: "n8n",
        detail: "Overdue reminder emailed to borrower",
        idempotencyKey: args.reminderKey,
      });
      await ctx.db.patch(loanId, {
        lastReminderAt: Date.now(),
        reminderCount: (loan.reminderCount ?? 0) + 1,
      });
      return { ok: true as const, duplicate: false };
    }

    if (existing) return { ok: true as const, duplicate: true };
    await ctx.db.insert("automationEvents", {
      loanId,
      kind: "reminder_failed",
      source: "n8n",
      detail: `Overdue reminder failed: ${(args.error ?? "unknown error").slice(0, 200)}`,
      idempotencyKey: args.reminderKey,
    });
    return { ok: true as const, duplicate: false };
  },
});

/** Called by the n8n error workflow. Idempotent on execution id. */
export const recordWorkflowError = internalMutation({
  args: {
    workflowName: v.string(),
    executionId: v.optional(v.string()),
    nodeName: v.optional(v.string()),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const key = args.executionId ? `wf-error:${args.executionId}` : undefined;
    if (key) {
      const existing = await ctx.db
        .query("automationEvents")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", key))
        .first();
      if (existing) return { ok: true, duplicate: true };
    }
    const where = args.nodeName ? ` at "${args.nodeName.slice(0, 80)}"` : "";
    await ctx.db.insert("automationEvents", {
      kind: "workflow_error",
      source: "n8n",
      detail: `${args.workflowName.slice(0, 80)} failed${where}: ${args.message.slice(0, 300)}`,
      idempotencyKey: key,
    });
    return { ok: true, duplicate: false };
  },
});

export const health = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.role !== "admin") throw new ConvexError("Admins only");
    const failed = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .order("desc")
      .take(20);
    const pending = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(50);
    const errors = await ctx.db
      .query("automationEvents")
      .withIndex("by_kind", (q) => q.eq("kind", "workflow_error"))
      .order("desc")
      .take(20);
    const reminderFailures = await ctx.db
      .query("automationEvents")
      .withIndex("by_kind", (q) => q.eq("kind", "reminder_failed"))
      .order("desc")
      .take(20);
    return {
      pendingCount: pending.length,
      failedDeliveries: failed.map((d) => ({
        _id: d._id,
        event: d.event,
        attempts: d.attempts,
        lastError: d.lastError ?? null,
        at: d._creationTime,
      })),
      workflowErrors: errors.map((e) => ({ _id: e._id, detail: e.detail, at: e._creationTime })),
      reminderFailures: reminderFailures.map((e) => ({ _id: e._id, detail: e.detail, at: e._creationTime })),
    };
  },
});
