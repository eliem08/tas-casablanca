import { describe, it, expect } from "vitest";
import { generateDayRequests } from "../lib/data";
import { optimizeSlots } from "../lib/optimizer";
import { replanDay } from "../lib/replan";
import type { BookingRequest } from "../lib/types";

function setup(n = 120, seed = 42) {
  const requests = generateDayRequests(n, seed);
  const assignments = optimizeSlots(requests, { seed, overbook: false });
  return { requests, assignments };
}

describe("replanDay", () => {
  it("preserves confirmed (frozen) slots exactly", () => {
    const { requests, assignments } = setup();
    const nowMin = 720; // 12:00
    const future = assignments.filter((a) => a.slotStart >= nowMin);
    expect(future.length).toBeGreaterThan(0);
    const target = future[0];
    const result = replanDay(
      requests,
      assignments,
      [{ requestId: target.requestId, kind: "no-show" }],
      nowMin,
    );
    // Every frozen assignment is byte-identical in the new plan.
    for (const f of result.frozen) {
      const after = result.after.find((a) => a.requestId === f.requestId);
      expect(after).toEqual(f);
    }
    // Frozen count = assignments before nowMin.
    const expectedFrozen = assignments.filter((a) => a.slotStart < nowMin).length;
    expect(result.frozen).toHaveLength(expectedFrozen);
  });

  it("removes a no-show and frees its slot", () => {
    const { requests, assignments } = setup();
    const nowMin = 480; // 08:00
    const target = assignments.find((a) => a.slotStart >= nowMin)!;
    const result = replanDay(
      requests,
      assignments,
      [{ requestId: target.requestId, kind: "no-show" }],
      nowMin,
    );
    expect(result.removedNoShows).toContain(target.requestId);
    expect(result.after.find((a) => a.requestId === target.requestId)).toBeUndefined();
  });

  it("re-places a late truck at or after now + delay", () => {
    const { requests, assignments } = setup();
    const nowMin = 600; // 10:00
    const target = assignments.find((a) => a.slotStart >= nowMin)!;
    const lateBy = 60;
    const result = replanDay(
      requests,
      assignments,
      [{ requestId: target.requestId, kind: "late", lateByMin: lateBy }],
      nowMin,
    );
    expect(result.lateReplaced).toContain(target.requestId);
    const after = result.after.find((a) => a.requestId === target.requestId)!;
    expect(after.slotStart).toBeGreaterThanOrEqual(nowMin);
    expect(after.slotStart).toBeGreaterThanOrEqual(target.slotStart + lateBy - 30); // slot grid tolerance
  });

  it("leaves the plan unchanged when there are no disruptions", () => {
    const { requests, assignments } = setup();
    const result = replanDay(requests, assignments, [], 600);
    expect(result.moved).toHaveLength(0);
    expect(result.after).toEqual(
      expect.arrayContaining(assignments.map((a) => expect.objectContaining({ requestId: a.requestId }))),
    );
    expect(result.after).toHaveLength(assignments.length);
  });

  it("never moves a truck into the past", () => {
    const { requests, assignments } = setup(200, 11);
    const nowMin = 900; // 15:00
    const future = assignments.filter((a) => a.slotStart >= nowMin).slice(0, 5);
    const result = replanDay(
      requests,
      assignments,
      future.map((a) => ({ requestId: a.requestId, kind: "no-show" as const })),
      nowMin,
    );
    for (const a of result.after) {
      if (a.slotStart >= nowMin) continue; // frozen slots are in the past by definition
      expect(result.frozen.some((f) => f.requestId === a.requestId)).toBe(true);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const { requests, assignments } = setup();
    const d = [{ requestId: assignments[10].requestId, kind: "late" as const, lateByMin: 30 }];
    const a = replanDay(requests, assignments, d, 600, { seed: 7 });
    const b = replanDay(requests, assignments, d, 600, { seed: 7 });
    expect(a).toEqual(b);
  });

  it("handles a disruption for an unknown request id gracefully", () => {
    const { requests, assignments } = setup();
    const result = replanDay(
      requests,
      assignments,
      [{ requestId: "REQ-DOES-NOT-EXIST", kind: "no-show" }],
      600,
    );
    expect(result.after).toHaveLength(assignments.length);
    expect(result.removedNoShows).not.toContain("REQ-DOES-NOT-EXIST");
  });

  it("keeps every request assigned exactly once after replanning", () => {
    const { requests, assignments } = setup(150, 21);
    const nowMin = 660;
    const targets = assignments
      .filter((a) => a.slotStart >= nowMin)
      .slice(0, 3)
      .map((a) => ({ requestId: a.requestId, kind: "late" as const, lateByMin: 45 }));
    const result = replanDay(requests, assignments, targets, nowMin);
    const ids = result.after.map((a) => a.requestId);
    // Late trucks + undisrupted trucks = all requests (no-shows removed: none here).
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(requests.length);
  });
});
