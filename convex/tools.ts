import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { audit, ensureViewer, getViewer } from "./lib/auth";
import type { Category } from "./lib/constants";
import { todayISO } from "./lib/dates";
import { LIMITS, MAX_ACTIVE_LISTINGS, rateLimit } from "./lib/rateLimit";
import { category, condition } from "./schema";
import { enqueueLoanEvent } from "./webhooks";

const MAX_PAGE = 50;
const clampPage = <T extends { numItems: number }>(opts: T): T => ({
  ...opts,
  numItems: Math.max(1, Math.min(opts.numItems, MAX_PAGE)),
});

function clean(input: { name: string; description: string }) {
  const name = input.name.trim();
  const description = input.description.trim();
  if (name.length < 2 || name.length > 80) throw new ConvexError("Name must be 2–80 characters");
  if (description.length > 500) throw new ConvexError("Description must be 500 characters or less");
  return { name, description };
}

async function availability(ctx: QueryCtx, toolId: Id<"tools">) {
  const today = todayISO();
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
  // Anything approved that has started and isn't returned means the tool is out.
  const out = approved.find((l) => l.startDate <= today);
  const upcoming = approved
    .filter((l) => l.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((l) => ({ startDate: l.startDate, endDate: l.endDate }));
  return {
    available: !out,
    onLoanUntil: out?.endDate ?? null,
    overdue: !!out && out.endDate < today,
    upcoming,
  };
}

const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" };

/** Active tools, newest first. Removed tools are excluded by the index itself. */
function activeTools(ctx: QueryCtx, cat?: Category) {
  return cat
    ? ctx.db
        .query("tools")
        .withIndex("by_category_active", (q) => q.eq("category", cat).eq("removedAt", undefined))
        .order("desc")
    : ctx.db
        .query("tools")
        .withIndex("by_active", (q) => q.eq("removedAt", undefined))
        .order("desc");
}

/** Public, unauthenticated: name and category only. No owner details, ever. */
export const publicList = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await activeTools(ctx).paginate(clampPage(paginationOpts));
    return {
      ...result,
      page: result.page.map((t) => ({ _id: t._id, name: t.name, category: t.category })),
    };
  },
});

/** Signed-in browse view with availability, filterable by category. */
export const list = query({
  args: {
    category: v.optional(category),
    onlyAvailable: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return EMPTY_PAGE;
    const result = await activeTools(ctx, args.category).paginate(clampPage(args.paginationOpts));

    const rows = await Promise.all(
      result.page.map(async (t) => {
        const owner = await ctx.db.get(t.ownerId);
        const myPending = await ctx.db
          .query("loans")
          .withIndex("by_tool_status", (q) => q.eq("toolId", t._id).eq("status", "pending"))
          .filter((q) => q.eq(q.field("borrowerId"), viewer._id))
          .first();
        return {
          _id: t._id,
          name: t.name,
          category: t.category,
          condition: t.condition,
          description: t.description,
          // Signed-in neighbours see a first name only; email stays server-side.
          ownerFirstName: owner?.firstName ?? "A neighbour",
          ownerTrusted: owner?.trustedLender ?? false,
          isMine: t.ownerId === viewer._id,
          hasPendingRequest: !!myPending,
          ...(await availability(ctx, t._id)),
        };
      }),
    );
    // Availability is derived, so this filter runs per page. A page may come
    // back short, but the cursor still advances and "Load more" keeps going.
    return { ...result, page: args.onlyAvailable ? rows.filter((r) => r.available) : rows };
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id).eq("removedAt", undefined))
      .order("desc")
      .take(MAX_ACTIVE_LISTINGS);
    return await Promise.all(
      tools
        .filter((t) => !t.removedAt)
        .map(async (t) => {
          const pending = await ctx.db
            .query("loans")
            .withIndex("by_tool_status", (q) => q.eq("toolId", t._id).eq("status", "pending"))
            .collect();
          return {
            _id: t._id,
            name: t.name,
            category: t.category,
            condition: t.condition,
            description: t.description,
            pendingRequests: pending.length,
            ...(await availability(ctx, t._id)),
          };
        }),
    );
  },
});

export const create = mutation({
  args: { name: v.string(), category, condition, description: v.string() },
  handler: async (ctx, args) => {
    const viewer = await ensureViewer(ctx);
    const { name, description } = clean(args);
    const active = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id).eq("removedAt", undefined))
      .take(MAX_ACTIVE_LISTINGS);
    if (active.length >= MAX_ACTIVE_LISTINGS) {
      throw new ConvexError(`You can have at most ${MAX_ACTIVE_LISTINGS} active listings`);
    }
    await rateLimit(ctx, `tool.create:${viewer._id}`, LIMITS.toolCreate);
    const id = await ctx.db.insert("tools", {
      ownerId: viewer._id,
      name,
      description,
      category: args.category,
      condition: args.condition,
    });
    await audit(ctx, viewer, "tool.created", "tools", id);
    return id;
  },
});

async function loadOwnedTool(ctx: MutationCtx, toolId: Id<"tools">, viewer: Doc<"users">) {
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.removedAt) throw new ConvexError("Tool not found");
  if (tool.ownerId !== viewer._id) throw new ConvexError("You can only change your own listings");
  return tool;
}

export const update = mutation({
  args: { toolId: v.id("tools"), name: v.string(), category, condition, description: v.string() },
  handler: async (ctx, args) => {
    const viewer = await ensureViewer(ctx);
    await loadOwnedTool(ctx, args.toolId, viewer);
    const { name, description } = clean(args);
    await ctx.db.patch(args.toolId, {
      name,
      description,
      category: args.category,
      condition: args.condition,
    });
    await audit(ctx, viewer, "tool.updated", "tools", args.toolId);
  },
});

/**
 * Owners delete their own listings; admins may remove any listing.
 * A tool that is currently lent out can't be removed by its owner.
 * Pending requests are declined (and borrowers notified).
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const viewer = await ensureViewer(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt) throw new ConvexError("Tool not found");
    const isOwner = tool.ownerId === viewer._id;
    const isAdmin = viewer.role === "admin";
    if (!isOwner && !isAdmin) throw new ConvexError("You can only remove your own listings");

    const approved = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
      .collect();
    if (approved.length > 0 && !isAdmin) {
      throw new ConvexError("This tool has an approved loan. Mark it returned first.");
    }

    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
      .collect();
    for (const loan of pending) {
      await ctx.db.patch(loan._id, { status: "declined", decidedAt: Date.now() });
      await enqueueLoanEvent(ctx, loan._id, "request.declined");
    }

    await ctx.db.patch(toolId, { removedAt: Date.now(), removedBy: viewer._id });
    await audit(ctx, viewer, isOwner ? "tool.deleted" : "tool.removed_by_admin", "tools", toolId);
  },
});
