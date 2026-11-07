/**
 * n8n -> Convex endpoints. Every request must carry a valid HMAC signature
 * made with N8N_TO_CONVEX_SECRET (a different secret from the Convex -> n8n
 * direction, so a leak on one side doesn't let an attacker forge the other).
 *
 *   POST /n8n/overdue-loans     { asOf?: "YYYY-MM-DD", cursor?: string }
 *                               -> { asOf, loans, cursor, isDone }   (n8n loops until isDone)
 *   POST /n8n/claim             { key }  -> { result: "granted" | "busy" | "duplicate" }
 *   POST /n8n/release           { key }  (send failed; let a retry claim again)
 *   POST /n8n/complete          { key }  (send succeeded)
 *   POST /n8n/reminder-status   { loanId, reminderKey, status: "sent"|"failed", error? }
 *   POST /n8n/workflow-error    { workflowName, executionId?, nodeName?, message }
 */
import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { isISODate, todayISO } from "./lib/dates";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from "./lib/hmac";

const MAX_BODY_BYTES = 16 * 1024;
// Scan at most this many index pages per call looking for loans to remind.
const OVERDUE_PAGE_SIZE = 100;
const OVERDUE_MAX_PAGES_PER_CALL = 20;

/**
 * Reads the body as UTF-8, refusing anything over `max` *bytes*. It checks
 * Content-Length up front and stops reading the stream as soon as the limit is
 * crossed, so an oversized or lying client can't make us buffer the whole thing.
 */
async function readLimited(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null; // invalid UTF-8 can't have been signed by our sender
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Verifies the signature, then hands the parsed body to `handler`. */
function signed(handler: (ctx: ActionCtx, body: Record<string, unknown>) => Promise<Response>) {
  return httpAction(async (ctx, req) => {
    const secret = process.env.N8N_TO_CONVEX_SECRET;
    if (!secret) {
      console.error("[http] N8N_TO_CONVEX_SECRET is not set");
      return json(503, { error: "not configured" });
    }
    const raw = await readLimited(req, MAX_BODY_BYTES);
    if (raw === null) return json(413, { error: "payload too large or not UTF-8" });

    const check = await verifySignature(
      secret,
      raw,
      req.headers.get(TIMESTAMP_HEADER),
      req.headers.get(SIGNATURE_HEADER),
    );
    if (!check.ok) {
      console.warn(`[http] rejected ${new URL(req.url).pathname}: ${check.reason}`);
      return json(401, { error: "invalid signature" }); // don't leak which check failed
    }

    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json(400, { error: "invalid JSON" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return json(400, { error: "expected a JSON object" });
    }
    return handler(ctx, body as Record<string, unknown>);
  });
}

const str = (v: unknown, max = 500) => (typeof v === "string" && v.length <= max ? v : undefined);

const http = httpRouter();

http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: signed(async (ctx, body) => {
    const asOf = str(body.asOf, 10) ?? todayISO();
    if (!isISODate(asOf)) return json(400, { error: "asOf must be YYYY-MM-DD" });
    let cursor = str(body.cursor, 2000) ?? null;

    // Keep paging until we have work or reach the end, so a run of
    // already-reminded loans never ends the loop early in n8n.
    for (let i = 0; i < OVERDUE_MAX_PAGES_PER_CALL; i++) {
      const page = await ctx.runQuery(internal.automation.overdueLoansPage, {
        asOf,
        cursor,
        numItems: OVERDUE_PAGE_SIZE,
      });
      cursor = page.continueCursor;
      if (page.loans.length > 0 || page.isDone) {
        return json(200, { asOf, count: page.loans.length, loans: page.loans, cursor, isDone: page.isDone });
      }
    }
    return json(200, { asOf, count: 0, loans: [], cursor, isDone: false });
  }),
});

http.route({
  path: "/n8n/claim",
  method: "POST",
  handler: signed(async (ctx, body) => {
    const key = str(body.key, 128);
    if (!key) return json(400, { error: "key is required" });
    const r = await ctx.runMutation(internal.automation.claimSend, { key });
    return r.ok ? json(200, { result: r.result }) : json(422, r);
  }),
});

for (const [path, outcome] of [
  ["/n8n/complete", "sent"],
  ["/n8n/release", "failed"],
] as const) {
  http.route({
    path,
    method: "POST",
    handler: signed(async (ctx, body) => {
      const key = str(body.key, 128);
      if (!key) return json(400, { error: "key is required" });
      const r = await ctx.runMutation(internal.automation.finishSend, { key, outcome });
      return json(r.ok ? 200 : 422, r);
    }),
  });
}

http.route({
  path: "/n8n/reminder-status",
  method: "POST",
  handler: signed(async (ctx, body) => {
    const loanId = str(body.loanId, 64);
    const reminderKey = str(body.reminderKey, 128);
    const status = body.status;
    if (!loanId || !reminderKey || (status !== "sent" && status !== "failed")) {
      return json(400, { error: "loanId, reminderKey and status (sent|failed) are required" });
    }
    const result = await ctx.runMutation(internal.automation.recordReminder, {
      loanId,
      reminderKey,
      status,
      error: str(body.error, 1000),
    });
    return json(result.ok ? 200 : 422, result);
  }),
});

http.route({
  path: "/n8n/workflow-error",
  method: "POST",
  handler: signed(async (ctx, body) => {
    const workflowName = str(body.workflowName, 200);
    const message = str(body.message, 2000);
    if (!workflowName || !message) return json(400, { error: "workflowName and message are required" });
    const result = await ctx.runMutation(internal.automation.recordWorkflowError, {
      workflowName,
      message,
      executionId: str(body.executionId, 100),
      nodeName: str(body.nodeName, 200),
    });
    return json(200, result);
  }),
});

export default http;
