import { describe, it, expect } from "vitest";
import { generateDayRequests } from "../lib/data";
import { optimizeSlots } from "../lib/optimizer";
import { planToCsv, csvEscape, PLAN_CSV_HEADER } from "../lib/csv";
import type { BookingRequest, SlotAssignment } from "../lib/types";

describe("csvEscape", () => {
  it("passes plain values through", () => {
    expect(csvEscape("Atlas Freight")).toBe("Atlas Freight");
    expect(csvEscape(42)).toBe("42");
  });

  it("quotes fields containing commas, quotes, or newlines", () => {
    expect(csvEscape("Acme, Inc.")).toBe('"Acme, Inc."');
    expect(csvEscape('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("planToCsv", () => {
  it("emits the documented header and one row per assignment", () => {
    const requests = generateDayRequests(20, 5);
    const assignments = optimizeSlots(requests, { seed: 5 });
    const csv = planToCsv(assignments, requests);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(PLAN_CSV_HEADER.join(","));
    expect(lines).toHaveLength(assignments.length + 1);
  });

  it("quotes company names containing commas", () => {
    const req: BookingRequest = {
      id: "REQ-1",
      company: "Acme, Inc.",
      truckPlate: "48213 - A - 6",
      cargo: "general",
      move: "import",
      containers: 1,
      preferredStart: 480,
      preferredEnd: 600,
      leadTimeHours: 24,
      driverNoShowRate: 0.05,
      createdAt: 1,
    };
    const [a] = optimizeSlots([req], { seed: 1 });
    const csv = planToCsv([a], [req]);
    expect(csv).toContain('"Acme, Inc."');
  });

  it("slot_end is exactly 30 minutes after slot_start", () => {
    const requests = generateDayRequests(10, 9);
    const assignments = optimizeSlots(requests, { seed: 9 });
    const lines = planToCsv(assignments, requests).trim().split("\r\n").slice(1);
    const toMin = (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number);
      return h * 60 + m;
    };
    for (const line of lines) {
      const cols = line.split(",");
      expect(toMin(cols[3]) - toMin(cols[2])).toBe(30);
    }
  });

  it("status is confirmed or rescheduled, never anything else", () => {
    const requests = generateDayRequests(120, 3);
    const assignments = optimizeSlots(requests, { seed: 3 });
    const lines = planToCsv(assignments, requests).trim().split("\r\n").slice(1);
    for (const line of lines) {
      const cols = line.split(",");
      expect(["confirmed", "rescheduled"]).toContain(cols[11]);
    }
  });

  it("day numbers are 1-based and dates are ISO", () => {
    const req: BookingRequest = {
      id: "REQ-1",
      company: "Atlas",
      truckPlate: "48213 - A - 6",
      cargo: "general",
      move: "import",
      containers: 1,
      preferredStart: 480,
      preferredEnd: 600,
      leadTimeHours: 24,
      driverNoShowRate: 0.05,
      createdAt: 1,
      day: 2,
    };
    const [a] = optimizeSlots([req], { seed: 1 });
    const line = planToCsv([a], [req]).trim().split("\r\n")[1];
    const cols = line.split(",");
    expect(cols[0]).toBe("3"); // day 2 -> "3"
    expect(cols[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns only the header for an empty plan", () => {
    expect(planToCsv([], [])).toBe(PLAN_CSV_HEADER.join(",") + "\r\n");
  });

  it("skips assignments without a matching request", () => {
    const requests = generateDayRequests(5, 1);
    const assignments = optimizeSlots(requests, { seed: 1 });
    const orphan: SlotAssignment = {
      ...assignments[0],
      requestId: "REQ-GHOST",
    };
    const csv = planToCsv([...assignments, orphan], requests);
    expect(csv.trim().split("\r\n")).toHaveLength(assignments.length + 1);
  });
});
