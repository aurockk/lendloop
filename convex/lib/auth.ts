import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * All authorization decisions happen here, server-side. The UI hides buttons
 * for convenience only; every public mutation re-checks role and ownership.
 */

export async function getViewer(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireViewer(ctx: QueryCtx): Promise<Doc<"users">> {
  const viewer = await getViewer(ctx);
  if (!viewer) throw new ConvexError("Not signed in");
  return viewer;
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Mutations upsert the user row from the verified JWT so it always exists. */
export async function ensureViewer(ctx: MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Not signed in");

  const email = identity.email?.toLowerCase();
  const firstName = identity.givenName ?? identity.name?.split(" ")[0] ?? undefined;
  // Only a *verified* email may grant admin through the ADMIN_EMAILS bootstrap list.
  const bootstrapAdmin =
    !!email && identity.emailVerified === true && adminEmails().includes(email);

  const existing = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();

  if (existing) {
    const patch: Partial<Doc<"users">> = {};
    if (email && email !== existing.email) patch.email = email;
    if (firstName && firstName !== existing.firstName) patch.firstName = firstName;
    if (bootstrapAdmin && existing.role !== "admin") patch.role = "admin";
    if (Object.keys(patch).length) await ctx.db.patch(existing._id, patch);
    return { ...existing, ...patch };
  }

  const id = await ctx.db.insert("users", {
    tokenIdentifier: identity.tokenIdentifier,
    email,
    firstName,
    role: bootstrapAdmin ? "admin" : "user",
    trustedLender: false,
  });
  return (await ctx.db.get(id))!;
}

export async function requireAdmin(ctx: MutationCtx): Promise<Doc<"users">> {
  const viewer = await ensureViewer(ctx);
  if (viewer.role !== "admin") throw new ConvexError("Admins only");
  return viewer;
}

export async function audit(
  ctx: MutationCtx,
  actor: Doc<"users">,
  action: string,
  targetTable: string,
  targetId: string,
  detail?: string,
) {
  await ctx.db.insert("auditLog", { actorId: actor._id, action, targetTable, targetId, detail });
}
