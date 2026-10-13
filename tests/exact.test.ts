import { describe, it, expect } from "vitest";
import { generateDayRequests } from "../lib/data";
import { optimizeSlots, scorePlan } from "../lib/optimizer";
import {
  exactOptimize,
  compareAgainstExact,
  EXACT_MAX_TRUCKS,
} from "../lib/exact";
import {
  GATE_IDS,
  SLOTS_PER_GATE,
  slotIndexToStart,
  capacityForGate,
  serviceMinForGate,
} from "../lib/types";
import type { BookingRequest } from "../lib/types";

/**
 * Independent brute-force reference: enumerates every (gate, slot)
 * assignment for n = 3 and computes the shared cost function from scratch.
 * The exact solver must match it — this is the ground truth for B&B.
 */
function bruteForceMinCost(requests: BookingRequest[]): number {
  const n = requests.length;
  const loads = GATE_IDS.map(() => new Array<number>(SLOTS_PER_GATE).fill(0));
  const choice: Array<[number, number]> = new Array(n);
  let best = Infinity;
  const costOf = (): number => {
    let maxL = 0;
    let sep = 0;
    let wait = 0;
    for (let i = 0; i < n; i++) {
      const [g, s] = choice[i];
      const ss = slotIndexToStart(s);
      const r = requests[i];
      if (!(ss >= r.preferredStart - 15 && ss <= r.preferredEnd)) sep += 3;
      if (r.terminal && r.terminal !== "any") {
        const eg = r.terminal === "T1" ? 0 : r.terminal === "T2" ? 1 : 2;
        if (eg !== g) sep += 2;
      }
    }
    for (const g of GATE_IDS) {
      for (let s = 0; s < SLOTS_PER_GATE; s++) {
        const L = loads[g][s];
        if (L > maxL) maxL = L;
        if (L > 1) wait += (L * (L - 1) * serviceMinForGate(g)) / 2;
      }
    }
    return maxL * 10 + sep + wait * 0.5;
  };
  const rec = (i: number): void => {
    if (i === n) {
      const c = costOf();
      if (c < best) best = c;
      return;
    }
    for (const g of GATE_IDS) {
      for (let s = 0; s < SLOTS_PER_GATE; s++) {
        if (loads[g][s] >= capacityForGate(g)) continue;
        loads[g][s] += 1;
        choice[i] = [g, s];
        rec(i + 1);
        loads[g][s] -= 1;
      }
    }
  };
  rec(0);
  return best;
}

describe("exact branch-and-bound solver", () => {
  it("matches brute force on tiny instances", () => {
    for (const seed of [11, 23]) {
      const reqs = generateDayRequests(3, seed);
      const exact = exactOptimize(reqs, { seed });
      expect(exact.optimal).toBe(true);
      expect(exact.feasible).toBe(true);
      expect(exact.cost).toBeCloseTo(bruteForceMinCost(reqs), 9);
    }
  });

  it("proves optimality on small instances and never exceeds heuristic cost", () => {
    for (const seed of [1, 2, 3]) {
      const reqs = generateDayRequests(8, seed);
      const cmp = compareAgainstExact(reqs, { seed });
      expect(cmp.exact.optimal).toBe(true);
      expect(cmp.exact.aborted).toBe(false);
      // Exact optimum is a lower bound on every heuristic.
      expect(cmp.exact.cost).toBeLessThanOrEqual(cmp.greedy.cost + 1e-9);
      expect(cmp.exact.cost).toBeLessThanOrEqual(cmp.annealed.cost + 1e-9);
      // Gaps are non-negative.
      expect(cmp.greedy.gapPct).toBeGreaterThanOrEqual(-1e-9);
      expect(cmp.annealed.gapPct).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it("SA achieves zero gap on these small instances (empirical, documented)", () => {
    // On tiny instances SA reliably finds the proven optimum. This is an
    // empirical property of this implementation on these seeds, not a
    // theorem — the assertion documents the observed behaviour.
    for (const seed of [1, 2, 3]) {
      const reqs = generateDayRequests(8, seed);
      const cmp = compareAgainstExact(reqs, { seed });
      expect(cmp.annealed.gapPct).toBeCloseTo(0, 9);
    }
  });

  it("exact cost equals scorePlan cost of its own assignments", () => {
    const reqs = generateDayRequests(8, 5);
    const exact = exactOptimize(reqs, { seed: 5 });
    expect(scorePlan(exact.assignments, reqs).cost).toBeCloseTo(exact.cost, 9);
  });

  it("assigns every request exactly once and respects capacity", () => {
    const reqs = generateDayRequests(10, 9);
    const exact = exactOptimize(reqs, { seed: 9 });
    expect(exact.assignments).toHaveLength(reqs.length);
    expect(new Set(exact.assignments.map((a) => a.requestId)).size).toBe(
      reqs.length,
    );
    const loads = new Map<string, number>();
    for (const a of exact.assignments) {
      const k = `${a.gate}:${a.slotStart}`;
      loads.set(k, (loads.get(k) ?? 0) + 1);
    }
    for (const [k, l] of loads) {
      const gate = Number(k.split(":")[0]) as 0 | 1 | 2;
      expect(l).toBeLessThanOrEqual(capacityForGate(gate));
    }
  });

  it("refuses instances above the cap", () => {
    const reqs = generateDayRequests(EXACT_MAX_TRUCKS + 1, 1);
    expect(() => exactOptimize(reqs, {})).toThrow();
  });

  it("reports not-proven (never false optimal) when the node budget is exhausted", () => {
    const reqs = generateDayRequests(12, 4);
    const res = exactOptimize(reqs, { seed: 4, maxNodes: 10 });
    // With a 10-node budget the search cannot complete: it must say so.
    expect(res.optimal).toBe(false);
    expect(res.aborted).toBe(true);
    // Best-so-far is still a valid feasible plan.
    expect(res.assignments.length).toBeGreaterThan(0);
  });

  it("is deterministic for a fixed seed", () => {
    const reqs = generateDayRequests(8, 6);
    const a = exactOptimize(reqs, { seed: 6 });
    const b = exactOptimize(reqs, { seed: 6 });
    expect(a).toEqual(b);
  });
});
