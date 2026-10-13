import { describe, it, expect } from "vitest";
import { generateWeekRequests, horizonDayLabel, horizonDayISO } from "../lib/data";
import { optimizeHorizon, optimizeSlots, scorePlan } from "../lib/optimizer";
import { simulateWeek } from "../lib/simulation";
import { loadBySlot } from "../lib/optimizer";
import { capacityForGate, HORIZON_DAYS } from "../lib/types";
import type { GateId } from "../lib/types";

describe("multi-day rolling horizon", () => {
  it("generates one request set per horizon day", () => {
    const reqs = generateWeekRequests(10, 42, 7);
    expect(reqs).toHaveLength(70);
    for (let d = 0; d < 7; d++) {
      expect(reqs.filter((r) => r.day === d)).toHaveLength(10);
    }
  });

  it("day labels are stable, distinct, and human-readable", () => {
    const labels = Array.from({ length: HORIZON_DAYS }, (_, d) => horizonDayLabel(d));
    expect(new Set(labels).size).toBe(HORIZON_DAYS);
    expect(labels[0]).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/);
    expect(horizonDayISO(0)).toBe("2026-10-12");
    expect(horizonDayISO(6)).toBe("2026-10-18");
  });

  it("optimizeHorizon covers every day and respects per-gate capacity", () => {
    const reqs = generateWeekRequests(60, 42, 7);
    const plan = optimizeHorizon(reqs, { seed: 42 });
    expect(plan.days).toHaveLength(HORIZON_DAYS);
    for (const d of plan.days) {
      expect(d.assignments).toHaveLength(d.requests.length);
      for (const [key, load] of loadBySlot(d.assignments)) {
        const gate = Number(key.split(":")[0]) as GateId;
        expect(load).toBeLessThanOrEqual(capacityForGate(gate));
      }
      for (const a of d.assignments) {
        expect(a.day).toBe(d.day);
      }
    }
  });

  it("horizon plans match per-day optimization", () => {
    const reqs = generateWeekRequests(40, 9, 3);
    const plan = optimizeHorizon(reqs, { seed: 9 });
    for (const d of plan.days.slice(0, 3)) {
      const single = optimizeSlots(d.requests, { seed: 9 + d.day * 101 });
      expect(d.assignments).toEqual(single);
    }
  });

  it("simulateWeek aggregates 7 days with consistent totals", () => {
    // 400 trucks/day: near the congestion threshold, where TAS actually
    // reduces waiting. At 100/day the gates sit below capacity and the
    // comparison is noise (both round to the same wait).
    const week = simulateWeek(400, 42, 7, "greedy");
    expect(week.days).toHaveLength(7);
    expect(week.horizon.days).toBe(7);
    expect(week.horizon.totalTrucks).toBe(2800);
    expect(week.horizon.co2SavedTonnes).toBeGreaterThanOrEqual(0);
    expect(week.horizon.avgWaitOptimized).toBeLessThan(week.horizon.avgWaitBaseline);
    const sumCo2 = week.days.reduce((s, r) => s + r.optimized.co2Tonnes, 0);
    expect(Math.abs(sumCo2 - week.horizon.totalCo2Optimized)).toBeLessThan(0.01);
  });

  it("simulateWeek is deterministic", () => {
    const a = simulateWeek(80, 5, 3, "greedy");
    const b = simulateWeek(80, 5, 3, "greedy");
    expect(a).toEqual(b);
  });

  it("annealed week never exceeds greedy week on optimizer cost", () => {
    // Week-level sanity: each day's annealed plan costs <= its greedy plan.
    const reqs = generateWeekRequests(60, 42, 3);
    for (const dayReqs of [0, 1, 2].map((d) => reqs.filter((r) => r.day === d))) {
      const g = scorePlan(optimizeSlots(dayReqs, { seed: 42, method: "greedy" }), dayReqs);
      const a = scorePlan(optimizeSlots(dayReqs, { seed: 42, method: "annealed" }), dayReqs);
      expect(a.cost).toBeLessThanOrEqual(g.cost + 1e-9);
    }
  });
});
