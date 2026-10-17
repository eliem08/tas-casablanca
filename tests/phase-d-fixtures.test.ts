/**
 * tests/phase-d-fixtures.test.ts
 *
 * Phase D — synthetic fixture conformance.
 *
 * What this proves: the hand-written fixtures under fixtures/synthetic/
 * conform to the dataset schemas in lib/datasets/schemas.ts, the
 * validators accept valid records and reject broken ones, and every
 * fixture envelope is flagged synthetic:true.
 *
 * What this does NOT prove: anything about the real Port of Casablanca.
 * See fixtures/synthetic/README.md.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  DATASET_SCHEMA_VERSION,
  parseDatasetEnvelope,
  parseTruckArrivalRecord,
  parseAppointmentAdherenceRecord,
  parseGateServiceTimeRecord,
  parseQueueMeasurement,
  type DatasetParseResult,
} from "../lib/datasets/schemas";

const FIXTURES_DIR = join(__dirname, "..", "fixtures", "synthetic");

const FILES: Array<{
  file: string;
  parse: (v: unknown) => DatasetParseResult<unknown>;
}> = [
  { file: "truck-arrivals.json", parse: parseTruckArrivalRecord },
  { file: "appointment-adherence.json", parse: parseAppointmentAdherenceRecord },
  { file: "gate-service-times.json", parse: parseGateServiceTimeRecord },
  { file: "queue-measurements.json", parse: parseQueueMeasurement },
];

function loadFixture(file: string): { synthetic: boolean; records: unknown[] } {
  const raw = readFileSync(join(FIXTURES_DIR, file), "utf8");
  const envelope = parseDatasetEnvelope(JSON.parse(raw));
  expect(envelope.ok, `${file}: envelope validates`).toBe(true);
  return envelope.value as { synthetic: boolean; records: unknown[] };
}

describe("synthetic fixtures conform to dataset schemas", () => {
  it("fixtures directory contains exactly the four expected files", () => {
    const files = readdirSync(FIXTURES_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
    expect(files).toEqual(FILES.map((f) => f.file).sort());
  });

  for (const { file, parse } of FILES) {
    it(`${file}: envelope is synthetic:true @ v${DATASET_SCHEMA_VERSION}`, () => {
      const { synthetic, records } = loadFixture(file);
      expect(synthetic).toBe(true);
      expect(records.length).toBeGreaterThan(0);
    });

    it(`${file}: every record validates`, () => {
      const { records } = loadFixture(file);
      for (const [i, rec] of records.entries()) {
        const r = parse(rec);
        expect(r.ok, `${file}[${i}]: ${JSON.stringify(r.issues)}`).toBe(true);
      }
    });
  }
});

describe("dataset validators reject bad data (never throw)", () => {
  it("wrong schema_version is rejected", () => {
    const r = parseTruckArrivalRecord({
      schema_version: "9.9.9",
      arrival_id: "x",
      occurred_at_utc: "2026-10-20T08:00:00Z",
      terminal: "T1",
      gate_id: 0,
      recorded_by: "tos",
    });
    expect(r.ok).toBe(false);
    expect(r.issues[0].path).toBe("schema_version");
  });

  it("missing required fields are rejected", () => {
    expect(parseQueueMeasurement({}).ok).toBe(false);
    expect(
      parseAppointmentAdherenceRecord({ appointment_id: "a" }).ok,
    ).toBe(false);
  });

  it("unknown fields are rejected (strict schemas)", () => {
    const r = parseGateServiceTimeRecord({
      schema_version: DATASET_SCHEMA_VERSION,
      record_id: "s1",
      gate_id: 0,
      started_at_utc: "2026-10-20T08:00:00Z",
      service_duration_sec: 240,
      lane: "express",
      hacker_field: "drop table",
    });
    expect(r.ok).toBe(false);
  });

  it("unit/range violations are rejected", () => {
    // Negative service duration (unit: seconds, must be > 0).
    expect(
      parseGateServiceTimeRecord({
        schema_version: DATASET_SCHEMA_VERSION,
        record_id: "s1",
        gate_id: 0,
        started_at_utc: "2026-10-20T08:00:00Z",
        service_duration_sec: -5,
        lane: "express",
      }).ok,
    ).toBe(false);
    // Bad datetime (must end in Z).
    expect(
      parseTruckArrivalRecord({
        schema_version: DATASET_SCHEMA_VERSION,
        arrival_id: "a1",
        occurred_at_utc: "2026-10-20 08:00:00",
        terminal: "T1",
        gate_id: 0,
        recorded_by: "tos",
      }).ok,
    ).toBe(false);
  });

  it("adherence cross-field rules hold", () => {
    const base = {
      schema_version: DATASET_SCHEMA_VERSION,
      appointment_id: "appt_1",
      scheduled_start_utc: "2026-10-20T08:00:00Z",
      lead_time_hours: 24,
    };
    // Arrived but lateness missing -> reject.
    expect(
      parseAppointmentAdherenceRecord({
        ...base,
        actual_checkin_utc: "2026-10-20T08:05:00Z",
        outcome: "arrived-late",
        lateness_min: null,
      }).ok,
    ).toBe(false);
    // No-show but lateness present -> reject.
    expect(
      parseAppointmentAdherenceRecord({
        ...base,
        actual_checkin_utc: null,
        outcome: "no-show",
        lateness_min: 10,
      }).ok,
    ).toBe(false);
    // Consistent record -> accept.
    expect(
      parseAppointmentAdherenceRecord({
        ...base,
        actual_checkin_utc: "2026-10-20T08:05:00Z",
        outcome: "arrived-late",
        lateness_min: 5,
      }).ok,
    ).toBe(true);
  });

  it("validators never throw on hostile input", () => {
    const hostile: unknown[] = [
      null,
      undefined,
      42,
      "string",
      [],
      { schema_version: null },
      JSON.parse('{"a":{"b":{"c":[1,2,{}]}}}'),
    ];
    for (const h of hostile) {
      for (const { parse } of FILES) {
        expect(() => parse(h)).not.toThrow();
      }
      expect(() => parseDatasetEnvelope(h)).not.toThrow();
    }
  });
});
