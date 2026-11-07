import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import { verifySignature } from "../convex/lib/hmac";
import { as, isoDay, listTool, OUTBOUND_SECRET, setup, type T } from "./helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function requestOne(t: T) {
  const alice = await as(t, "Alice");
  const bob = await as(t, "Bob");
  const toolId = await listTool(alice);
  await bob.mutation(api.loans.request, { toolId, startDate: isoDay(1), endDate: isoDay(2) });
  const [d] = await t.run((ctx) => ctx.db.query("webhookDeliveries").collect());
  return d;
}

describe("Convex → n8n delivery", () => {
  test("signs the request, then marks delivered and drops the PII snapshot", async () => {
    const t = setup();
    const d = await requestOne(t);
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await t.action(internal.webhooks.deliver, { deliveryId: d._id });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://n8n.test/webhook/lendloop-loan-events");
    const headers = init.headers as Record<string, string>;
    const check = await verifySignature(
      OUTBOUND_SECRET,
      init.body as string,
      headers["x-lendloop-timestamp"],
      headers["x-lendloop-signature"],
    );
    expect(check.ok).toBe(true);
    expect(JSON.parse(init.body as string).eventId).toBe(d._id);

    const after = await t.run((ctx) => ctx.db.get(d._id));
    expect(after!.status).toBe("delivered");
    expect(after!.payload).toBeUndefined();
    const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(events.map((e) => e.kind)).toEqual(["notification_sent"]);
  });

  test("retries with backoff, then fails visibly after 5 attempts", async () => {
    const t = setup();
    const d = await requestOne(t);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 409 })));

    for (let i = 0; i < 5; i++) {
      await t.action(internal.webhooks.deliver, { deliveryId: d._id });
    }
    const after = await t.run((ctx) => ctx.db.get(d._id));
    expect(after!.status).toBe("failed");
    expect(after!.attempts).toBe(5);
    expect(after!.lastError).toBe("n8n responded 409");
    expect(after!.payload).toBeUndefined();

    const admin = await as(t, "Admin");
    const health = await admin.query(api.automation.health, {});
    expect(health.failedDeliveries).toHaveLength(1);

    // Admin retry rebuilds the payload and queues it again.
    await admin.mutation(api.webhooks.retryDelivery, { deliveryId: d._id });
    const retried = await t.run((ctx) => ctx.db.get(d._id));
    expect(retried!.status).toBe("pending");
    expect(retried!.payload.recipient.email).toBe("alice@example.com");
  });

  test("the sweeper re-queues deliveries that never reported back", async () => {
    const t = setup();
    const d = await requestOne(t);
    await t.run((ctx) => ctx.db.patch(d._id, { nextAttemptAt: Date.now() - 10 * 60_000 }));
    await t.mutation(internal.webhooks.sweepStuck, {});
    const after = await t.run((ctx) => ctx.db.get(d._id));
    expect(after!.nextAttemptAt!).toBeGreaterThan(Date.now());
  });
});
