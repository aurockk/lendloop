import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { MAX_ACTIVE_LISTINGS } from "./lib/rateLimit";
import { audit, ensureViewer, getViewer, requireAdmin, requireViewer } from "./lib/auth";

/** Called by the client right after sign-in so the user row exists. */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await ensureViewer(ctx);
    return me._id;
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    return {
      _id: viewer._id,
      firstName: viewer.firstName ?? null,
      role: viewer.role,
      trustedLender: viewer.trustedLender,
      hasEmail: !!viewer.email,
    };
  },
});

/** Admin: people who have listed at least one tool, for the Trusted Lender toggle. */
export const adminListLenders = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.role !== "admin") throw new ConvexError("Admins only");
    const users = await ctx.db.query("users").collect();
    const rows = await Promise.all(
      users.map(async (u) => {
        const tools = await ctx.db
          .query("tools")
          .withIndex("by_owner", (q) => q.eq("ownerId", u._id).eq("removedAt", undefined))
          .take(MAX_ACTIVE_LISTINGS);
        return {
          _id: u._id,
          firstName: u.firstName ?? "(no name)",
          email: u.email ?? null,
          role: u.role,
          trustedLender: u.trustedLender,
          activeListings: tools.length,
        };
      }),
    );
    return rows.filter((r) => r.activeListings > 0 || r.trustedLender);
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    const admin = await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new ConvexError("User not found");
    await ctx.db.patch(userId, { trustedLender: trusted });
    await audit(ctx, admin, trusted ? "lender.trusted" : "lender.untrusted", "users", userId);
  },
});

/**
 * Ops-only escape hatch, not callable from clients:
 *   npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
 */
export const setRole = internalMutation({
  args: { email: v.string(), role: v.union(v.literal("user"), v.literal("admin")) },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
      .unique();
    if (!user) throw new ConvexError("No user with that email has signed in yet");
    await ctx.db.patch(user._id, { role });
    return user._id;
  },
});
