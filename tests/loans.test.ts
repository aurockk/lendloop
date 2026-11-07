import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { as, isoDay, listTool, setup } from "./helpers";

describe("loan state machine", () => {
  test("pending → approved → returned, and finished states are final", async () => {
    const t = setup();
    const alice = await as(t, "Alice");
    const bob = await as(t, "Bob");
    const toolId = await listTool(alice);
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(3) });

    await expect(alice.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/Only approved/);
    await alice.mutation(api.loans.approve, { loanId });
    await expect(alice.mutation(api.loans.decline, { loanId })).rejects.toThrow(/already approved/);
    await expect(bob.mutation(api.loans.cancel, { loanId })).rejects.toThrow(/already approved/);
    await alice.mutation(api.loans.markReturned, { loanId });
    await expect(alice.mutation(api.loans.markReturned, { loanId })).rejects.toThrow(/Only approved/);

    const [loan] = await alice.query(api.loans.incoming, {});
    expect(loan.status).toBe("returned");
  });

  test("declined and cancelled requests can't be approved", async () => {
    const t = setup();
    const alice = await as(t, "Alice");
    const bob = await as(t, "Bob");
    const toolId = await listTool(alice);

    const a = await bob.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(1) });
    await alice.mutation(api.loans.decline, { loanId: a });
    await expect(alice.mutation(api.loans.approve, { loanId: a })).rejects.toThrow(/already declined/);

    const b = await bob.mutation(api.loans.request, { toolId, startDate: isoDay(2), endDate: isoDay(2) });
    await bob.mutation(api.loans.cancel, { loanId: b });
    await expect(alice.mutation(api.loans.approve, { loanId: b })).rejects.toThrow(/already cancelled/);
  });

  test("two overlapping requests: approving one blocks the other", async () => {
    const t = setup();
    const alice = await as(t, "Alice");
    const bob = await as(t, "Bob");
    const carol = await as(t, "Carol");
    const toolId = await listTool(alice);

    const bobs = await bob.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(4) });
    const carols = await carol.mutation(api.loans.request, { toolId, startDate: isoDay(3), endDate: isoDay(6) });

    // Run both approvals concurrently. Convex mutations are serializable, so
    // whichever commits second must see the first and fail.
    const results = await Promise.allSettled([
      alice.mutation(api.loans.approve, { loanId: bobs }),
      alice.mutation(api.loans.approve, { loanId: carols }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    // And new requests for those dates are refused up front.
    const dave = await as(t, "Dave");
    await expect(
      dave.mutation(api.loans.request, { toolId, startDate: isoDay(2), endDate: isoDay(2) }),
    ).rejects.toThrow(/already booked/);
  });

  test("date validation", async () => {
    const t = setup();
    const alice = await as(t, "Alice");
    const bob = await as(t, "Bob");
    const toolId = await listTool(alice);
    const req = (startDate: string, endDate: string) =>
      bob.mutation(api.loans.request, { toolId, startDate, endDate });

    await expect(req(isoDay(-1), isoDay(1))).rejects.toThrow(/past/);
    await expect(req(isoDay(3), isoDay(1))).rejects.toThrow(/after start/);
    await expect(req(isoDay(1), isoDay(40))).rejects.toThrow(/limited to 30 days/);
    await expect(req(isoDay(100), isoDay(101))).rejects.toThrow(/90 days ahead/);
    await expect(req("2026-02-30", "2026-03-01")).rejects.toThrow(/valid/);
  });
});

describe("abuse limits", () => {
  test("cancel → re-request loops are capped per tool", async () => {
    const t = setup();
    const alice = await as(t, "Alice");
    const bob = await as(t, "Bob");
    const toolId = await listTool(alice);

    for (let i = 0; i < 3; i++) {
      const loanId = await bob.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(2) });
      await bob.mutation(api.loans.cancel, { loanId });
    }
    await expect(
      bob.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(2) }),
    ).rejects.toThrow(/Too many attempts/);

    // 3 requests + 3 cancellations = 6 notifications, and no more.
    const deliveries = await t.run((ctx) => ctx.db.query("webhookDeliveries").collect());
    expect(deliveries).toHaveLength(6);
  });

  test("tool creation is rate limited", async () => {
    const t = setup();
    const alice = await as(t, "Alice");
    for (let i = 0; i < 10; i++) await listTool(alice, `Tool ${i}`);
    await expect(listTool(alice, "One too many")).rejects.toThrow(/Too many attempts/);
  });

  test("rejected calls don't consume quota (the transaction rolls back)", async () => {
    const t = setup();
    const alice = await as(t, "Alice");
    const bob = await as(t, "Bob");
    const toolId = await listTool(alice);
    await bob.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(1) });
    // Duplicate pending requests fail after the limiter ran; the increment must not stick.
    for (let i = 0; i < 5; i++) {
      await expect(
        bob.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(1) }),
      ).rejects.toThrow(/already have a pending/);
    }
    const counters = await t.run((ctx) => ctx.db.query("rateLimits").collect());
    expect(Math.max(...counters.map((c) => c.count))).toBe(1);
  });
});

describe("notification outbox", () => {
  test("payload carries only what the email needs", async () => {
    const t = setup();
    const alice = await as(t, "Alice");
    const bob = await as(t, "Bob");
    const toolId = await listTool(alice);
    await bob.mutation(api.loans.request, {
      toolId,
      startDate: isoDay(1),
      endDate: isoDay(2),
      note: "my phone is 555-0100",
    });

    const [d] = await t.run((ctx) => ctx.db.query("webhookDeliveries").collect());
    expect(d.status).toBe("pending");
    expect(d.payload.recipient).toEqual({ email: "alice@example.com", firstName: "Alice" });
    expect(d.payload.counterpart).toEqual({ firstName: "Bob" });
    const serialized = JSON.stringify(d.payload);
    expect(serialized).not.toContain("555-0100"); // free-text note never leaves Convex
    expect(serialized).not.toContain("bob@example.com"); // counterpart email never leaves Convex
    expect(serialized).not.toContain("clerk.test"); // no identity tokens
  });
});
