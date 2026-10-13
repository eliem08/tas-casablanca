import { describe, it, expect } from "vitest";
import { generateDayRequests } from "../lib/data";
import {
  optimizeSlots,
  baselineAssign,
  loadBySlot,
  slotsPerDay,
} from "../lib/optimizer";
import { DAY_START_MIN, DAY_END_MIN, capacityForGate } from "../lib/types";
import type { BookingRequest, GateId } from "../lib/types";

function singleRequest(over: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id: "REQ-TEST-1",
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

describe("optimizeSlots", () => {
  it("assigns every request exactly once", () => {
    const reqs = generateDayRequests(120, 11);
    const out = optimizeSlots(reqs, { seed: 11 });
    expect(out).toHaveLength(reqs.length);
    const ids = new Set(out.map((a) => a.requestId));
    expect(ids.size).toBe(reqs.length);
  });

  it("returns [] for empty input without throwing", () => {
    expect(optimizeSlots([])).toEqual([]);
    expect(baselineAssign([])).toEqual([]);
  });

  it("respects per-gate slot capacity without overbooking", () => {
    const reqs = generateDayRequests(200, 21);
    const out = optimizeSlots(reqs, { seed: 21, overbook: false });
    for (const [key, load] of loadBySlot(out)) {
      const gate = Number(key.split(":")[0]) as GateId;
      expect(load).toBeLessThanOrEqual(capacityForGate(gate));
    }
  });

  it("honours a terminal preference when capacity allows", () => {
    const out = optimizeSlots([singleRequest({ terminal: "T2" })], { seed: 1 });
    expect(out).toHaveLength(1);
    expect(out[0].gate).toBe(1);
    expect(out[0].terminal).toBe("T2");
  });

  it("carries the horizon day onto assignments", () => {
    const out = optimizeSlots([singleRequest({ day: 3 })], { seed: 1 });
    expect(out[0].day).toBe(3);
  });

  it("keeps all slots on the time grid within the operating day", () => {
    const reqs = generateDayRequests(80, 5);
    for (const a of optimizeSlots(reqs, { seed: 5 })) {
      expect(a.slotStart).toBeGreaterThanOrEqual(DAY_START_MIN);
      expect(a.slotStart).toBeLessThan(DAY_END_MIN);
      expect(a.slotStart % 30).toBe(0);
      expect(a.gate).toBeGreaterThanOrEqual(0);
      expect(a.gate).toBeLessThanOrEqual(2);
      expect(a.noShowProbability).toBeGreaterThanOrEqual(0);
      expect(a.noShowProbability).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const reqs = generateDayRequests(100, 99);
    const a = optimizeSlots(reqs, { seed: 99 });
    const b = optimizeSlots(reqs, { seed: 99 });
    expect(a).toEqual(b);
  });

  it("beats the baseline on peak slot load", () => {
    const reqs = generateDayRequests(220, 42);
    const opt = optimizeSlots(reqs, { seed: 42 });
    const base = baselineAssign(reqs);
    const peak = (m: Map<string, number>) =>
      Math.max(0, ...m.values());
    expect(peak(loadBySlot(opt))).toBeLessThanOrEqual(peak(loadBySlot(base)));
  });

  it("keeps the reschedule rate in single digits on the reference day", () => {
    const reqs = generateDayRequests(220, 42);
    const out = optimizeSlots(reqs, { seed: 42 });
    const rate =
      out.filter((a) => a.rescheduled).length / Math.max(1, out.length);
    expect(rate).toBeLessThan(0.25);
  });

  it("slotsPerDay matches the operating window", () => {
    expect(slotsPerDay()).toBe(32); // 06:00–22:00 in 30-min slots
  });
});
