import { describe, it, expect } from "vitest";
import {
  batchMeansCI,
  littlesLawCheck,
  tCritical975,
  validateDay,
} from "../lib/statistics";

describe("batch-means confidence intervals", () => {
  it("returns the known t critical value for df = 9", () => {
    expect(tCritical975(9)).toBeCloseTo(2.262, 3);
    expect(tCritical975(1)).toBeCloseTo(12.706, 3);
    expect(tCritical975(100)).toBeCloseTo(1.96, 3);
  });

  it("constant series has zero half-width", () => {
    const r = batchMeansCI(new Array(100).fill(5), 10);
    expect(r.mean).toBeCloseTo(5, 9);
    expect(r.halfWidth).toBeCloseTo(0, 9);
    expect(r.low).toBeCloseTo(5, 9);
    expect(r.high).toBeCloseTo(5, 9);
  });

  it("CI contains the sample mean by construction", () => {
    const values = Array.from({ length: 1000 }, (_, i) => Math.sin(i / 10) + 3);
    const r = batchMeansCI(values, 10);
    expect(r.low).toBeLessThanOrEqual(r.mean);
    expect(r.high).toBeGreaterThanOrEqual(r.mean);
    expect(r.batches).toBe(10);
  });

  it("CI narrows as the series gets longer (more data, tighter interval)", () => {
    // Alternating series: batch means stabilize with more data.
    const short = batchMeansCI(
      Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0 : 2)),
      10,
    );
    const long = batchMeansCI(
      Array.from({ length: 10000 }, (_, i) => (i % 2 === 0 ? 0 : 2)),
      10,
    );
    expect(long.halfWidth).toBeLessThanOrEqual(short.halfWidth + 1e-9);
  });
});

describe("Little's Law check", () => {
  it("exact equality passes with zero error", () => {
    // L = 2, λ = 0.5/min, W = 4 min, phase = 0, step = 5:
    // predicted = 0.5 × (4 − 0 + 5) = 4.5, not 2 — the phase/step terms
    // matter. With meanPhase = step the correction cancels: 0.5×(4−5+5)=2.
    const r = littlesLawCheck(2, 0.5, 4, 5, 5, 0.2);
    expect(r.predicted).toBeCloseTo(2, 9);
    expect(r.relativeError).toBeCloseTo(0, 9);
    expect(r.passes).toBe(true);
  });

  it("fails when the bookkeeping is inconsistent", () => {
    const r = littlesLawCheck(10, 0.5, 4, 2.5, 5, 0.2);
    // predicted = 0.5 × (4 − 2.5 + 5) = 3.25 vs L = 10 → large error.
    expect(r.passes).toBe(false);
    expect(r.relativeError).toBeGreaterThan(0.2);
  });
});

describe("validateDay — instrumented simulation", () => {
  it("Little's Law check passes on seeded TAS days (bookkeeping consistent)", () => {
    for (const seed of [42, 7, 99]) {
      const v = validateDay(220, seed, {});
      expect(v.littlesLaw.passes).toBe(true);
      expect(v.littlesLaw.relativeError).toBeLessThan(0.2);
      // Phase correction is measured near STEP/2 ≈ 2.5 (arrivals uniform
      // within a step), as the derivation predicts.
      expect(v.littlesLaw.meanPhase).toBeGreaterThan(1.5);
      expect(v.littlesLaw.meanPhase).toBeLessThan(3.5);
    }
  });

  it("batch-means CIs bracket their point estimates", () => {
    const v = validateDay(220, 42, {});
    expect(v.queueBatchMeans.low).toBeLessThanOrEqual(v.queueBatchMeans.mean);
    expect(v.queueBatchMeans.high).toBeGreaterThanOrEqual(v.queueBatchMeans.mean);
    expect(v.waitBatchMeans.low).toBeLessThanOrEqual(v.waitBatchMeans.mean);
    expect(v.waitBatchMeans.high).toBeGreaterThanOrEqual(v.waitBatchMeans.mean);
    expect(v.queueBatchMeans.batches).toBe(10);
  });

  it("warm-up changes the window start", () => {
    const a = validateDay(220, 42, { warmUpMin: 0 });
    const b = validateDay(220, 42, { warmUpMin: 120 });
    expect(b.window.start).toBeGreaterThan(a.window.start);
    expect(b.window.start - a.window.start).toBe(120);
  });

  it("is deterministic for a fixed seed", () => {
    const a = validateDay(220, 42, {});
    const b = validateDay(220, 42, {});
    expect(a).toEqual(b);
  });
});
