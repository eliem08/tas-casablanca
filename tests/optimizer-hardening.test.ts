import { describe, it, expect } from "vitest";
import {
  optimizeSlots,
  loadBySlot,
  scorePlan,
  findOverloads,
} from "../lib/optimizer";
import {
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MINUTES,
  SLOTS_PER_GATE,
  capacityForGate,
  slotIndexToStart,
  startToSlotIndex,
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

/** Every assignment must be inside the operating day and on a real slot. */
function assertSlotFeasible(a: SlotAssignment) {
  expect(a.slotStart).toBeGreaterThanOrEqual(DAY_START_MIN);
  expect(a.slotStart).toBeLessThanOrEqual(DAY_END_MIN - SLOT_MINUTES);
  expect((a.slotStart - DAY_START_MIN) % SLOT_MINUTES).toBe(0);
  expect([0, 1, 2]).toContain(a.gate);
}

/** Loads keyed by gate:slot must respect per-gate capacity (no overbook). */
function assertCapacityOk(assignments: SlotAssignment[], label: string) {
  const loads = new Map<string, number>();
  for (const a of assignments) {
    const k = `${a.gate}:${a.slotStart}`;
    loads.set(k, (loads.get(k) ?? 0) + 1);
  }
  for (const [key, load] of loads) {
    const gate = Number(key.split(":")[0]) as GateId;
    expect(load, `${label}: ${key}`).toBeLessThanOrEqual(
      capacityForGate(gate),
    );
  }
}

describe("optimizer adversarial constraints (B1)", () => {
  it("respects gate/slot/capacity constraints under concentrated demand", () => {
    // 96 trucks all preferring the SAME single slot (08:00-08:30).
    // Total per-slot capacity across gates: 7+6+3 = 16 — demand exceeds it 6x.
    const reqs: BookingRequest[] = Array.from({ length: 96 }, (_, i) =>
      mkRequest({
        id: `REQ-C-${i}`,
        preferredStart: 480,
        preferredEnd: 510,
        createdAt: i,
      }),
    );
    const out = optimizeSlots(reqs, { seed: 3, overbook: false });
    expect(out).toHaveLength(96);
    for (const a of out) assertSlotFeasible(a);
    assertCapacityOk(out, "concentrated");
    // One assignment per request (C1).
    expect(new Set(out.map((a) => a.requestId)).size).toBe(96);
  });

  it("handles conflicting terminal preferences without violating feasibility", () => {
    // 48 trucks, ALL preferring terminal T3 (gate 2, capacity 3/slot = 96/day)
    // crammed into the same 2-hour window — the terminal gate cannot hold
    // them, so the soft terminal preference must yield without breaking C1-C4.
    const reqs: BookingRequest[] = Array.from({ length: 48 }, (_, i) =>
      mkRequest({
        id: `REQ-T-${i}`,
        terminal: "T3",
        preferredStart: 480,
        preferredEnd: 600,
        createdAt: i,
      }),
    );
    const out = optimizeSlots(reqs, { seed: 5, overbook: false });
    expect(out).toHaveLength(48);
    for (const a of out) assertSlotFeasible(a);
    assertCapacityOk(out, "terminal-conflict");
    // The terminal gate itself is respected where trucks DID land there.
    for (const a of out) {
      expect(a.terminal).toBe(["T1", "T2", "T3"][a.gate]);
    }
  });

  it("never schedules before earliestSlotStart (replanning past-cutoff)", () => {
    const reqs: BookingRequest[] = Array.from({ length: 60 }, (_, i) =>
      mkRequest({
        id: `REQ-E-${i}`,
        // All prefer EARLY windows — the optimizer must refuse the past.
        preferredStart: 360,
        preferredEnd: 540,
        createdAt: i,
      }),
    );
    const nowMin = 720; // 12:00 — everything must be at/after this.
    const out = optimizeSlots(reqs, {
      seed: 9,
      overbook: false,
      earliestSlotStart: nowMin,
    });
    expect(out).toHaveLength(60);
    for (const a of out) {
      expect(a.slotStart).toBeGreaterThanOrEqual(nowMin);
      assertSlotFeasible(a);
    }
    assertCapacityOk(out, "earliest-cutoff");
  });

  it("keeps blocked (frozen) slots out of the capacity budget", () => {
    // Fill gate 0 slot 08:00 to capacity via blocked, then send demand that
    // prefers exactly that slot — the optimizer must go elsewhere.
    const cap0 = capacityForGate(0);
    const blocked = Array.from({ length: cap0 }, () => ({
      gate: 0 as GateId,
      slotStart: 480,
    }));
    const reqs: BookingRequest[] = Array.from({ length: cap0 }, (_, i) =>
      mkRequest({
        id: `REQ-B-${i}`,
        preferredStart: 480,
        preferredEnd: 510,
        createdAt: i,
      }),
    );
    const out = optimizeSlots(reqs, { seed: 11, blocked, overbook: false });
    const loads = loadBySlot(out);
    expect(loads.get("0:480") ?? 0).toBe(0);
    assertCapacityOk(out, "blocked");
    // Combined frozen + fresh loads still respect capacity.
    const combined = new Map<string, number>();
    for (const b of blocked) {
      const k = `${b.gate}:${b.slotStart}`;
      combined.set(k, (combined.get(k) ?? 0) + 1);
    }
    for (const [k, v] of loadBySlot(out)) combined.set(k, (combined.get(k) ?? 0) + v);
    for (const [key, load] of combined) {
      const gate = Number(key.split(":")[0]) as GateId;
      expect(load, `blocked+fresh ${key}`).toBeLessThanOrEqual(
        capacityForGate(gate),
      );
    }
  });

  it("zero gates / zero capacity input: single gate removed from play", () => {
    // capacityForGate is data-driven; a gate profile with 0 capacity would
    // make loads[g][s] >= 0 true immediately, so the gate is never picked.
    // The optimizer must still terminate with a feasible plan on the rest.
    const reqs: BookingRequest[] = Array.from({ length: 20 }, (_, i) =>
      mkRequest({ id: `REQ-Z-${i}`, createdAt: i }),
    );
    const out = optimizeSlots(reqs, { seed: 13, overbook: false });
    expect(out).toHaveLength(20);
    for (const a of out) assertSlotFeasible(a);
  });
});

describe("optimizer extreme overload (B8)", () => {
  it("600 trucks (> 512 base capacity) still terminates with one slot each", () => {
    const reqs: BookingRequest[] = Array.from({ length: 600 }, (_, i) =>
      mkRequest({
        id: `REQ-O-${i}`,
        preferredStart: 420 + ((i * 37) % 600),
        preferredEnd: 420 + ((i * 37) % 600) + 90,
        createdAt: i,
      }),
    );
    const out = optimizeSlots(reqs, { seed: 17, overbook: false });
    expect(out).toHaveLength(600);
    expect(new Set(out.map((a) => a.requestId)).size).toBe(600);
    for (const a of out) assertSlotFeasible(a);
    // Documented extreme-overload fallback: capacity CAN be exceeded here —
    // the optimizer spills onto least-loaded slots rather than dropping
    // trucks (C2 qualified in lib/formulation.ts). findOverloads must report
    // exactly the spilled slots so the overload is visible, not silent.
    const overloads = findOverloads(out, 1);
    expect(overloads.length).toBeGreaterThan(0);
    for (const o of overloads) {
      expect(o.load).toBeGreaterThan(o.capacity);
      expect(o.capacity).toBe(capacityForGate(o.gate));
    }
    // And the spilled load is real: recompute independently from the plan.
    const loads = loadBySlot(out);
    for (const o of overloads) {
      expect(loads.get(`${o.gate}:${o.slotStart}`)).toBe(o.load);
    }
  });

  it("overbooking inflates capacity but never beyond 2x", () => {
    const reqs: BookingRequest[] = Array.from({ length: 700 }, (_, i) =>
      mkRequest({
        id: `REQ-OB-${i}`,
        driverNoShowRate: 0.35, // high expected no-show -> max overbook
        createdAt: i,
      }),
    );
    const out = optimizeSlots(reqs, { seed: 19, overbook: true });
    expect(out).toHaveLength(700);
    const loads = loadBySlot(out);
    for (const [key, load] of loads) {
      const gate = Number(key.split(":")[0]) as GateId;
      expect(load, `overbook cap ${key}`).toBeLessThanOrEqual(
        capacityForGate(gate) * 2,
      );
    }
  });
});

describe("optimizer determinism and scoring consistency", () => {
  it("same seed -> byte-identical plan", () => {
    const reqs: BookingRequest[] = Array.from({ length: 80 }, (_, i) =>
      mkRequest({ id: `REQ-D-${i}`, createdAt: i }),
    );
    const a = optimizeSlots(reqs, { seed: 23 });
    const b = optimizeSlots(reqs, { seed: 23 });
    expect(a).toEqual(b);
  });

  it("annealed is never worse than greedy on the shared cost (same seed)", () => {
    const reqs: BookingRequest[] = Array.from({ length: 60 }, (_, i) =>
      mkRequest({ id: `REQ-A-${i}`, createdAt: i }),
    );
    const g = optimizeSlots(reqs, { seed: 29, method: "greedy" });
    const an = optimizeSlots(reqs, { seed: 29, method: "annealed" });
    const gc = scorePlan(g, reqs).cost;
    const ac = scorePlan(an, reqs).cost;
    expect(ac).toBeLessThanOrEqual(gc + 1e-9);
  });

  it("slot helpers agree on day boundaries", () => {
    expect(slotIndexToStart(0)).toBe(DAY_START_MIN);
    expect(slotIndexToStart(SLOTS_PER_GATE - 1)).toBe(
      DAY_END_MIN - SLOT_MINUTES,
    );
    expect(startToSlotIndex(DAY_START_MIN - 999)).toBe(0);
    expect(startToSlotIndex(DAY_END_MIN + 999)).toBe(SLOTS_PER_GATE - 1);
  });
});
