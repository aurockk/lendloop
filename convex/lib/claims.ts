/**
 * Atomic send reservations for n8n.
 *
 * Before n8n sends an email it calls POST /n8n/claim with a key. Convex
 * mutations are serializable, so when two executions race for the same key
 * exactly one gets "granted"; the other sees "busy" (still in flight) or
 * "duplicate" (already sent). This replaces check-then-act dedupe in n8n
 * workflow static data, which can't be made atomic.
 *
 * After sending, n8n calls /n8n/complete (or /n8n/release on failure, so a
 * retry can claim again). If the holder crashes, the lease expires.
 *
 * Remaining gap, inherent to SMTP: if n8n crashes *after* the SMTP server
 * accepted the email but *before* /complete, the lease expires and a retry
 * re-sends. That's at-least-once, with a window of one crashed execution.
 */
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const CLAIM_LEASE_MS = 2 * 60_000;

export type ClaimResult = "granted" | "busy" | "duplicate";

/** Only well-formed keys that point at real rows can be claimed. */
export async function validClaimKey(ctx: MutationCtx, key: string): Promise<boolean> {
  const event = /^event:([a-z0-9]{20,40})$/.exec(key);
  if (event) {
    const id = ctx.db.normalizeId("webhookDeliveries", event[1]);
    return !!id && !!(await ctx.db.get(id));
  }
  const reminder = /^reminder:([a-z0-9]{20,40}):\d{4}-\d{2}-\d{2}$/.exec(key);
  if (reminder) {
    const id = ctx.db.normalizeId("loans", reminder[1]);
    return !!id && !!(await ctx.db.get(id as Id<"loans">));
  }
  return false;
}

async function find(ctx: MutationCtx, key: string) {
  return ctx.db
    .query("automationClaims")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

export async function claim(ctx: MutationCtx, key: string, now = Date.now()): Promise<ClaimResult> {
  const row = await find(ctx, key);
  if (!row) {
    await ctx.db.insert("automationClaims", { key, state: "claimed", leaseUntil: now + CLAIM_LEASE_MS });
    return "granted";
  }
  if (row.state === "done") return "duplicate";
  if (row.leaseUntil > now) return "busy";
  await ctx.db.patch(row._id, { leaseUntil: now + CLAIM_LEASE_MS }); // previous holder died
  return "granted";
}

export async function complete(ctx: MutationCtx, key: string) {
  const row = await find(ctx, key);
  if (row) await ctx.db.patch(row._id, { state: "done" });
  else await ctx.db.insert("automationClaims", { key, state: "done", leaseUntil: 0 });
}

export async function release(ctx: MutationCtx, key: string) {
  const row = await find(ctx, key);
  if (row && row.state === "claimed") await ctx.db.delete(row._id);
}
