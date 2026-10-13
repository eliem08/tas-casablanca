import { describe, it, expect } from "vitest";
import { generateDayRequests } from "../lib/data";
import { optimizeSlots, scorePlan } from "../lib/optimizer";
import {
  generateNoShowScenarios,
  evaluatePlanOnScenario,
  stochasticPlan,
} from "../lib/stochastic";

describe("stochastic planning (SAA + chance constraint)", () => {
  it("scenario generation is deterministic and subsets of demand", () => {
    const reqs = generateDayRequests(40, 42);
    const a = generateNoShowScenarios(reqs, 10, 7);
    const b = generateNoShowScenarios(reqs, 10, 7);
    expect(a).toEqual(b);
    expect(a).toHaveLength(10);
    const ids = new Set(reqs.map((r) => r.id));
    for (const s of a) {
      for (const id of s) expect(ids.has(id)).toBe(true);
    }
  });

  it("evaluation on the full-shown scenario equals the deterministic cost", () => {
    const reqs = generateDayRequests(40, 42);
    const plan = optimizeSlots(reqs, { seed: 42 });
    const full = new Set(reqs.map((r) => r.id));
    const ev = evaluatePlanOnScenario(plan, reqs, full);
    expect(ev.cost).toBeCloseTo(scorePlan(plan, reqs).cost, 9);
    expect(ev.overflow).toBe(false);
    expect(ev.shownTrucks).toBe(reqs.length);
  });

  it("chosen plan never has worse expected cost than deterministic (by construction)", () => {
    for (const seed of [42, 7]) {
      const reqs = generateDayRequests(60, seed);
      const res = stochasticPlan(reqs, { scenarios: 15, seed, alpha: 0.05 });
      expect(res.chosen.expectedCost).toBeLessThanOrEqual(
        res.deterministic.expectedCost + 1e-9,
      );
      expect(res.expectedImprovement).toBeGreaterThanOrEqual(-1e-9);
      expect(res.candidates.length).toBeGreaterThan(1);
    }
  });

  it("overflow probability is a valid frequency in [0, 1]", () => {
    const reqs = generateDayRequests(60, 42);
    const res = stochasticPlan(reqs, { scenarios: 15, seed: 42, alpha: 0.05 });
    for (const c of res.candidates) {
      expect(c.overflowProb).toBeGreaterThanOrEqual(0);
      expect(c.overflowProb).toBeLessThanOrEqual(1);
      expect(c.satisfiesChance).toBe(c.overflowProb <= 0.05 + 1e-9);
    }
  });

  it("with alpha = 1 the chance constraint is trivially satisfied", () => {
    const reqs = generateDayRequests(60, 42);
    const res = stochasticPlan(reqs, { scenarios: 10, seed: 42, alpha: 1 });
    expect(res.chanceSatisfied).toBe(true);
  });

  it("is deterministic for a fixed seed", () => {
    const reqs = generateDayRequests(40, 3);
    const a = stochasticPlan(reqs, { scenarios: 10, seed: 3 });
    const b = stochasticPlan(reqs, { scenarios: 10, seed: 3 });
    expect(a.chosen.expectedCost).toBe(b.chosen.expectedCost);
    expect(a.deterministic.expectedCost).toBe(b.deterministic.expectedCost);
  });
});
