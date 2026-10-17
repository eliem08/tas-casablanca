/**
 * tests/phase-d-performance.test.ts
 *
 * Phase D — performance benchmarks on representative sizes.
 *
 * This file MEASURES; it does not gate on tight thresholds (CI machines
 * vary). Each benchmark prints a timing row and asserts only a generous
 * sanity bound so a pathological regression still fails loudly. The real
 * numbers are recorded in docs/PERFORMANCE.md from an actual run —
 * see the "Measured" section there. Never invent numbers: re-run this
 * file and copy the table.
 *
 * Hot paths measured:
 *   - POST /api/bookings (route level): 100 / 500 / 1000 creations
 *   - optimizeSlots (lib): 100 / 500 / 1000 requests, greedy + annealed
 *   - POST /api/optimize (route level): 100 / 250 / 500 (route cap)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { POST as bookingsPOST } from "../app/api/bookings/route";
import { POST as optimizePOST } from "../app/api/optimize/route";
import { optimizeSlots } from "../lib/optimizer";
import { appointmentStore } from "../lib/server/stores";
import { bookingIdempotency } from "../lib/server/idempotency";
import { clearRateLimits } from "../lib/server/rate-limit";
import { randomBookingRequests } from "./phase-d-helpers";

const CONTAINER_NO = "TCLU1234568";

function bookingBody(i: number) {
  const hh = String(6 + (i % 14)).padStart(2, "0");
  // Spread across 10 dates x 14 hours x 3 gates so slot capacity (4/bucket)
  // does not saturate: capacity = 10*14*3*4 = 1680 > 1000 creations.
  const dd = String(20 + (Math.floor(i / 100) % 10)).padStart(2, "0");
  return {
    truck: { plate: `48213 - A - ${(i % 9) + 1}`, carrier: "Atlas Freight Maroc" },
    container: { number: CONTAINER_NO, type: "dry" },
    slot: {
      startUtc: `2026-10-${dd}T${hh}:00:00Z`,
      endUtc: `2026-10-${dd}T${hh}:30:00Z`,
    },
    terminal: "T1",
    gate: `G${(i % 3) + 1}`,
  };
}

async function timeIt(label: string, fn: () => Promise<void> | void): Promise<number> {
  const t0 = performance.now();
  await fn();
  const ms = performance.now() - t0;
  console.log(`[perf] ${label}: ${ms.toFixed(0)} ms`);
  return ms;
}

beforeEach(() => {
  appointmentStore.clear();
  bookingIdempotency.clear();
});

describe("booking creation throughput (route level)", () => {
  for (const n of [100, 500, 1000]) {
    it(`POST /api/bookings x${n}`, async () => {
      const ms = await timeIt(`bookings x${n}`, async () => {
        let created = 0;
        for (let i = 0; i < n; i++) {
          // The route rate-limits at 60 req/min/IP; reset between batches so
          // every request exercises the full creation path. (Production
          // would 429 after 60/min — documented in PERFORMANCE.md.)
          if (i % 50 === 0) clearRateLimits();
          const res = await bookingsPOST(
            new Request("http://localhost/api/bookings", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(bookingBody(i)),
            }),
          );
          // Slot capacity is 4 per bucket; spread across hours/gates.
          // 409s are fine for the timing — they still exercise the path.
          expect([201, 409].includes(res.status)).toBe(true);
          if (res.status === 201) created++;
          await res.json().catch(() => null);
        }
        console.log(`[perf] bookings x${n}: ${created} created`);
      });
      // Sanity bound only: 1000 sequential creations must finish well
      // inside a minute on any reasonable machine.
      expect(ms).toBeLessThan(60_000);
      console.log(`[perf] bookings x${n}: ${(n / (ms / 1000)).toFixed(0)} req/s`);
    }, 120000);
  }
});

describe("optimizeSlots scaling (lib level)", () => {
  for (const n of [100, 500, 1000]) {
    for (const method of ["greedy", "annealed"] as const) {
      it(`${method} x${n}`, async () => {
        const reqs = randomBookingRequests({ count: n, seed: 777 });
        const ms = await timeIt(`optimizeSlots ${method} x${n}`, () => {
          const plan = optimizeSlots(reqs, { seed: 7, method });
          expect(plan).toHaveLength(n);
        });
        expect(ms).toBeLessThan(60_000);
      }, 120000);
    }
  }
});

describe("POST /api/optimize scaling (route level)", () => {
  for (const n of [100, 250, 500]) {
    it(`x${n} requests`, async () => {
      const reqs = randomBookingRequests({ count: n, seed: 4242 });
      const ms = await timeIt(`POST /api/optimize x${n}`, async () => {
        const res = await optimizePOST(
          new Request("http://localhost/api/optimize", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ requests: reqs }),
          }),
        );
        expect(res.status).toBe(200);
        const payload = await res.json();
        expect(payload.assignments).toHaveLength(n);
      });
      expect(ms).toBeLessThan(60_000);
    }, 120000);
  }
});
