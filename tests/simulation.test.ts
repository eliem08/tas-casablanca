import { describe, it, expect } from "vitest";
import { simulateDay } from "../lib/simulation";

describe("simulateDay", () => {
  it("returns baseline and optimized metrics with a merged queue series", () => {
    const r = simulateDay(220, 42);
    expect(r.params).toEqual({ trucks: 220, seed: 42 });
    for (const m of [r.baseline, r.optimized]) {
      expect(m.maxQueueLength).toBeGreaterThanOrEqual(0);
      expect(m.avgWaitMin).toBeGreaterThanOrEqual(0);
      expect(m.gateUtilization).toHaveLength(3);
      expect(m.co2Tonnes).toBeGreaterThanOrEqual(0);
      expect(m.throughputPerHour).toBeGreaterThan(0);
      expect(m.queueSeries.length).toBeGreaterThan(10);
    }
    const s = r.baseline.queueSeries;
    expect(s[0]).toHaveProperty("t");
    expect(s[0]).toHaveProperty("baseline");
    expect(s[0]).toHaveProperty("optimized");
    expect(s[0].t).toMatch(/^\d{2}:\d{2}$/);
  });

  it("TAS reduces the peak queue on the reference day", () => {
    const r = simulateDay(220, 42);
    expect(r.optimized.maxQueueLength).toBeLessThan(r.baseline.maxQueueLength);
  });

  it("TAS cuts average waiting time on the reference day", () => {
    const r = simulateDay(220, 42);
    expect(r.optimized.avgWaitMin).toBeLessThan(r.baseline.avgWaitMin);
  });

  it("keeps the optimized reschedule rate modest", () => {
    const r = simulateDay(220, 42);
    expect(r.optimized.rescheduleRate).toBeLessThan(0.3);
    expect(r.optimized.rescheduleRate).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic for a fixed seed", () => {
    const a = simulateDay(150, 7);
    const b = simulateDay(150, 7);
    expect(a).toEqual(b);
  });

  it("handles small and large demand without crashing", () => {
    for (const n of [20, 600]) {
      const r = simulateDay(n, 3);
      expect(r.baseline.totalTrucks).toBeGreaterThan(0);
      expect(r.optimized.totalTrucks).toBe(n);
    }
  });
});
