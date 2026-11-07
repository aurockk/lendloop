/**
 * HMAC-SHA256 request signing shared by both directions:
 *
 *   X-LendLoop-Timestamp: <unix seconds>
 *   X-LendLoop-Signature: sha256=<hex(HMAC(secret, `${timestamp}.${rawBody}`))>
 *
 * The timestamp is part of the signed material and must be within
 * MAX_SKEW_SECONDS of the receiver's clock, which bounds replay windows.
 * Write-backs are additionally idempotent, so a replay inside the window is harmless.
 */

export const MAX_SKEW_SECONDS = 300;
export const SIGNATURE_HEADER = "x-lendloop-signature";
export const TIMESTAMP_HEADER = "x-lendloop-timestamp";

const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signBody(secret: string, rawBody: string, now = Date.now()) {
  const timestamp = Math.floor(now / 1000).toString();
  const signature = `sha256=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
  return { timestamp, signature };
}

export async function verifySignature(
  secret: string,
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  now = Date.now(),
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!timestamp || !signature) return { ok: false, reason: "missing signature headers" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  if (Math.abs(now / 1000 - ts) > MAX_SKEW_SECONDS) return { ok: false, reason: "stale timestamp" };
  const expected = `sha256=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
  return timingSafeEqual(expected, signature) ? { ok: true } : { ok: false, reason: "bad signature" };
}
