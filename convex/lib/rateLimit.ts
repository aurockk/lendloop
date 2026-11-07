import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";

/**
 * Fixed-window rate limiter stored in Convex. Mutations are serializable
 * transactions, so two concurrent calls can't both slip under the limit: one
 * of them is retried by Convex and sees the other's increment.
 */
export const LIMITS = {
  // Every request and cancellation emails someone, so these bound notification spam.
  loanRequest: { max: 10, windowMs: 60 * 60_000 },
  loanRequestPerTool: { max: 3, windowMs: 24 * 60 * 60_000 }, // breaks cancel→re-request loops
  loanCancel: { max: 10, windowMs: 60 * 60_000 },
  toolCreate: { max: 10, windowMs: 24 * 60 * 60_000 },
} as const;

export const MAX_ACTIVE_LISTINGS = 50;

export async function rateLimit(
  ctx: MutationCtx,
  key: string,
  { max, windowMs }: { max: number; windowMs: number },
) {
  const now = Date.now();
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

  if (!row || now - row.windowStart >= windowMs) {
    if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
    else await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
    return;
  }
  if (row.count >= max) {
    const minutes = Math.ceil((row.windowStart + windowMs - now) / 60_000);
    throw new ConvexError(`Too many attempts. Try again in ${minutes} min.`);
  }
  await ctx.db.patch(row._id, { count: row.count + 1 });
}
