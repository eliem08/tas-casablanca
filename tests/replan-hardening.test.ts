import { describe, it, expect } from "vitest";
import { generateDayRequests } from "../lib/data";
import { optimizeSlots, loadBySlot } from "../lib/optimizer";
import { replanDay } from "../lib/replan";
import { capacityForGate, DAY_END_MIN, SLOT_MINUTES } from "../lib/types";
import type { BookingRequest, GateId } from "../lib/types";

function setup(n = 120, seed = 42) {
  const requests = generateDayRequests(n, seed);
  const assignments = optimizeSlots(requests, { seed, overbook: false });
  return { requests, assignments };
}

describe("replanDay consistency (B3/B4)", () => {
  it("confirmed bookings survive replanning byte-identical", () => {
    const { requests, assignments } = setup();
    const nowMin = 720;
    const target = assignments.find((a) => a.slotStart >= nowMin)!;
    const result = replanDay(
      requests,
      assignments,
      [{ requestId: target.requestId, kind: "late", lateByMin: 45 }],
      nowMin,
      { seed: 99 }, // different seed must NOT reshuffle frozen trucks
    );
    for (const f of result.frozen) {
      const after = result.after.find((a) => a.requestId === f.requestId);
      expect(after).toEqual(f);
    }
    // Frozen set is exactly the pre-nowMin assignments.
    expect(
      result.frozen.map((f) => f.requestId).sort(),
    ).toEqual(
      assignments
        .filter((a) => a.slotStart < nowMin)
        .map((a) => a.requestId)
        .sort(),
    );
  });

  it("never places anything before nowMin", () => {
    const { requests, assignments } = setup();
    const nowMin = 900;
    const future = assignments.filter((a) => a.slotStart >= nowMin);
    const result = replanDay(
      requests,
      assignments,
      [
        { requestId: future[0].requestId, kind: "no-show" },
        { requestId: future[1].requestId, kind: "late", lateByMin: 120 },
      ],
      nowMin,
    );
    for (const a of result.after) {
      if (result.frozen.some((f) => f.requestId === a.requestId)) continue;
      expect(a.slotStart).toBeGreaterThanOrEqual(nowMin);
    }
  });

  it("late truck re-placed at/after max(now, old slot + delay)", () => {
    const { requests, assignments } = setup();
    const nowMin = 600;
    const target = assignments.find((a) => a.slotStart >= nowMin)!;
    const result = replanDay(
      requests,
      assignments,
      [{ requestId: target.requestId, kind: "late", lateByMin: 90 }],
      nowMin,
    );
    expect(result.lateReplaced).toContain(target.requestId);
    const repl = result.after.find((a) => a.requestId === target.requestId)!;
    expect(repl.slotStart).toBeGreaterThanOrEqual(
      Math.max(nowMin, target.slotStart + 90),
    );
  });

  it("late truck already at the gate stays frozen (not re-planned)", () => {
    const { requests, assignments } = setup();
    const nowMin = 720;
    const served = assignments.find((a) => a.slotStart < nowMin)!;
    const result = replanDay(
      requests,
      assignments,
      [{ requestId: served.requestId, kind: "late", lateByMin: 30 }],
      nowMin,
    );
    // Flagged late but already served -> frozen, untouched, not "replaced".
    expect(result.lateReplaced).not.toContain(served.requestId);
    expect(result.after.find((a) => a.requestId === served.requestId)).toEqual(
      served,
    );
  });

  it("no-show frees capacity: combined frozen + fresh loads respect capacity", () => {
    const { requests, assignments } = setup(200, 77);
    const nowMin = 660;
    const future = assignments.filter((a) => a.slotStart >= nowMin);
    const result = replanDay(
      requests,
      assignments,
      future.slice(0, 5).map((a) => ({ requestId: a.requestId, kind: "no-show" as const })),
      nowMin,
    );
    expect(result.removedNoShows).toHaveLength(5);
    // Capacity holds on the merged plan (no overbook in this setup).
    const loads = loadBySlot(result.after);
    for (const [key, load] of loads) {
      const gate = Number(key.split(":")[0]) as GateId;
      expect(load, `replan ${key}`).toBeLessThanOrEqual(capacityForGate(gate));
    }
  });

  it("unknown disruption ids are ignored, plan still valid", () => {
    const { requests, assignments } = setup();
    const result = replanDay(
      requests,
      assignments,
      [
        { requestId: "REQ-DOES-NOT-EXIST", kind: "no-show" },
        { requestId: "REQ-GHOST", kind: "late", lateByMin: 30 },
      ],
      720,
    );
    expect(result.removedNoShows).toHaveLength(0);
    expect(result.lateReplaced).toHaveLength(0);
    expect(result.after).toHaveLength(assignments.length);
  });

  it("day-over (nowMin past last slot) returns the plan unchanged", () => {
    const { requests, assignments } = setup();
    // Hand-craft a plan with a slot at/after nowMin so the disruption is
    // "actionable" but the day-over guard still refuses to replan.
    const nowMin = DAY_END_MIN - SLOT_MINUTES + 1; // 21:31 — no usable slot left
    const target = assignments[0];
    const late = { ...target, slotStart: DAY_END_MIN }; // 22:00, past the last slot
    const plan = [late, ...assignments.slice(1)];
    const result = replanDay(
      requests,
      plan,
      [{ requestId: late.requestId, kind: "no-show" }],
      nowMin,
    );
    expect(result.after).toEqual(plan);
    expect(result.moved).toHaveLength(0);
    expect(result.removedNoShows).toHaveLength(0);
    expect(result.frozen).toHaveLength(plan.length);
  });

  it("no actionable disruption returns the plan unchanged (no gratuitous reshuffle)", () => {
    const { requests, assignments } = setup();
    const nowMin = 1300; // almost everything served
    const result = replanDay(requests, assignments, [], nowMin);
    expect(result.after).toEqual(assignments);
    expect(result.moved).toHaveLength(0);
  });

  it("negative lateByMin is clamped to 0 (no time travel)", () => {
    const { requests, assignments } = setup();
    const nowMin = 600;
    const target = assignments.find((a) => a.slotStart >= nowMin)!;
    const result = replanDay(
      requests,
      assignments,
      [{ requestId: target.requestId, kind: "late", lateByMin: -45 }],
      nowMin,
    );
    const repl = result.after.find((a) => a.requestId === target.requestId)!;
    expect(repl.slotStart).toBeGreaterThanOrEqual(nowMin);
  });
});
