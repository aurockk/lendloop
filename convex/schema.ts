import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { CATEGORIES, CONDITIONS } from "./lib/constants";

export const category = v.union(...CATEGORIES.map((c) => v.literal(c)));
export const condition = v.union(...CONDITIONS.map((c) => v.literal(c)));

export const loanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

export const loanEvent = v.union(
  v.literal("request.created"),
  v.literal("request.approved"),
  v.literal("request.declined"),
  v.literal("request.cancelled"),
  v.literal("loan.returned"),
);

export default defineSchema({
  users: defineTable({
    // Clerk identity, as verified by Convex from the JWT. Never taken from client args.
    tokenIdentifier: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin")),
    trustedLender: v.boolean(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
    // Soft delete keeps loan history intact for auditability.
    removedAt: v.optional(v.number()),
    removedBy: v.optional(v.id("users")),
  })
    .index("by_owner", ["ownerId", "removedAt"])
    // Filter out removed tools *in the index*, so pagination never returns
    // a page made only of deleted listings.
    .index("by_active", ["removedAt"])
    .index("by_category_active", ["category", "removedAt"]),

  loans: defineTable({
    toolId: v.id("tools"),
    lenderId: v.id("users"),
    borrowerId: v.id("users"),
    // ISO dates (YYYY-MM-DD, UTC), inclusive range.
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatus,
    note: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
    lastReminderAt: v.optional(v.number()),
    reminderCount: v.optional(v.number()),
  })
    .index("by_tool_status", ["toolId", "status"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_status_end", ["status", "endDate"]),

  // Transactional outbox for Convex -> n8n webhooks. Written in the same
  // mutation as the state change, delivered by a scheduled action with retries.
  webhookDeliveries: defineTable({
    loanId: v.id("loans"),
    event: loanEvent,
    // Minimal payload snapshot; cleared after successful delivery.
    payload: v.optional(v.any()),
    status: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    attempts: v.number(),
    // When the next attempt is due; lets the sweeper find stuck deliveries.
    nextAttemptAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_loan", ["loanId"])
    .index("by_status", ["status", "nextAttemptAt"]),

  // Human-readable automation timeline per loan, plus workflow errors.
  automationEvents: defineTable({
    loanId: v.optional(v.id("loans")),
    kind: v.union(
      v.literal("notification_sent"),
      v.literal("notification_failed"),
      v.literal("reminder_sent"),
      v.literal("reminder_failed"),
      v.literal("workflow_error"),
    ),
    source: v.union(v.literal("convex"), v.literal("n8n")),
    detail: v.string(),
    // Guarantees idempotent write-backs from n8n.
    idempotencyKey: v.optional(v.string()),
  })
    .index("by_loan", ["loanId"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_kind", ["kind"]),

  // Atomic "who is sending this email" reservations, taken by n8n before it
  // sends anything. Mutations are serializable, so exactly one caller wins.
  //   key: "event:<deliveryId>" | "reminder:<loanId>:<YYYY-MM-DD>"
  automationClaims: defineTable({
    key: v.string(),
    state: v.union(v.literal("claimed"), v.literal("done")),
    // A claim whose holder crashed expires and can be taken again.
    leaseUntil: v.number(),
  }).index("by_key", ["key"]),

  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),

  auditLog: defineTable({
    actorId: v.id("users"),
    action: v.string(),
    targetTable: v.string(),
    targetId: v.string(),
    detail: v.optional(v.string()),
  }).index("by_target", ["targetTable", "targetId"]),
});
