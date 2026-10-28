/**
 * lib/server/api-guard.ts
 *
 * Shared hygiene for every API route (Phase C):
 *  - request body size limit (1 MB; 413 when exceeded)
 *  - JSON parsing that never throws into the handler
 *  - token-bucket rate limiting (60 req/min/IP/route; 429 when exceeded)
 *  - structured validation failures: 400 { error: "validation_failed", issues }
 *  - sanitized 500s: no stack traces or internals leak into responses
 *
 * Route handlers should start with:
 *
 *   const guard = await guardRequest(request, "route-name");
 *   if (!guard.ok) return guard.response;
 *   const body = guard.body;
 *
 * and wrap the rest in try/catch returning internalError() on failure.
 */

import { NextResponse } from "next/server";
import {
  checkRateLimit,
  getClientIp,
  DEFAULT_RATE_LIMIT,
} from "./rate-limit";

/** Request bodies larger than this are rejected with 413. */
export const MAX_BODY_BYTES = 1_000_000;

export interface GuardOk {
  ok: true;
  body: unknown;
  clientIp: string;
}

export interface GuardRejected {
  ok: false;
  response: NextResponse;
}

export type GuardResult = GuardOk | GuardRejected;

/** 400 { error: "validation_failed", issues: [...] }. */
export function validationFailed(issues: unknown[]): NextResponse {
  return NextResponse.json(
    { error: "validation_failed", issues },
    { status: 400 },
  );
}

/** 400 { error } — for ad-hoc contract violations with a stable message. */
export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** 404 { error }. */
export function notFound(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

/** 409 { error } — e.g. slot capacity exhausted. */
export function conflict(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 });
}

/** 403 { error: "forbidden", ... }. */
export function forbidden(detail: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: "forbidden", ...detail }, { status: 403 });
}

/**
 * 500 with a generic message. The real error is logged server-side so
 * no stack trace or internal detail ever reaches the client.
 */
export function internalError(context: string, error: unknown): NextResponse {
  console.error(`[api] ${context} failed:`, error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

/**
 * Shared entry guard: rate limit → body size limit → JSON parse.
 * Returns the parsed body (or {} for empty bodies) on success.
 */
export async function guardRequest(
  request: Request,
  routeName: string,
): Promise<GuardResult> {
  const clientIp = getClientIp(request);
  const limit = checkRateLimit(clientIp, routeName, DEFAULT_RATE_LIMIT);
  if (!limit.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "rate_limited", retryAfterMs: limit.retryAfterMs },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
        },
      ),
    };
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return { ok: false, response: badRequest("Could not read request body") };
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "payload_too_large", maxBytes: MAX_BODY_BYTES },
        { status: 413 },
      ),
    };
  }

  if (raw.trim() === "") return { ok: true, body: {}, clientIp };

  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    // Message kept stable: existing hardening tests assert on it.
    return {
      ok: false,
      response: badRequest("Invalid JSON body"),
    };
  }
  return { ok: true, body, clientIp };
}
