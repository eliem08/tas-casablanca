import { describe, it, expect } from "vitest";
import {
  noShowProbability,
  overbookLimit,
  riskBand,
  explainProbability,
  type NoShowFeatures,
} from "../lib/predictor";

const base: NoShowFeatures = {
  leadTimeHours: 24,
  driverNoShowRate: 0.05,
  slotStartMin: 540, // 09:00
  cargo: "general",
};

describe("noShowProbability", () => {
  it("stays within the documented clamp range", () => {
    expect(noShowProbability(base)).toBeGreaterThanOrEqual(0.02);
    expect(noShowProbability(base)).toBeLessThanOrEqual(0.85);
    expect(
      noShowProbability({ ...base, leadTimeHours: 500, driverNoShowRate: 1 }),
    ).toBeLessThanOrEqual(0.85);
  });

  it("increases with worse driver history", () => {
    const low = noShowProbability({ ...base, driverNoShowRate: 0 });
    const high = noShowProbability({ ...base, driverNoShowRate: 0.4 });
    expect(high).toBeGreaterThan(low);
  });

  it("increases with longer booking lead time", () => {
    const short = noShowProbability({ ...base, leadTimeHours: 2 });
    const long = noShowProbability({ ...base, leadTimeHours: 72 });
    expect(long).toBeGreaterThan(short);
  });

  it("penalizes night slots", () => {
    const day = noShowProbability({ ...base, slotStartMin: 600 });
    const night = noShowProbability({ ...base, slotStartMin: 1200 });
    expect(night).toBeGreaterThan(day);
  });

  it("treats grain as riskier than reefer", () => {
    const grain = noShowProbability({ ...base, cargo: "grain" });
    const reefer = noShowProbability({ ...base, cargo: "reefer" });
    expect(grain).toBeGreaterThan(reefer);
  });
});

describe("overbookLimit", () => {
  it("never goes below capacity or above 2x capacity", () => {
    expect(overbookLimit(4, 0)).toBe(4);
    expect(overbookLimit(4, 0.2)).toBeGreaterThanOrEqual(4);
    expect(overbookLimit(4, 0.9)).toBeLessThanOrEqual(8);
  });

  it("grows with the expected no-show rate", () => {
    expect(overbookLimit(4, 0.3)).toBeGreaterThanOrEqual(
      overbookLimit(4, 0.1),
    );
  });
});

describe("riskBand", () => {
  it("bands thresholds correctly", () => {
    expect(riskBand(0.05)).toBe("low");
    expect(riskBand(0.2)).toBe("medium");
    expect(riskBand(0.5)).toBe("high");
  });
});

describe("explainProbability", () => {
  it("returns 1–4 human-readable reasons", () => {
    const reasons = explainProbability({
      ...base,
      leadTimeHours: 2,
      driverNoShowRate: 0.3,
      cargo: "grain",
    });
    expect(reasons.length).toBeGreaterThanOrEqual(1);
    expect(reasons.length).toBeLessThanOrEqual(4);
    for (const r of reasons) expect(typeof r).toBe("string");
  });
});
