import { describe, it, expect } from "vitest";
import { generateDayRequests } from "../lib/data";
import {
  priceTier,
  slotPrice,
  applyCongestionPricing,
} from "../lib/pricing";

describe("congestion pricing mechanism", () => {
  it("price tiers order peak > shoulder > off-peak", () => {
    expect(priceTier(480)).toBe(1.8); // 08:00 peak
    expect(priceTier(720)).toBe(1.15); // 12:00 shoulder
    expect(priceTier(1080)).toBe(1.15); // 18:00 shoulder
    expect(priceTier(1260)).toBe(0.6); // 21:00 off-peak
    expect(priceTier(360)).toBe(0.6); // 06:00 off-peak
  });

  it("slot price rises with load factor (surcharge works)", () => {
    const low = slotPrice(480, 0, 25, 0.5);
    const high = slotPrice(480, 1, 25, 0.5);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeCloseTo(25 * 1.8, 9);
  });

  it("pricing shifts demand and never increases the peak", () => {
    for (const seed of [42, 7, 99]) {
      const reqs = generateDayRequests(220, seed);
      const res = applyCongestionPricing(reqs, { seed });
      expect(res.shiftedCount).toBeGreaterThan(0);
      expect(res.revenue).toBeGreaterThan(0);
      expect(res.avgPricePaid).toBeGreaterThan(0);
      expect(res.pricedPeakLoad).toBeLessThanOrEqual(res.basePeakLoad);
      expect(res.peakReductionPct).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it("zero base price means zero revenue and no price-driven shifts", () => {
    const reqs = generateDayRequests(220, 42);
    const res = applyCongestionPricing(reqs, { seed: 42, basePrice: 0 });
    expect(res.revenue).toBe(0);
    expect(res.shiftedCount).toBe(0);
  });

  it("shifted requests keep their window length", () => {
    const reqs = generateDayRequests(220, 42);
    const res = applyCongestionPricing(reqs, { seed: 42 });
    for (let i = 0; i < reqs.length; i++) {
      expect(
        res.shiftedRequests[i].preferredEnd - res.shiftedRequests[i].preferredStart,
      ).toBe(reqs[i].preferredEnd - reqs[i].preferredStart);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const reqs = generateDayRequests(220, 42);
    const a = applyCongestionPricing(reqs, { seed: 42 });
    const b = applyCongestionPricing(reqs, { seed: 42 });
    expect(a).toEqual(b);
  });
});
