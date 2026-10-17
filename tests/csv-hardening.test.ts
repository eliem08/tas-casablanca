import { describe, it, expect } from "vitest";
import { planToCsv, csvEscape, PLAN_CSV_HEADER } from "../lib/csv";
import { horizonDayISO } from "../lib/data";
import { optimizeSlots } from "../lib/optimizer";
import type { BookingRequest, SlotAssignment } from "../lib/types";

function mkRequest(over: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id: "REQ-CSV-1",
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

function mkAssignment(over: Partial<SlotAssignment> = {}): SlotAssignment {
  return {
    requestId: "REQ-CSV-1",
    gate: 0,
    slotStart: 480,
    rescheduled: false,
    noShowProbability: 0.123,
    waitEstimateMin: 2.5,
    day: 0,
    terminal: "T1",
    ...over,
  };
}

/** Minimal RFC 4180 row parser for round-trip checks. */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

describe("csvEscape (B7)", () => {
  it("quotes commas, doubles quotes, quotes newlines and CRLF", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("a\r\nb")).toBe('"a\r\nb"');
    expect(csvEscape(42)).toBe("42");
  });
});

describe("planToCsv (B7)", () => {
  it("round-trips hostile field content (commas, quotes, newlines)", () => {
    const req = mkRequest({
      company: 'Saham "Express", Ltd.\nCasablanca',
      truckPlate: "123,456 - X - 1",
    });
    const csv = planToCsv([mkAssignment()], [req]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(PLAN_CSV_HEADER.join(","));
    // The data row spans embedded newlines — rejoin: header + 1 logical row.
    const body = lines.slice(1).join("\r\n");
    const fields = parseCsvRow(body.replace(/\r\n$/, ""));
    expect(fields).toHaveLength(PLAN_CSV_HEADER.length);
    expect(fields[PLAN_CSV_HEADER.indexOf("company")]).toBe(
      'Saham "Express", Ltd.\nCasablanca',
    );
    expect(fields[PLAN_CSV_HEADER.indexOf("truck_plate")]).toBe(
      "123,456 - X - 1",
    );
  });

  it("emits the documented columns in order with correct values", () => {
    const csv = planToCsv([mkAssignment()], [mkRequest()]);
    const lines = csv.split("\r\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    const f = parseCsvRow(lines[1]);
    const at = (name: (typeof PLAN_CSV_HEADER)[number]) =>
      f[PLAN_CSV_HEADER.indexOf(name)];
    expect(at("day")).toBe("1"); // 1-based for humans
    expect(at("date")).toBe(horizonDayISO(0));
    expect(at("slot_start")).toBe("08:00");
    expect(at("slot_end")).toBe("08:30");
    expect(at("gate")).toBe("Gate 1");
    expect(at("terminal")).toBe("T1");
    expect(at("status")).toBe("confirmed");
    expect(at("wait_min")).toBe("2.5");
    expect(at("no_show_risk_pct")).toBe("12.3");
  });

  it("marks out-of-window placements rescheduled", () => {
    const csv = planToCsv([mkAssignment({ rescheduled: true })], [mkRequest()]);
    const f = parseCsvRow(csv.split("\r\n")[1]);
    expect(f[PLAN_CSV_HEADER.indexOf("status")]).toBe("rescheduled");
  });

  it("sorts rows by slot start then gate", () => {
    const reqs = [
      mkRequest({ id: "r1" }),
      mkRequest({ id: "r2" }),
      mkRequest({ id: "r3" }),
    ];
    const as = [
      mkAssignment({ requestId: "r1", slotStart: 540, gate: 2 }),
      mkAssignment({ requestId: "r2", slotStart: 480, gate: 1 }),
      mkAssignment({ requestId: "r3", slotStart: 480, gate: 0 }),
    ];
    const csv = planToCsv(as, reqs);
    const rows = csv.split("\r\n").filter((l) => l.length > 0).slice(1);
    const starts = rows.map((r) => parseCsvRow(r)[2]);
    const gates = rows.map((r) => parseCsvRow(r)[4]);
    expect(starts).toEqual(["08:00", "08:00", "09:00"]);
    expect(gates).toEqual(["Gate 1", "Gate 2", "Gate 3"]);
  });

  it("skips assignments without a matching request (defensive)", () => {
    const csv = planToCsv(
      [mkAssignment(), mkAssignment({ requestId: "REQ-ORPHAN" })],
      [mkRequest()],
    );
    const rows = csv.split("\r\n").filter((l) => l.length > 0);
    expect(rows).toHaveLength(2); // header + 1
  });

  it("exports a full optimized day without loss", () => {
    const reqs = [
      mkRequest({ id: "f1", company: 'A, "B"\nC' }),
      mkRequest({ id: "f2" }),
      mkRequest({ id: "f3" }),
    ];
    const as = optimizeSlots(reqs, { seed: 4 });
    const csv = planToCsv(as, reqs);
    // One logical row per assignment: count via the day column (first col).
    const logicalRows = csv
      .split("\r\n")
      .filter((l) => /^\d+,/.test(l));
    expect(logicalRows).toHaveLength(3);
  });
});
