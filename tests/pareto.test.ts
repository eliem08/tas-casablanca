import { describe, it, expect } from "vitest";
import { generateDayRequests } from "../lib/data";
import { paretoFrontier } from "../lib/pareto";

describe("Pareto frontier (waiting vs reschedules)", () => {
  it("returns mutually non-dominated points", () => {
    const reqs = generateDayRequests(220, 42);
    const frontier = paretoFrontier(reqs, { seed: 42 });
    expect(frontier.length).toBeGreaterThan(0);
    for (const p of frontier) {
      for (const q of frontier) {
        if (p === q) continue;
        // No q dominates p: q must not be ≤ p on both with one strict.
        const dominates =
          q.totalWait <= p.totalWait + 1e-9 &&
          q.rescheduled <= p.rescheduled &&
          (q.totalWait < p.totalWait - 1e-9 || q.rescheduled < p.rescheduled);
        expect(dominates).toBe(false);
      }
    }
  });

  it("sorted by wait ascending, reschedules descend (Pareto-set property)", () => {
    const reqs = generateDayRequests(220, 42);
    const frontier = paretoFrontier(reqs, { seed: 42 });
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i].totalWait).toBeGreaterThanOrEqual(
        frontier[i - 1].totalWait - 1e-9,
      );
      expect(frontier[i].rescheduled).toBeLessThanOrEqual(
        frontier[i - 1].rescheduled,
      );
    }
  });

  it("endpoints span the trade-off: min-wait point waits least, min-reschedule point reschedules least", () => {
    const reqs = generateDayRequests(220, 42);
    const frontier = paretoFrontier(reqs, { seed: 42 });
    const minWait = Math.min(...frontier.map((p) => p.totalWait));
    const minResched = Math.min(...frontier.map((p) => p.rescheduled));
    expect(frontier[0].totalWait).toBeCloseTo(minWait, 9);
    expect(frontier[frontier.length - 1].rescheduled).toBe(minResched);
  });

  it("every point carries a complete plan with valid assignments", () => {
    const reqs = generateDayRequests(120, 7);
    const frontier = paretoFrontier(reqs, { seed: 7 });
    for (const p of frontier) {
      expect(p.assignments).toHaveLength(reqs.length);
      expect(p.rescheduleRate).toBeCloseTo(p.rescheduled / reqs.length, 3);
      expect(p.avgWait).toBeGreaterThanOrEqual(0);
      expect(p.lambda).toBeGreaterThanOrEqual(0);
      expect(p.lambda).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const reqs = generateDayRequests(120, 5);
    const a = paretoFrontier(reqs, { seed: 5 });
    const b = paretoFrontier(reqs, { seed: 5 });
    expect(a.map((p) => [p.lambda, p.totalWait, p.rescheduled])).toEqual(
      b.map((p) => [p.lambda, p.totalWait, p.rescheduled]),
    );
  });

  it("returns empty for empty demand", () => {
    expect(paretoFrontier([], {})).toEqual([]);
  });
});
