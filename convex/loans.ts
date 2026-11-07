import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { audit, ensureViewer, getViewer, requireViewer } from "./lib/auth";
import {
  daysBetween,
  isISODate,
  MAX_ADVANCE_DAYS,
  MAX_LOAN_DAYS,
  overlaps,
  todayISO,
} from "./lib/dates";
import { LIMITS, rateLimit } from "./lib/rateLimit";
import { enqueueLoanEvent } from "./webhooks";

// ---------- helpers ----------

async function recentActivity(ctx: QueryCtx, loanId: Id<"loans">) {
  const events = await ctx.db
    .query("automationEvents")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .order("desc")
    .take(5);
  return events.map((e) => ({ kind: e.kind, detail: e.detail, at: e._creationTime }));
}

async function describe(ctx: QueryCtx, loan: Doc<"loans">, today: string) {
  const [tool, lender, borrower] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.lenderId),
    ctx.db.get(loan.borrowerId),
  ]);
  return {
    _id: loan._id,
    _creationTime: loan._creationTime,
    status: loan.status,
    startDate: loan.startDate,
    endDate: loan.endDate,
    note: loan.note ?? null,
    overdue: loan.status === "approved" && loan.endDate < today,
    toolName: tool?.name ?? "Removed tool",
    toolCategory: tool?.category ?? ("Other" as const),
    toolRemoved: !!tool?.removedAt,
    lenderFirstName: lender?.firstName ?? "A neighbour",
    lenderTrusted: lender?.trustedLender ?? false,
    borrowerFirstName: borrower?.firstName ?? "A neighbour",
    returnedAt: loan.returnedAt ?? null,
    lastReminderAt: loan.lastReminderAt ?? null,
    activity: await recentActivity(ctx, loan._id),
  };
}

async function loadLoan(ctx: MutationCtx, loanId: Id<"loans">) {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw new ConvexError("Request not found");
  return loan;
}

// ---------- queries ----------

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", viewer._id))
      .order("desc")
      .take(100);
    const today = todayISO();
    return Promise.all(loans.map((l) => describe(ctx, l, today)));
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", viewer._id))
      .order("desc")
      .take(100);
    const today = todayISO();
    return Promise.all(loans.map((l) => describe(ctx, l, today)));
  },
});

export const adminAll = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewer(ctx);
    if (viewer.role !== "admin") throw new ConvexError("Admins only");
    const loans = await ctx.db.query("loans").order("desc").take(300);
    const today = todayISO();
    return Promise.all(loans.map((l) => describe(ctx, l, today)));
  },
});

// ---------- mutations ----------

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await ensureViewer(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.removedAt) throw new ConvexError("Tool not found");
    if (tool.ownerId === viewer._id) throw new ConvexError("You can't borrow your own tool");

    const today = todayISO();
    if (!isISODate(args.startDate) || !isISODate(args.endDate)) {
      throw new ConvexError("Dates must be valid YYYY-MM-DD dates");
    }
    if (args.startDate < today) throw new ConvexError("Start date can't be in the past");
    if (args.endDate < args.startDate) throw new ConvexError("End date must be after start date");
    if (daysBetween(args.startDate, args.endDate) + 1 > MAX_LOAN_DAYS) {
      throw new ConvexError(`Loans are limited to ${MAX_LOAN_DAYS} days`);
    }
    if (daysBetween(today, args.startDate) > MAX_ADVANCE_DAYS) {
      throw new ConvexError(`You can book up to ${MAX_ADVANCE_DAYS} days ahead`);
    }
    const note = args.note?.trim().slice(0, 280) || undefined;

    // Each request emails the lender, so cap both overall volume and repeat
    // requests for the same tool (cancel → re-request loops).
    await rateLimit(ctx, `loan.request:${viewer._id}`, LIMITS.loanRequest);
    await rateLimit(ctx, `loan.request:${viewer._id}:${tool._id}`, LIMITS.loanRequestPerTool);

    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", tool._id).eq("status", "pending"))
      .filter((q) => q.eq(q.field("borrowerId"), viewer._id))
      .first();
    if (pending) throw new ConvexError("You already have a pending request for this tool");

    const approved = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", tool._id).eq("status", "approved"))
      .collect();
    if (approved.some((l) => overlaps(l.startDate, l.endDate, args.startDate, args.endDate))) {
      throw new ConvexError("The tool is already booked for some of those dates");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      lenderId: tool.ownerId,
      borrowerId: viewer._id,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending",
      note,
    });
    await enqueueLoanEvent(ctx, loanId, "request.created");
    return loanId;
  },
});

async function decide(ctx: MutationCtx, loanId: Id<"loans">, decision: "approved" | "declined") {
  const viewer = await ensureViewer(ctx);
  const loan = await loadLoan(ctx, loanId);
  if (loan.lenderId !== viewer._id) throw new ConvexError("Only the lender can decide on this request");
  if (loan.status !== "pending") throw new ConvexError(`Request is already ${loan.status}`);

  if (decision === "approved") {
    const tool = await ctx.db.get(loan.toolId);
    if (!tool || tool.removedAt) throw new ConvexError("Tool no longer listed");
    if (loan.endDate < todayISO()) throw new ConvexError("Those dates have already passed");
    const approved = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", loan.toolId).eq("status", "approved"))
      .collect();
    if (approved.some((l) => overlaps(l.startDate, l.endDate, loan.startDate, loan.endDate))) {
      throw new ConvexError("You've already approved another loan for overlapping dates");
    }
  }

  await ctx.db.patch(loanId, { status: decision, decidedAt: Date.now() });
  await enqueueLoanEvent(ctx, loanId, decision === "approved" ? "request.approved" : "request.declined");
}

export const approve = mutation({
  args: { loanId: v.id("loans") },
  handler: (ctx, { loanId }) => decide(ctx, loanId, "approved"),
});

export const decline = mutation({
  args: { loanId: v.id("loans") },
  handler: (ctx, { loanId }) => decide(ctx, loanId, "declined"),
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const viewer = await ensureViewer(ctx);
    const loan = await loadLoan(ctx, loanId);
    if (loan.borrowerId !== viewer._id) throw new ConvexError("Only the borrower can cancel this request");
    if (loan.status !== "pending") throw new ConvexError(`Request is already ${loan.status}`);
    await rateLimit(ctx, `loan.cancel:${viewer._id}`, LIMITS.loanCancel);
    await ctx.db.patch(loanId, { status: "cancelled", decidedAt: Date.now() });
    await enqueueLoanEvent(ctx, loanId, "request.cancelled");
  },
});

/** The lender confirms they got the tool back. Admins can close loans too. */
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const viewer = await ensureViewer(ctx);
    const loan = await loadLoan(ctx, loanId);
    const isAdmin = viewer.role === "admin";
    if (loan.lenderId !== viewer._id && !isAdmin) {
      throw new ConvexError("Only the lender can mark this loan returned");
    }
    if (loan.status !== "approved") throw new ConvexError("Only approved loans can be returned");
    await ctx.db.patch(loanId, { status: "returned", returnedAt: Date.now() });
    if (loan.lenderId !== viewer._id) await audit(ctx, viewer, "loan.returned_by_admin", "loans", loanId);
    await enqueueLoanEvent(ctx, loanId, "loan.returned");
  },
});
