import { describe, it, expect } from "vitest";
import { exactOptimize, compareAgainstExact } from "../lib/exact";
import { optimizeSlots, scorePlan } from "../lib/optimizer";
import {
  GATE_IDS,
  SLOTS_PER_GATE,
  slotIndexToStart,
  serviceMinForGate,
  capacityForGate,
  gateForTerminal,
} from "../lib/types";
import type { BookingRequest, GateId, SlotAssignment } from "../lib/types";

function mkRequest(over: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id: "REQ-X-1",
    company: "Atlas Freight Maroc",
    truckPlate: "48213 - A - 6",
    cargo: "general",
    move: "import",
    containers: 1,
    preferredStart: 480,
    preferredEnd: 600,
    leadTimeHours: 24,
    driverNoShowRate: 0.05,
    createdAt: 1,
    ...over,
  };
}

/**
 * Independent brute-force optimum for tiny instances: enumerates every
 * (gate, slot) combination and scores with a from-scratch implementation of
 * the shared cost function (10·peak + 3·resched + 2·mismatch + 0.5·wait,
 * wait = Σ L(L−1)τ/2). If the branch-and-bound lower bound were invalid it
 * could prune the true optimum and this test would catch the mismatch.
 */
function bruteForceOptimum(requests: BookingRequest[]): number {
  const n = requests.length;
  const total = GATE_IDS.length * SLOTS_PER_GATE;
  let best = Infinity;
  const choice = new Array<number>(n).fill(0);

  const score = (): number => {
    const loads: number[][] = GATE_IDS.map(() =>
      new Array<number>(SLOTS_PER_GATE).fill(0),
    );
    const assign: Array<{ g: number; s: number }> = [];
    for (let i = 0; i < n; i++) {
      const c = choice[i];
      const g = Math.floor(c / SLOTS_PER_GATE);
      const s = c % SLOTS_PER_GATE;
      assign.push({ g, s });
      loads[g][s] += 1;
    }
    let peak = 0;
    let resched = 0;
    let mismatch = 0;
    let wait = 0;
    for (let i = 0; i < n; i++) {
      const { g, s } = assign[i];
      const req = requests[i];
      const slotStart = slotIndexToStart(s);
      if (!(slotStart >= req.preferredStart - 15 && slotStart <= req.preferredEnd))
        resched += 1;
      if (req.terminal && req.terminal !== "any") {
        if (gateForTerminal(req.terminal) !== g) mismatch += 1;
      }
      const L = loads[g][s];
      if (L > peak) peak = L;
    }
    for (const g of GATE_IDS) {
      const tau = serviceMinForGate(g);
      for (let s = 0; s < SLOTS_PER_GATE; s++) {
        const L = loads[g][s];
        wait += (L * (L - 1) * tau) / 2;
      }
    }
    // Capacity is a hard constraint — skip infeasible combos.
    for (const g of GATE_IDS) {
      for (let s = 0; s < SLOTS_PER_GATE; s++) {
        if (loads[g][s] > capacityForGate(g)) return Infinity;
      }
    }
    return peak * 10 + resched * 3 + mismatch * 2 + wait * 0.5;
  };

  const rec = (i: number): void => {
    if (i === n) {
      const c = score();
      if (c < best) best = c;
      return;
    }
    for (let c = 0; c < total; c++) {
      choice[i] = c;
      rec(i + 1);
    }
  };
  rec(0);
  return best;
}

describe("exact solver optimality claims (B9)", () => {
  it("matches independent brute force on tiny instances", () => {
    const reqs = [
      mkRequest({ id: "b1", preferredStart: 480, preferredEnd: 540, terminal: "T1" }),
      mkRequest({ id: "b2", preferredStart: 500, preferredEnd: 620, terminal: "T2" }),
      mkRequest({ id: "b3", preferredStart: 900, preferredEnd: 1020, terminal: "T3" }),
    ];
    const exact = exactOptimize(reqs, { seed: 7 });
    const brute = bruteForceOptimum(reqs);
    expect(exact.feasible).toBe(true);
    expect(exact.optimal).toBe(true);
    expect(exact.cost).toBeCloseTo(brute, 9);
    // The returned plan scores identically under scorePlan.
    expect(scorePlan(exact.assignments, reqs).cost).toBeCloseTo(exact.cost, 9);
  }, 60000);

  it("never claims optimal when the node budget is exhausted", () => {
    const reqs = [
      mkRequest({ id: "c1", preferredStart: 480, preferredEnd: 540 }),
      mkRequest({ id: "c2", preferredStart: 480, preferredEnd: 540 }),
      mkRequest({ id: "c3", preferredStart: 480, preferredEnd: 540 }),
      mkRequest({ id: "c4", preferredStart: 480, preferredEnd: 540 }),
      mkRequest({ id: "c5", preferredStart: 480, preferredEnd: 540 }),
      mkRequest({ id: "c6", preferredStart: 480, preferredEnd: 540 }),
    ];
    const r = exactOptimize(reqs, { seed: 7, maxNodes: 50 });
    expect(r.aborted).toBe(true);
    expect(r.optimal).toBe(false);
    // ...but the returned plan is still feasible and scored honestly.
    expect(r.assignments).toHaveLength(6);
  });

  it("regression: fully-blocked day is infeasible, never 'proven optimal'", () => {
    // Every slot filled beyond capacity by frozen loads. The greedy
    // incumbent must overflow, so the solver must report feasible:false —
    // NOT certify the overflowing plan as a proven optimum (the old
    // incumbent check ignored blocked loads).
    const reqs = [mkRequest({ id: "e1" }), mkRequest({ id: "e2" })];
    const blocked: Array<{ gate: GateId; slotStart: number }> = [];
    for (const g of GATE_IDS) {
      for (let s = 0; s < SLOTS_PER_GATE; s++) {
        for (let k = 0; k < capacityForGate(g) + 1; k++) {
          blocked.push({ gate: g, slotStart: slotIndexToStart(s) });
        }
      }
    }
    const r = exactOptimize(reqs, { blocked, maxNodes: 100000 });
    expect(r.feasible).toBe(false);
    expect(r.optimal).toBe(false);
    expect(r.assignments).toHaveLength(0);
  });

  it("blocked loads still count toward capacity in the winning plan", () => {
    // One slot pre-filled to capacity-1; two trucks want it. The solver may
    // use the last free unit but must not exceed capacity including blocked.
    const reqs = [
      mkRequest({ id: "d1", preferredStart: 480, preferredEnd: 510 }),
      mkRequest({ id: "d2", preferredStart: 480, preferredEnd: 510 }),
    ];
    const blocked: Array<{ gate: GateId; slotStart: number }> = [];
    for (let k = 0; k < capacityForGate(0) - 1; k++) {
      blocked.push({ gate: 0, slotStart: 480 });
    }
    const r = exactOptimize(reqs, { blocked, seed: 7 });
    expect(r.feasible).toBe(true);
    const atSlot = r.assignments.filter(
      (a) => a.gate === 0 && a.slotStart === 480,
    ).length;
    expect(atSlot + (capacityForGate(0) - 1)).toBeLessThanOrEqual(
      capacityForGate(0),
    );
  });

  it("heuristic gaps are honest: exact cost <= greedy/annealed cost", () => {
    const reqs = [
      mkRequest({ id: "g1", preferredStart: 420, preferredEnd: 540, terminal: "T1" }),
      mkRequest({ id: "g2", preferredStart: 480, preferredEnd: 600, terminal: "T2" }),
      mkRequest({ id: "g3", preferredStart: 540, preferredEnd: 660 }),
      mkRequest({ id: "g4", preferredStart: 600, preferredEnd: 720, terminal: "T3" }),
      mkRequest({ id: "g5", preferredStart: 840, preferredEnd: 960 }),
      mkRequest({ id: "g6", preferredStart: 900, preferredEnd: 1020, terminal: "T1" }),
      mkRequest({ id: "g7", preferredStart: 960, preferredEnd: 1080 }),
      mkRequest({ id: "g8", preferredStart: 1020, preferredEnd: 1140, terminal: "T2" }),
    ];
    const cmp = compareAgainstExact(reqs, { seed: 7 });
    expect(cmp.exact.feasible).toBe(true);
    if (cmp.exact.optimal) {
      expect(cmp.exact.cost).toBeLessThanOrEqual(cmp.greedy.cost + 1e-9);
      expect(cmp.exact.cost).toBeLessThanOrEqual(cmp.annealed.cost + 1e-9);
      expect(cmp.greedy.gapPct).toBeGreaterThanOrEqual(-1e-9);
      expect(cmp.annealed.gapPct).toBeGreaterThanOrEqual(-1e-9);
    }
    // Sanity: gap formula matches its definition.
    const g = optimizeSlots(reqs, { seed: 7, method: "greedy" });
    const gc = scorePlan(g, reqs).cost;
    if (cmp.exact.cost > 0) {
      expect(cmp.greedy.gapPct).toBeCloseTo(
        ((gc - cmp.exact.cost) / cmp.exact.cost) * 100,
        9,
      );
    }
  }, 120000);
});
