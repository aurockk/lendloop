import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { signBody } from "../convex/lib/hmac";

export const modules = import.meta.glob("../convex/**/*.ts");

export const INBOUND_SECRET = "test-inbound-secret";
export const OUTBOUND_SECRET = "test-outbound-secret";

export function setup() {
  process.env.N8N_TO_CONVEX_SECRET = INBOUND_SECRET;
  process.env.N8N_WEBHOOK_SECRET = OUTBOUND_SECRET;
  process.env.N8N_LOAN_EVENTS_WEBHOOK_URL = "http://n8n.test/webhook/lendloop-loan-events";
  process.env.ADMIN_EMAILS = "admin@example.com";
  return convexTest(schema, modules);
}

export type T = ReturnType<typeof setup>;

export function person(name: string, opts: { emailVerified?: boolean; email?: string } = {}) {
  return {
    subject: name.toLowerCase(),
    issuer: "https://clerk.test",
    tokenIdentifier: `https://clerk.test|${name.toLowerCase()}`,
    email: opts.email ?? `${name.toLowerCase()}@example.com`,
    emailVerified: opts.emailVerified ?? true,
    givenName: name,
  };
}

/** A signed-in client for `name`, with their user row created. */
export async function as(t: T, name: string, opts?: Parameters<typeof person>[1]) {
  const client = t.withIdentity(person(name, opts));
  await client.mutation(api.users.store, {});
  return client;
}

export function isoDay(offset: number) {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

export async function listTool(client: Awaited<ReturnType<typeof as>>, name = "Cordless drill") {
  return (await client.mutation(api.tools.create, {
    name,
    category: "Power tools",
    condition: "Good",
    description: "18V",
  })) as Id<"tools">;
}

/** POST to a Convex HTTP route, signed like n8n does it. */
export async function signedPost(
  t: T,
  path: string,
  payload: unknown,
  { secret = INBOUND_SECRET, now = Date.now() }: { secret?: string; now?: number } = {},
) {
  const body = JSON.stringify(payload);
  const { timestamp, signature } = await signBody(secret, body, now);
  return t.fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-lendloop-timestamp": timestamp,
      "x-lendloop-signature": signature,
    },
    body,
  });
}
