/**
 * tests/phase-d-property.test.ts
 *
 * Phase D — property-based / randomized tests.
 *
 * Mission: separate SOFTWARE CORRECTNESS (what these tests prove) from
 * REAL-WORLD ACCURACY (which needs real terminal data — see
 * lib/datasets/schemas.ts and docs/ACCEPTANCE.md). Nothing here invents
 * operational data; every instance is synthesized in-test from a seeded
 * PRNG (tests/phase-d-helpers.ts, mulberry32).
 *
 * Properties covered:
 *   P1  optimizer invariants over random instances (both methods):
 *       capacity, slot alignment, no double-booking, day preservation,
 *       terminal/gate consistency, rescheduled-flag rule, wait formula.
 *   P2  annealed never scores worse than greedy on the shared cost fn.
 *   P3  confirmed (frozen) bookings survive replanning byte-identical.
 *   P4  infeasible instances -> graceful { feasible:false }, never "optimal".
 *   P5  exact solver matches an INDEPENDENT brute force on wider shapes
 *       (n<=4 exhaustive over random seeds/windows; n=5 sampled).
 */

import { describe, it, expect } from "vitest";
import {
  optimizeSlots,
  scorePlan,
  loadBySlot,
} from "../lib/optimizer";
import { exactOptimize } from "../lib/exact";
import { replanDay, type Disruption } from "../lib/replan";
import {
  GATE_IDS,
  SLOTS_PER_GATE,
  SLOT_MINUTES,
  DAY_START_MIN,
  DAY_END_MIN,
  capacityForGate,
  serviceMinForGate,
  terminalForGate,
  slotIndexToStart,
  gateForTerminal,
} from "../lib/types";
import type { BookingRequest, SlotAssignment, GateId } from "../lib/types";
import {
  makeTestRng,
  randomBookingRequests,
  randomBlockedLoads,
} from "./phase-d-helpers";

/** Property-test seeds — bump count for a longer (slower) sweep. */
const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88];

/** The reschedule rule shared by optimizer.assignmentOf and exact.ts. */
function expectedRescheduled(req: BookingRequest, slotStart: number): boolean {
  return !(
    slotStart >= req.preferredStart - 15 && slotStart <= req.preferredEnd
  );
}

/** Check every optimizer invariant on one finished plan. */
function assertPlanInvariants(
  assignments: SlotAssignment[],
  requests: BookingRequest[],
  label: string,
): void {
  const byId = new Map(requests.map((r) => [r.id, r]));

  // P1a: every request assigned exactly once (no drops, no double-booking).
  expect(assignments, `${label}: assignment count`).toHaveLength(requests.length);
  const seen = new Set<string>();
  for (const a of assignments) {
    expect(seen.has(a.requestId), `${label}: duplicate ${a.requestId}`).toBe(false);
    seen.add(a.requestId);
    expect(byId.has(a.requestId), `${label}: unknown ${a.requestId}`).toBe(true);
  }

  // P1b: slot alignment — inside the operating day, on a 30-min boundary.
  for (const a of assignments) {
    expect(a.slotStart, `${label}: slotStart range`).toBeGreaterThanOrEqual(DAY_START_MIN);
    expect(a.slotStart, `${label}: slotStart range`).toBeLessThan(DAY_END_MIN);
    expect(
      (a.slotStart - DAY_START_MIN) % SLOT_MINUTES,
      `${label}: slot alignment`,
    ).toBe(0);
    expect([0, 1, 2].includes(a.gate), `${label}: gate id`).toBe(true);
  }

  // P1c: capacity respected on every (gate, slot) — no silent violations.
  const loads = loadBySlot(assignments);
  for (const [key, load] of loads) {
    const gate = Number(key.split(":")[0]) as GateId;
    expect(load, `${label}: capacity ${key}`).toBeLessThanOrEqual(
      capacityForGate(gate),
    );
  }

  // P1d: terminal/gate consistency, day preservation, flag rule, wait formula.
  const loadMap = new Map<string, number>();
  for (const a of assignments) {
    const k = `${a.gate}:${a.slotStart}`;
    loadMap.set(k, (loadMap.get(k) ?? 0) + 1);
  }
  for (const a of assignments) {
    const req = byId.get(a.requestId)!;
    expect(a.terminal, `${label}: terminal matches gate`).toBe(
      terminalForGate(a.gate),
    );
    expect(a.day, `${label}: day preserved`).toBe(req.day ?? 0);
    expect(a.rescheduled, `${label}: rescheduled flag`).toBe(
      expectedRescheduled(req, a.slotStart),
    );
    const load = loadMap.get(`${a.gate}:${a.slotStart}`)!;
    expect(a.waitEstimateMin, `${label}: wait formula`).toBeCloseTo(
      Math.max(0, ((load - 1) * serviceMinForGate(a.gate)) / 2),
      9,
    );
    expect(a.noShowProbability, `${label}: no-show in [0,1]`).toBeGreaterThanOrEqual(0);
    expect(a.noShowProbability, `${label}: no-show in [0,1]`).toBeLessThanOrEqual(1);
  }
}

describe("P1: optimizer invariants over random instances", () => {
  for (const seed of SEEDS) {
    for (const method of ["greedy", "annealed"] as const) {
      it(`seed=${seed} method=${method} (spread windows, n=60)`, () => {
        const reqs = randomBookingRequests({ count: 60, seed });
        const plan = optimizeSlots(reqs, { seed, method });
        assertPlanInvariants(plan, reqs, `seed=${seed}/${method}`);
      });

      it(`seed=${seed} method=${method} (tight windows, n=40)`, () => {
        const reqs = randomBookingRequests({ count: 40, seed, windowMode: "tight" });
        const plan = optimizeSlots(reqs, { seed, method });
        assertPlanInvariants(plan, reqs, `seed=${seed}/${method}/tight`);
      });
    }
  }

  it("determinism: same seed + same demand -> byte-identical plan", () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const reqs = randomBookingRequests({ count: 50, seed });
      const a = optimizeSlots(reqs, { seed, method: "annealed" });
      const b = optimizeSlots(reqs, { seed, method: "annealed" });
      expect(a).toEqual(b);
    }
  });
});

describe("P2: annealed never worse than greedy (shared cost function)", () => {
  for (const seed of SEEDS) {
    it(`seed=${seed}`, () => {
      const reqs = randomBookingRequests({ count: 45, seed });
      const greedy = optimizeSlots(reqs, { seed, method: "greedy" });
      const annealed = optimizeSlots(reqs, { seed, method: "annealed" });
      const gCost = scorePlan(greedy, reqs).cost;
      const aCost = scorePlan(annealed, reqs).cost;
      expect(
        aCost,
        `annealed (${aCost}) must not exceed greedy (${gCost})`,
      ).toBeLessThanOrEqual(gCost + 1e-9);
    });
  }
});

describe("P3: confirmed bookings survive replanning", () => {
  for (const seed of SEEDS) {
    it(`seed=${seed}: frozen assignments are byte-identical after replan`, () => {
      const rng = makeTestRng(seed * 1000 + 7);
      const reqs = randomBookingRequests({ count: 60, seed });
      const plan = optimizeSlots(reqs, { seed });
      const nowMin = rng.int(600, 900);

      // Random disruptions only among trucks not yet served.
      const future = plan.filter((a) => a.slotStart >= nowMin);
      const disruptions: Disruption[] = [];
      const shuffled = [...future].sort(() => rng.next() - 0.5).slice(0, 4);
      for (const a of shuffled) {
        disruptions.push(
          rng.chance(0.5)
            ? { requestId: a.requestId, kind: "no-show" }
            : { requestId: a.requestId, kind: "late", lateByMin: rng.int(15, 120) },
        );
      }

      const result = replanDay(reqs, plan, disruptions, nowMin, { seed });
      const frozen = plan.filter((a) => a.slotStart < nowMin);
      const afterById = new Map(result.after.map((a) => [a.requestId, a]));
      const planById = new Map(plan.map((a) => [a.requestId, a]));

      // Late trucks are re-planned against a REWRITTEN request (preferred
      // window starting at max(nowMin, oldSlotStart + lateByMin)) — the
      // rescheduled flag is computed against that rewritten request, so the
      // invariant check must use the effective requests, not the originals.
      const effectiveReqs = reqs.map((r) => {
        const d = disruptions.find((x) => x.requestId === r.id);
        const a = planById.get(r.id);
        if (d?.kind === "late" && a && a.slotStart >= nowMin) {
          const earliest = Math.min(
            DAY_END_MIN - SLOT_MINUTES,
            Math.max(nowMin, a.slotStart + Math.max(0, d.lateByMin ?? 30)),
          );
          return { ...r, preferredStart: earliest, preferredEnd: DAY_END_MIN };
        }
        return r;
      });

      // Every frozen booking survives byte-identical.
      for (const f of frozen) {
        expect(afterById.get(f.requestId), `frozen ${f.requestId} kept`).toEqual(f);
      }
      // No-show trucks are gone; nothing new appears from nowhere.
      const noShowIds = new Set(
        disruptions.filter((d) => d.kind === "no-show").map((d) => d.requestId),
      );
      for (const id of noShowIds) {
        const wasFrozen = frozen.some((f) => f.requestId === id);
        if (!wasFrozen) {
          expect(afterById.has(id), `no-show ${id} removed`).toBe(false);
        }
      }
      // Replanned (non-frozen, non-removed) trucks are never placed in the past.
      for (const a of result.after) {
        const wasFrozen = frozen.some((f) => f.requestId === a.requestId);
        if (!wasFrozen) {
          expect(a.slotStart, `not in the past: ${a.requestId}`).toBeGreaterThanOrEqual(
            nowMin,
          );
        }
      }
      // Capacity still respected after replanning (checked against the
      // effective requests late trucks were actually planned with).
      assertPlanInvariants(
        result.after,
        effectiveReqs.filter((r) => afterById.has(r.id)),
        `replan/${seed}`,
      );
    });
  }
});

describe("P4: infeasible instances fail gracefully, never 'optimal'", () => {
  it("fully-blocked day -> feasible:false, optimal:false, no assignments", () => {
    // Every (gate, slot) pre-filled beyond capacity with frozen loads.
    const blocked: Array<{ gate: GateId; slotStart: number }> = [];
    for (const g of GATE_IDS) {
      for (let s = 0; s < SLOTS_PER_GATE; s++) {
        for (let k = 0; k < capacityForGate(g) + 1; k++) {
          blocked.push({ gate: g, slotStart: slotIndexToStart(s) });
        }
      }
    }
    const reqs = randomBookingRequests({ count: 3, seed: 999 });
    const r = exactOptimize(reqs, { blocked, maxNodes: 200_000 });
    expect(r.feasible).toBe(false);
    expect(r.optimal).toBe(false);
    expect(r.assignments).toHaveLength(0);
  });

  it("random heavy blocking never certifies an infeasible plan as optimal", () => {
    for (const seed of SEEDS) {
      const blocked = randomBlockedLoads(seed, 0.85);
      const reqs = randomBookingRequests({ count: 6, seed: seed + 5000 });
      const r = exactOptimize(reqs, { blocked, seed, maxNodes: 200_000 });
      if (!r.feasible) {
        // Graceful failure mode: must not claim optimality.
        expect(r.optimal).toBe(false);
        expect(r.assignments).toHaveLength(0);
      } else {
        // Feasible mode: every assignment respects capacity incl. blocked.
        const loads = new Map<string, number>();
        for (const b of blocked) {
          const k = `${b.gate}:${b.slotStart}`;
          loads.set(k, (loads.get(k) ?? 0) + 1);
        }
        for (const a of r.assignments) {
          const k = `${a.gate}:${a.slotStart}`;
          loads.set(k, (loads.get(k) ?? 0) + 1);
        }
        for (const [k, load] of loads) {
          const gate = Number(k.split(":")[0]) as GateId;
          expect(load, `seed=${seed} ${k}`).toBeLessThanOrEqual(capacityForGate(gate));
        }
      }
    }
  });
});

/**
 * Independent brute-force optimum (written from scratch against the
 * DOCUMENTED cost function 10*peak + 3*resched + 2*mismatch + 0.5*wait,
 * wait = sum L(L-1)*tau/2). Shares no code with lib/exact.ts: naive
 * recursive enumeration with O(1) incremental cost updates and a monotone
 * partial-cost bound (partial peak / separable terms / partial wait only
 * grow as trucks are added, so pruning at partial >= best can never cut
 * the true optimum). Capacity is a hard constraint in both.
 */
function bruteForceOptimum(requests: BookingRequest[]): number {
  const n = requests.length;
  const total = GATE_IDS.length * SLOTS_PER_GATE;
  const sep: number[][] = requests.map((req) => {
    const arr = new Array<number>(total).fill(0);
    for (let g = 0; g < 3; g++) {
      for (let s = 0; s < SLOTS_PER_GATE; s++) {
        const slotStart = slotIndexToStart(s);
        let c = 0;
        if (!(slotStart >= req.preferredStart - 15 && slotStart <= req.preferredEnd)) c += 3;
        if (req.terminal && req.terminal !== "any" && gateForTerminal(req.terminal) !== g) c += 2;
        arr[g * SLOTS_PER_GATE + s] = c;
      }
    }
    return arr;
  });
  const tau = [serviceMinForGate(0), serviceMinForGate(1), serviceMinForGate(2)];
  const cap = [capacityForGate(0), capacityForGate(1), capacityForGate(2)];
  const loads: number[][] = GATE_IDS.map(() => new Array<number>(SLOTS_PER_GATE).fill(0));
  let best = Infinity;
  let peak = 0;
  const rec = (i: number, acc: number): void => {
    if (i === n) {
      if (acc < best) best = acc;
      return;
    }
    const sepI = sep[i];
    for (let c = 0; c < total; c++) {
      const g = Math.floor(c / SLOTS_PER_GATE);
      const s = c % SLOTS_PER_GATE;
      const L = loads[g][s];
      if (L >= cap[g]) continue;
      const newPeak = L + 1 > peak ? L + 1 : peak;
      // Incremental cost: peak delta + separable terms + wait delta
      // (adding a truck to load L raises sum L(L-1)tau/2 by L*tau; x0.5 weight).
      const dCost = 10 * (newPeak - peak) + sepI[c] + 0.5 * L * tau[g];
      const acc2 = acc + dCost;
      if (acc2 >= best) continue; // monotone bound: safe to prune
      loads[g][s] = L + 1;
      const oldPeak = peak;
      peak = newPeak;
      rec(i + 1, acc2);
      loads[g][s] = L;
      peak = oldPeak;
    }
  };
  rec(0, 0);
  return best;
}

describe("P5: exact solver matches independent brute force (wider shapes)", () => {
  // n<=4 exhaustive: every seed below is a full 96^n enumeration.
  const shapes: Array<{ n: number; seeds: number[]; tight?: boolean }> = [
    { n: 2, seeds: [101, 102, 103, 104] },
    { n: 3, seeds: [201, 202, 203] },
    { n: 4, seeds: [301, 302] },
    { n: 4, seeds: [311, 312], tight: true },
  ];
  for (const { n, seeds, tight } of shapes) {
    for (const seed of seeds) {
      it(`n=${n} seed=${seed}${tight ? " tight" : ""}`, () => {
        const reqs = randomBookingRequests({
          count: n,
          seed,
          windowMode: tight ? "tight" : "spread",
        });
        const brute = bruteForceOptimum(reqs);
        expect(brute).toBeLessThan(Infinity);
        const exact = exactOptimize(reqs, { seed });
        expect(exact.feasible).toBe(true);
        expect(exact.optimal).toBe(true);
        expect(exact.cost).toBeCloseTo(brute, 9);
        // The returned plan scores identically under the shared scorer.
        expect(scorePlan(exact.assignments, reqs).cost).toBeCloseTo(brute, 9);
      });
    }
  }

  // n=5 sampled: still a full 96^5 enumeration, just fewer instances.
  for (const seed of [401, 402]) {
    it(`n=5 sampled seed=${seed}`, () => {
      const reqs = randomBookingRequests({ count: 5, seed });
      const brute = bruteForceOptimum(reqs);
      expect(brute).toBeLessThan(Infinity);
      const exact = exactOptimize(reqs, { seed });
      expect(exact.feasible).toBe(true);
      expect(exact.optimal).toBe(true);
      expect(exact.cost).toBeCloseTo(brute, 9);
    });
  }
});
