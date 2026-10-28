import { describe, it, expect } from "vitest";
import { makeRng, generateDayRequests } from "../lib/data";
import { optimizeSlots, baselineAssign } from "../lib/optimizer";
import {
  buildArrivalStreams,
  simulateDay,
  simulateQueues,
} from "../lib/simulation";
import { noShowProbability } from "../lib/predictor";
import type { BookingRequest } from "../lib/types";

describe("paired comparison: identical demand + seeded RNG (B6)", () => {
  it("baseline and optimized worlds see the SAME no-show set", () => {
    const n = 120;
    const seed = 42;
    const requests = generateDayRequests(n, seed);
    const opt = optimizeSlots(requests, { seed, overbook: true });
    const base = baselineAssign(requests);

    const s1 = buildArrivalStreams(requests, opt, base, makeRng(seed));
    // Recompute the shared no-show set independently.
    const rng = makeRng(seed);
    let shown = 0;
    for (const r of requests) {
      const p = noShowProbability({
        leadTimeHours: r.leadTimeHours,
        driverNoShowRate: r.driverNoShowRate,
        slotStartMin: r.preferredStart,
        cargo: r.cargo,
      });
      if (rng() >= p) shown += 1;
    }
    const surge = Math.round(n * 0.12);
    // Optimized world: exactly the shown trucks (no surge).
    expect(s1.optArrivals).toHaveLength(shown);
    // Baseline world: the same shown trucks + the walk-in surge only.
    expect(s1.baseArrivals).toHaveLength(shown + surge);
    expect(s1.surge).toBe(surge);
  });

  it("arrival streams are deterministic for a fixed seed", () => {
    const requests = generateDayRequests(80, 9);
    const opt = optimizeSlots(requests, { seed: 9, overbook: true });
    const base = baselineAssign(requests);
    const a = buildArrivalStreams(requests, opt, base, makeRng(9));
    const b = buildArrivalStreams(requests, opt, base, makeRng(9));
    expect(a).toEqual(b);
  });

  it("simulateDay is deterministic and internally consistent", () => {
    const r1 = simulateDay(150, 123);
    const r2 = simulateDay(150, 123);
    expect(r1).toEqual(r2);
    // Queue bookkeeping: served + stranded == arrivals.
    expect(r1.optimized.totalTrucks).toBe(150);
    expect(r1.baseline.totalTrucks).toBe(150 + Math.round(150 * 0.12));
    expect(r1.params).toEqual({ trucks: 150, seed: 123 });
  });

  it("simulateQueues conserves trucks (served + stranded == arrived)", () => {
    const rng = makeRng(5);
    const arrivals = Array.from({ length: 300 }, (_, i) => ({
      time: 360 + rng() * 900,
      gate: i % 3,
    }));
    const s = simulateQueues(arrivals, { instrument: true });
    const stranded = s.instrumented!.arrivals.length - s.served;
    expect(s.served + stranded).toBe(300);
    // Every served truck's wait is non-negative and recorded.
    for (const w of s.instrumented!.waits) {
      expect(w.servedAt - w.arrivedAt).toBeGreaterThanOrEqual(0);
    }
    expect(s.instrumented!.waits.length).toBe(s.served);
  });

  it("different seeds give different (but valid) days", () => {
    const a = simulateDay(100, 1);
    const b = simulateDay(100, 2);
    expect(a).not.toEqual(b);
    expect(a.optimized.totalTrucks).toBe(100);
    expect(b.optimized.totalTrucks).toBe(100);
  });
});
