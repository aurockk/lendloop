/**
 * Convex -> n8n "loan event" notifications, using a transactional outbox:
 *
 * 1. The mutation that changes a loan calls `enqueueLoanEvent`, which inserts a
 *    `webhookDeliveries` row in the *same transaction*. If the state change
 *    commits, the notification is guaranteed to be attempted; if it rolls back,
 *    nothing is sent.
 * 2. A scheduled action POSTs the signed payload to n8n.
 * 3. Failures retry with exponential backoff; after MAX_ATTEMPTS the row is
 *    marked `failed` and surfaces in the admin "Automation health" panel.
 *
 * n8n can de-duplicate on `eventId` because retries reuse the same id.
 */
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { audit, requireAdmin } from "./lib/auth";
import { signBody, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./lib/hmac";
import type { Infer } from "convex/values";
import type { loanEvent } from "./schema";

type LoanEvent = Infer<typeof loanEvent>;

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [10_000, 60_000, 5 * 60_000, 30 * 60_000];
// n8n answers after the email is sent (with its own SMTP retries), so allow time.
const REQUEST_TIMEOUT_MS = 30_000;
// A pending delivery this far past its due time is assumed lost (e.g. the
// action was killed mid-flight) and gets re-queued by the cron sweeper.
const STUCK_AFTER_MS = 5 * 60_000;

// Who needs to hear about each event.
const RECIPIENT: Record<LoanEvent, "lender" | "borrower"> = {
  "request.created": "lender",
  "request.cancelled": "lender",
  "request.approved": "borrower",
  "request.declined": "borrower",
  "loan.returned": "borrower",
};

const TIMELINE_LABEL: Record<LoanEvent, string> = {
  "request.created": "Lender notified of new request",
  "request.cancelled": "Lender notified of cancellation",
  "request.approved": "Borrower notified of approval",
  "request.declined": "Borrower notified of decline",
  "loan.returned": "Borrower sent return confirmation",
};

async function buildPayload(ctx: MutationCtx, loanId: Id<"loans">, event: LoanEvent) {
  const loan = (await ctx.db.get(loanId))!;
  const [tool, lender, borrower] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.lenderId),
    ctx.db.get(loan.borrowerId),
  ]);
  const recipient = RECIPIENT[event] === "lender" ? lender : borrower;
  const counterpart = RECIPIENT[event] === "lender" ? borrower : lender;

  // Data minimisation: only what the email template needs. No user ids, no
  // tokenIdentifiers, no counterpart email, no free-text note.
  const payload = {
    event,
    occurredAt: new Date().toISOString(),
    loan: { id: loan._id, status: loan.status, startDate: loan.startDate, endDate: loan.endDate },
    tool: { name: tool?.name ?? "a tool" },
    recipient: { email: recipient?.email ?? null, firstName: recipient?.firstName ?? null },
    counterpart: { firstName: counterpart?.firstName ?? "A neighbour" },
  };
  return payload;
}

export async function enqueueLoanEvent(ctx: MutationCtx, loanId: Id<"loans">, event: LoanEvent) {
  const payload = await buildPayload(ctx, loanId, event);
  if (!payload.recipient.email) {
    await ctx.db.insert("webhookDeliveries", {
      loanId,
      event,
      status: "skipped",
      attempts: 0,
      lastError: "recipient has no email on file",
    });
    return;
  }

  const deliveryId = await ctx.db.insert("webhookDeliveries", {
    loanId,
    event,
    payload,
    status: "pending",
    attempts: 0,
    nextAttemptAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.webhooks.deliver, { deliveryId });
}

export const getDelivery = internalQuery({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: (ctx, { deliveryId }) => ctx.db.get(deliveryId),
});

export const deliver = internalAction({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const delivery = await ctx.runQuery(internal.webhooks.getDelivery, { deliveryId });
    if (!delivery || delivery.status !== "pending") return;

    const url = process.env.N8N_LOAN_EVENTS_WEBHOOK_URL;
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!url || !secret) {
      await ctx.runMutation(internal.webhooks.recordAttempt, {
        deliveryId,
        ok: false,
        error: "N8N_LOAN_EVENTS_WEBHOOK_URL / N8N_WEBHOOK_SECRET not configured",
        terminal: true,
      });
      return;
    }

    const body = JSON.stringify({ eventId: deliveryId, ...delivery.payload });
    const { timestamp, signature } = await signBody(secret, body);

    let error: string | null = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signature,
          "x-lendloop-event-id": deliveryId,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) error = `n8n responded ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    await ctx.runMutation(internal.webhooks.recordAttempt, {
      deliveryId,
      ok: error === null,
      error: error ?? undefined,
      terminal: false,
    });
  },
});

export const recordAttempt = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    ok: v.boolean(),
    error: v.optional(v.string()),
    terminal: v.boolean(),
  },
  handler: async (ctx, { deliveryId, ok, error, terminal }) => {
    const d = await ctx.db.get(deliveryId);
    if (!d || d.status !== "pending") return;
    const attempts = d.attempts + 1;

    if (ok) {
      // Drop the PII snapshot once it has served its purpose.
      await ctx.db.patch(deliveryId, {
        status: "delivered",
        attempts,
        deliveredAt: Date.now(),
        payload: undefined,
        lastError: undefined,
      });
      await ctx.db.insert("automationEvents", {
        loanId: d.loanId,
        kind: "notification_sent",
        source: "convex",
        detail: TIMELINE_LABEL[d.event],
      });
      return;
    }

    if (terminal || attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(deliveryId, { status: "failed", attempts, lastError: error, payload: undefined });
      await ctx.db.insert("automationEvents", {
        loanId: d.loanId,
        kind: "notification_failed",
        source: "convex",
        detail: `Notification failed after ${attempts} attempt(s): ${error ?? "unknown error"}`,
      });
      console.error(`[webhooks] delivery ${deliveryId} failed permanently: ${error}`);
      return;
    }

    const delay = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
    await ctx.db.patch(deliveryId, { attempts, lastError: error, nextAttemptAt: Date.now() + delay });
    console.warn(`[webhooks] delivery ${deliveryId} attempt ${attempts} failed (${error}); retry in ${delay}ms`);
    await ctx.scheduler.runAfter(delay, internal.webhooks.deliver, { deliveryId });
  },
});

/** Admin: re-queue a permanently failed delivery (payload rebuilt from current data). */
export const retryDelivery = mutation({
  args: { deliveryId: v.id("webhookDeliveries") },
  handler: async (ctx, { deliveryId }) => {
    const admin = await requireAdmin(ctx);
    const d = await ctx.db.get(deliveryId);
    if (!d || d.status !== "failed") throw new ConvexError("Only failed deliveries can be retried");
    const payload = await buildPayload(ctx, d.loanId, d.event);
    await ctx.db.patch(deliveryId, {
      status: "pending",
      attempts: 0,
      payload,
      lastError: undefined,
      nextAttemptAt: Date.now(),
    });
    await audit(ctx, admin, "delivery.retried", "webhookDeliveries", deliveryId);
    await ctx.scheduler.runAfter(0, internal.webhooks.deliver, { deliveryId });
  },
});

/** Cron: re-queue pending deliveries whose scheduled attempt never reported back. */
export const sweepStuck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - STUCK_AFTER_MS;
    const stuck = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_status", (q) => q.eq("status", "pending").lt("nextAttemptAt", cutoff))
      .take(50);
    for (const d of stuck) {
      await ctx.db.patch(d._id, { nextAttemptAt: Date.now() + REQUEST_TIMEOUT_MS * 2 });
      await ctx.scheduler.runAfter(0, internal.webhooks.deliver, { deliveryId: d._id });
    }
    if (stuck.length) console.warn(`[webhooks] re-queued ${stuck.length} stuck deliveries`);
  },
});
