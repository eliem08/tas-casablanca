import { describe, it, expect } from "vitest";
import { generateDayRequests } from "../lib/data";
import { optimizeSlots, scorePlan } from "../lib/optimizer";
import { loadBySlot } from "../lib/optimizer";
import { capacityForGate } from "../lib/types";
import type { GateId } from "../lib/types";

describe("simulated annealing", () => {
  it("beats-or-matches greedy on cost for seeded demand", () => {
    for (const seed of [42, 7, 99]) {
      const reqs = generateDayRequests(220, seed);
      const greedy = optimizeSlots(reqs, { seed, method: "greedy" });
      const annealed = optimizeSlots(reqs, { seed, method: "annealed" });
      const g = scorePlan(greedy, reqs);
      const a = scorePlan(annealed, reqs);
      // Annealing starts from the greedy solution and keeps the best seen.
      expect(a.cost).toBeLessThanOrEqual(g.cost + 1e-9);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const reqs = generateDayRequests(120, 5);
    const a = optimizeSlots(reqs, { seed: 5, method: "annealed" });
    const b = optimizeSlots(reqs, { seed: 5, method: "annealed" });
    expect(a).toEqual(b);
  });

  it("respects per-gate capacity after annealing", () => {
    const reqs = generateDayRequests(260, 13);
    const out = optimizeSlots(reqs, { seed: 13, method: "annealed", overbook: false });
    for (const [key, load] of loadBySlot(out)) {
      const gate = Number(key.split(":")[0]) as GateId;
      expect(load).toBeLessThanOrEqual(capacityForGate(gate));
    }
  });

  it("assigns every request exactly once with annealing", () => {
    const reqs = generateDayRequests(150, 3);
    const out = optimizeSlots(reqs, { seed: 3, method: "annealed" });
    expect(out).toHaveLength(reqs.length);
    expect(new Set(out.map((a) => a.requestId)).size).toBe(reqs.length);
  });

  it("never beats greedy on cost by an implausible margin (sanity)", () => {
    const reqs = generateDayRequests(220, 42);
    const g = scorePlan(optimizeSlots(reqs, { seed: 42, method: "greedy" }), reqs);
    const a = scorePlan(optimizeSlots(reqs, { seed: 42, method: "annealed" }), reqs);
    expect(g.cost - a.cost).toBeGreaterThanOrEqual(0);
    expect(g.cost - a.cost).toBeLessThan(g.cost); // improvement < 100%
  });
});
