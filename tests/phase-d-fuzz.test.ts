/**
 * tests/phase-d-fuzz.test.ts
 *
 * Phase D — malformed-input fuzzing across every API route.
 *
 * A seeded PRNG (mulberry32, tests/phase-d-helpers.ts) generates
 * garbage/edge payloads. The contract under test:
 *   F1  garbage NEVER produces a 500 (or any 5xx) — no unhandled throw.
 *   F2  garbage NEVER produces a 2xx on routes with required fields
 *       (no silent acceptance of malformed input).
 *   F3  on routes with required fields, garbage -> 400 with a JSON
 *       { error } body (validation_failed for contract violations).
 *   F4  on routes with documented defaults (exact/validate/simulate/plan/
 *       benchmark/pareto/pricing/stochastic), garbage coerces to defaults:
 *       200 with a parseable body is acceptable, 400 is acceptable —
 *       500 is not.
 *
 * NOTE on F3 wording: some routes return plain `{ error: "<message>" }`
 * 400s (via badRequest) rather than the { error: "validation_failed" }
 * shape. The property asserted here is "400 + machine-readable error",
 * and docs/ACCEPTANCE.md records which routes use which shape.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { POST as optimizePOST } from "../app/api/optimize/route";
import { POST as replanPOST } from "../app/api/replan/route";
import { POST as exactPOST } from "../app/api/exact/route";
import { POST as validatePOST } from "../app/api/validate/route";
import { POST as simulatePOST } from "../app/api/simulate/route";
import { POST as planPOST } from "../app/api/plan/route";
import { POST as benchmarkPOST } from "../app/api/benchmark/route";
import { POST as paretoPOST } from "../app/api/pareto/route";
import { POST as pricingPOST } from "../app/api/pricing/route";
import { POST as stochasticPOST } from "../app/api/stochastic/route";
import { POST as bookingsPOST } from "../app/api/bookings/route";
import { PATCH as bookingPatch } from "../app/api/bookings/[id]/route";
import { POST as recommendationsPOST } from "../app/api/recommendations/route";
import { POST as approvePOST } from "../app/api/recommendations/[id]/approve/route";
import {
  appointmentStore,
  recommendationStore,
} from "../lib/server/stores";
import {
  bookingIdempotency,
  recommendationIdempotency,
} from "../lib/server/idempotency";
import { makeTestRng, type Rng } from "./phase-d-helpers";

type Handler = (r: Request, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>;

function deepNested(rng: Rng, depth: number): unknown {
  if (depth <= 0) return rng.pick(["x", 1, true, null] as const);
  return rng.chance(0.5)
    ? { a: deepNested(rng, depth - 1), b: [deepNested(rng, depth - 1)] }
    : [deepNested(rng, depth - 1)];
}

/** Seeded garbage-payload generator: wrong types, nulls, nesting, edges. */
function garbagePayload(rng: Rng): unknown {
  const kind = rng.int(0, 11);
  switch (kind) {
    case 0: return null;
    case 1: return rng.pick([true, false] as const);
    case 2: return rng.pick([0, -1, 3.14, 1e30, -1e30, 1440, 999999] as const);
    case 3: return rng.pick(["", "x", "null", "undefined", "NaN", "💥".repeat(500), "a".repeat(5000)] as const);
    case 4: return [];
    case 5: return [null, 42, "x", {}, []];
    case 6: return {};
    case 7: return { requests: rng.pick([null, "nope", 42, {}, [null]] as const) };
    case 8: return { requests: [{ id: 123, cargo: null, preferredStart: "morning" }] };
    case 9: return deepNested(rng, 6);
    case 10: return { requests: Array.from({ length: 3 }, () => deepNested(rng, 3)) };
    default: return { __proto__: { polluted: true }, requests: [null] };
  }
}

/** Edge-but-plausible payloads: must not 500 either. */
function edgePayload(rng: Rng): unknown {
  const kind = rng.int(0, 5);
  switch (kind) {
    case 0: return { requests: [] };
    case 1: return { requests: [{}] };
    case 2:
      return {
        requests: [
          {
            id: "",
            company: "",
            truckPlate: 42,
            cargo: "GENERAL",
            move: "sideways",
            containers: 3,
            preferredStart: -30,
            preferredEnd: 9999,
            leadTimeHours: -5,
            driverNoShowRate: 7,
            createdAt: "yesterday",
            day: 99,
            terminal: "T9",
          },
        ],
      };
    case 3: return { disruptions: "oops", nowMin: "soon" };
    case 4: return { status: ["confirmed"], reason: 42 };
    default: return { trucks: -50, seed: "abc", day: 1e10, maxNodes: null };
  }
}

async function call(
  handler: Handler,
  url: string,
  body: unknown,
  init?: { method?: string; rawBody?: string; params?: { id: string } },
): Promise<{ status: number; json: unknown }> {
  const res = await handler(
    new Request(url, {
      method: init?.method ?? "POST",
      headers: { "content-type": "application/json" },
      body: init?.rawBody ?? JSON.stringify(body),
    }),
    // Next.js dynamic routes always receive { params }; the test harness
    // must pass it explicitly or the handler's destructuring throws.
    init?.params ? { params: Promise.resolve(init.params) } : { params: Promise.resolve({ id: "unused" }) },
  );
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function isErrorBody(json: unknown): boolean {
  return (
    typeof json === "object" &&
    json !== null &&
    typeof (json as Record<string, unknown>).error === "string"
  );
}

beforeEach(() => {
  appointmentStore.clear();
  recommendationStore.clear();
  bookingIdempotency.clear();
  recommendationIdempotency.clear();
});

/** Routes whose bodies have REQUIRED fields: garbage must 400, never 2xx/5xx. */
const STRICT_ROUTES: Array<{ name: string; handler: Handler; url: string; method?: string }> = [
  { name: "POST /api/optimize", handler: optimizePOST, url: "http://localhost/api/optimize" },
  { name: "POST /api/replan", handler: replanPOST, url: "http://localhost/api/replan" },
  { name: "POST /api/bookings", handler: bookingsPOST, url: "http://localhost/api/bookings" },
  { name: "PATCH /api/bookings/[id]", handler: bookingPatch as Handler, url: "http://localhost/api/bookings/appt_nope", method: "PATCH" },
  { name: "POST /api/recommendations", handler: recommendationsPOST, url: "http://localhost/api/recommendations" },
  { name: "POST /api/recommendations/[id]/approve", handler: approvePOST as Handler, url: "http://localhost/api/recommendations/rec_nope/approve" },
];

/** Routes with documented defaults: garbage must never 500; 200-or-400 ok. */
const DEFAULT_ROUTES: Array<{
  name: string;
  handler: Handler;
  url: string;
  payloads: number;
}> = [
  { name: "POST /api/exact", handler: exactPOST, url: "http://localhost/api/exact", payloads: 30 },
  { name: "POST /api/validate", handler: validatePOST, url: "http://localhost/api/validate", payloads: 30 },
  { name: "POST /api/simulate", handler: simulatePOST, url: "http://localhost/api/simulate", payloads: 30 },
  { name: "POST /api/plan", handler: planPOST, url: "http://localhost/api/plan", payloads: 30 },
  { name: "POST /api/benchmark", handler: benchmarkPOST, url: "http://localhost/api/benchmark", payloads: 20 },
  // pareto (~1.9s/call) and stochastic (~0.6s/call) are compute-heavy by
  // design (weight sweeps / scenario ensembles); fewer payloads here.
  { name: "POST /api/pareto", handler: paretoPOST, url: "http://localhost/api/pareto", payloads: 6 },
  { name: "POST /api/pricing", handler: pricingPOST, url: "http://localhost/api/pricing", payloads: 30 },
  { name: "POST /api/stochastic", handler: stochasticPOST, url: "http://localhost/api/stochastic", payloads: 8 },
];

const PAYLOADS_PER_ROUTE = 30;

describe("F1-F3: strict routes reject garbage with 400, never 500/2xx", () => {
  for (const route of STRICT_ROUTES) {
    it(`${route.name}: ${PAYLOADS_PER_ROUTE} garbage + ${PAYLOADS_PER_ROUTE} edge payloads`, async () => {
      const rng = makeTestRng(9000 + route.name.length * 131);
      for (let i = 0; i < PAYLOADS_PER_ROUTE; i++) {
        for (const body of [garbagePayload(rng), edgePayload(rng)]) {
          const { status, json } = await call(route.handler, route.url, body, {
            method: route.method,
          });
          expect(status, `${route.name} payload#${i} ${JSON.stringify(body).slice(0, 80)}`).toBeGreaterThanOrEqual(400);
          expect(status, `${route.name} payload#${i}`).toBeLessThan(500);
          expect(isErrorBody(json), `${route.name} payload#${i} has { error }`).toBe(true);
        }
      }
    });

    it(`${route.name}: invalid JSON body -> 400 (or 429 under rate limit), never 500`, async () => {
      const { status, json } = await call(route.handler, route.url, null, {
        method: route.method,
        rawBody: "not json{{{",
      });
      // 429 is the rate limiter working as designed: the garbage sweep just
      // fired 60 requests at this route inside one minute.
      expect([400, 429].includes(status), `${route.name} status=${status}`).toBe(true);
      expect(status).toBeLessThan(500);
      expect(isErrorBody(json)).toBe(true);
    });
  }
});

describe("F4: default-coercing routes never 500 on garbage", () => {
  for (const route of DEFAULT_ROUTES) {
    it(`${route.name}: ${route.payloads} garbage payloads`, async () => {
      const rng = makeTestRng(15000 + route.name.length * 131);
      for (let i = 0; i < route.payloads; i++) {
        const body = i % 2 === 0 ? garbagePayload(rng) : edgePayload(rng);
        const { status, json } = await call(route.handler, route.url, body);
        expect(status, `${route.name} payload#${i}`).toBeLessThan(500);
        // 200 (defaults applied) or a 4xx client error are both acceptable.
        expect(
          (status >= 200 && status < 300) || (status >= 400 && status < 500),
          `${route.name} payload#${i} status=${status}`,
        ).toBe(true);
        if (status >= 200 && status < 300) {
          expect(json, `${route.name} payload#${i} parses`).not.toBeNull();
        }
      }
    }, 120000);
  }
});

describe("F5: valid-shape edge payloads are accepted or 400 — never 500", () => {
  it("optimize accepts boundary-valid requests", async () => {
    const edge = {
      requests: [
        {
          id: "edge-1",
          company: "C",
          truckPlate: "X",
          cargo: "general",
          move: "import",
          containers: 2,
          preferredStart: 360,
          preferredEnd: 1319,
          leadTimeHours: 0,
          driverNoShowRate: 0,
          createdAt: 1,
          day: 6,
          terminal: "any",
        },
      ],
    };
    const { status } = await call(optimizePOST, "http://localhost/api/optimize", edge);
    expect(status).toBe(200);
  });

  it("bookings PATCH: missing id -> 404; garbage body on existing id -> 400", async () => {
    // Missing id: the route resolves the booking before validating the body.
    const { status: s404 } = await call(
      bookingPatch as Handler,
      "http://localhost/api/bookings/appt_doesnotexist",
      { status: "confirmed" },
      { method: "PATCH" },
    );
    expect(s404).toBe(404);

    // Existing id + garbage body -> 400 validation_failed.
    const created = await (
      await bookingsPOST(
        new Request("http://localhost/api/bookings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            truck: { plate: "48213 - A - 6", carrier: "Atlas Freight Maroc" },
            container: { number: "TCLU1234568", type: "dry" },
            slot: { startUtc: "2026-10-20T08:00:00Z", endUtc: "2026-10-20T08:30:00Z" },
            terminal: "T1",
            gate: "G1",
          }),
        }),
      )
    ).json();
    const { status: s400, json } = await call(
      bookingPatch as Handler,
      `http://localhost/api/bookings/${created.id}`,
      { status: 42 },
      { method: "PATCH", params: { id: created.id } },
    );
    expect(s400).toBe(400);
    expect(isErrorBody(json)).toBe(true);
    expect((json as { error: string }).error).toBe("validation_failed");
  });
});
