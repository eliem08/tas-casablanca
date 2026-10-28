import { describe, it, expect } from "vitest";
import {
  horizonDayISO,
  horizonDayLabel,
  generateDayRequests,
  SIM_DAY_EPOCH_MS,
} from "../lib/data";
import {
  minutesToHHMM,
  DAY_START_MIN,
  DAY_END_MIN,
  SLOT_MINUTES,
  slotIndexToStart,
  startToSlotIndex,
  clampSlotIndex,
} from "../lib/types";
import { optimizeSlots } from "../lib/optimizer";
import type { BookingRequest } from "../lib/types";

function mkRequest(over: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id: "REQ-DT-1",
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

describe("date boundaries (B5)", () => {
  it("horizonDayISO is stable UTC date math across the 7-day horizon", () => {
    // SIM_DAY_EPOCH_MS = 2026-10-12T00:00:00Z (a Monday).
    expect(horizonDayISO(0)).toBe("2026-10-12");
    expect(horizonDayISO(6)).toBe("2026-10-18");
    expect(horizonDayLabel(0)).toBe("Mon 12 Oct");
    expect(horizonDayLabel(6)).toBe("Sun 18 Oct");
    // Consecutive days differ by exactly one calendar day, no DST-style gaps.
    for (let d = 0; d < 6; d++) {
      const a = new Date(`${horizonDayISO(d)}T00:00:00Z`).getTime();
      const b = new Date(`${horizonDayISO(d + 1)}T00:00:00Z`).getTime();
      expect(b - a).toBe(86_400_000);
    }
  });

  it("UTC-based labels are server/client consistent (no local-tz dependence)", () => {
    // The implementation uses getUTC* / toISOString, so the label must not
    // change with the process timezone. Spot-check the epoch directly.
    const d = new Date(SIM_DAY_EPOCH_MS);
    expect(d.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(horizonDayISO(0)).toBe(
      d.toISOString().slice(0, 10),
    );
  });

  it("minutesToHHMM wraps midnight sanely", () => {
    expect(minutesToHHMM(0)).toBe("00:00");
    expect(minutesToHHMM(1439)).toBe("23:59");
    expect(minutesToHHMM(1440)).toBe("00:00");
    expect(minutesToHHMM(360)).toBe("06:00");
    expect(minutesToHHMM(-30)).toBe("23:30");
    expect(minutesToHHMM(NaN)).toBe("00:00");
  });
});

describe("operating-hours edges (B5)", () => {
  it("slot helpers clamp to the operating day", () => {
    expect(slotIndexToStart(0)).toBe(DAY_START_MIN); // 06:00
    expect(slotIndexToStart(31)).toBe(DAY_END_MIN - SLOT_MINUTES); // 21:30
    expect(startToSlotIndex(360)).toBe(0);
    expect(startToSlotIndex(1290)).toBe(31);
    expect(clampSlotIndex(-5)).toBe(0);
    expect(clampSlotIndex(99)).toBe(31);
    expect(clampSlotIndex(NaN)).toBe(0);
  });

  it("optimizer never emits slots outside 06:00–22:00", () => {
    const reqs = generateDayRequests(150, 55);
    const out = optimizeSlots(reqs, { seed: 55, overbook: false });
    for (const a of out) {
      expect(a.slotStart).toBeGreaterThanOrEqual(DAY_START_MIN);
      expect(a.slotStart + SLOT_MINUTES).toBeLessThanOrEqual(DAY_END_MIN);
      expect(Number.isInteger((a.slotStart - DAY_START_MIN) / SLOT_MINUTES)).toBe(true);
    }
  });

  it("preferred windows at the day edges are placed feasibly", () => {
    const reqs = [
      mkRequest({ id: "e1", preferredStart: 360, preferredEnd: 390 }), // 06:00 edge
      mkRequest({ id: "e2", preferredStart: 1290, preferredEnd: 1320 }), // 21:30 edge
      mkRequest({ id: "e3", preferredStart: 360, preferredEnd: 1320 }), // whole day
    ];
    const out = optimizeSlots(reqs, { seed: 61 });
    expect(out).toHaveLength(3);
    const byId = new Map(out.map((a) => [a.requestId, a]));
    // Early-edge truck can be served at the first slot without "reschedule".
    expect(byId.get("e1")!.slotStart).toBeGreaterThanOrEqual(360);
    expect(byId.get("e2")!.slotStart).toBeLessThanOrEqual(1290);
    for (const a of out) {
      expect(a.slotStart).toBeGreaterThanOrEqual(DAY_START_MIN);
      expect(a.slotStart).toBeLessThanOrEqual(DAY_END_MIN - SLOT_MINUTES);
    }
  });

  it("past-slot rejection: earliestSlotStart is a hard floor", () => {
    const reqs = [
      mkRequest({ id: "p1", preferredStart: 360, preferredEnd: 420 }),
      mkRequest({ id: "p2", preferredStart: 400, preferredEnd: 460 }),
    ];
    const out = optimizeSlots(reqs, {
      seed: 63,
      earliestSlotStart: 780, // 13:00 — both windows are in the past
    });
    for (const a of out) {
      expect(a.slotStart).toBeGreaterThanOrEqual(780);
      expect(a.rescheduled).toBe(true); // forced out of window -> flagged
    }
  });
});
