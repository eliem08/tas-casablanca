/**
 * tests/tas-gatewatch-seam.test.ts
 *
 * Phase C — TAS keeps its promise: a valid TAS AppointmentContract
 * (APPOINTMENT_CONTRACT_VERSION = "1.0.0") must map cleanly onto
 * GateWatch's duplicated minimal appointment reference shape.
 *
 * This test does NOT import anything from the GateWatch repo — the two
 * repos stay separate (no shared backend, no monorepo). The
 * GateWatch-side expectations are duplicated here deliberately and are
 * pinned to GateWatch's TAS_APPOINTMENT_CONTRACT_VERSION_EXPECTED =
 * "1.0.0" (src/lib/contracts.ts there); if either side's contract moves,
 * this test and GateWatch's src/lib/tas-adapter.ts are the
 * reconciliation points.
 *
 * Documented field mapping (mirrored in GateWatch's tas-adapter.ts):
 *   appointment.id               → ref.appointmentId
 *   appointment.status           → ref.status
 *   appointment.container.number → ref.containerNumber
 *   appointment.truck.plate      → ref.plate
 *   appointment.slot.startUtc    → ref.slotStartUtc
 *   appointment.slot.endUtc      → ref.slotEndUtc
 *   appointment.gate             → ref.gate
 */
import { describe, it, expect } from "vitest";
import {
  APPOINTMENT_CONTRACT_VERSION,
  AppointmentStatus,
  parseAppointment,
  newAppointmentId,
  type Appointment,
  type AppointmentStatusType,
} from "../lib/contracts";

/**
 * The six statuses GateWatch's AppointmentRef must accept — duplicated
 * from GateWatch's contracts.ts (pinned to
 * TAS_APPOINTMENT_CONTRACT_VERSION_EXPECTED = "1.0.0").
 */
const GATEWATCH_REF_STATUSES = [
  "requested",
  "confirmed",
  "checked-in",
  "completed",
  "cancelled",
  "no-show",
] as const;

const Z_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

function validAppointment(
  status: AppointmentStatusType = "confirmed",
): Appointment {
  const res = parseAppointment({
    id: newAppointmentId(),
    status,
    truck: { plate: "48213-A-6", carrier: "Atlas Freight Maroc" },
    container: { number: "MSKU0000006", type: "40ft-dry" },
    slot: {
      startUtc: "2026-10-20T08:00:00Z",
      endUtc: "2026-10-20T08:30:00Z",
    },
    terminal: "T1",
    gate: "gate-1",
    createdAtUtc: "2026-10-19T12:00:00Z",
    updatedAtUtc: "2026-10-19T12:05:00Z",
  });
  expect(res.ok).toBe(true);
  return res.value!;
}

/** The documented seam mapping — the only translation TAS promises. */
function toAppointmentRef(a: Appointment) {
  return {
    appointmentId: a.id,
    status: a.status,
    containerNumber: a.container.number,
    plate: a.truck.plate,
    slotStartUtc: a.slot.startUtc,
    slotEndUtc: a.slot.endUtc,
    gate: a.gate,
  };
}

describe("TAS → GateWatch seam (TAS keeps its promise)", () => {
  it('pins the contract version both sides reconcile against ("1.0.0")', () => {
    // GateWatch's TAS_APPOINTMENT_CONTRACT_VERSION_EXPECTED must equal
    // this constant; if it ever differs, the seam is broken by definition.
    expect(APPOINTMENT_CONTRACT_VERSION).toBe("1.0.0");
  });

  it("maps a valid appointment onto GateWatch's AppointmentRef expectations", () => {
    const a = validAppointment();
    const ref = toAppointmentRef(a);

    // appointmentId: TAS's appt_<ulid> id, carried through verbatim.
    expect(ref.appointmentId).toBe(a.id);
    expect(ref.appointmentId).toMatch(/^appt_[A-Za-z0-9_-]{8,64}$/);

    // status: one of the six statuses GateWatch's ref accepts.
    expect(GATEWATCH_REF_STATUSES).toContain(ref.status);

    // containerNumber / plate: carried through verbatim, non-empty.
    expect(ref.containerNumber).toBe(a.container.number);
    expect(ref.plate).toBe(a.truck.plate);
    expect(ref.containerNumber.length).toBeGreaterThan(0);
    expect(ref.plate.length).toBeGreaterThan(0);

    // slot window: Z-suffixed UTC datetimes, start before end.
    expect(ref.slotStartUtc).toMatch(Z_UTC_RE);
    expect(ref.slotEndUtc).toMatch(Z_UTC_RE);
    expect(Date.parse(ref.slotEndUtc)).toBeGreaterThan(
      Date.parse(ref.slotStartUtc),
    );

    // gate: non-empty string.
    expect(typeof ref.gate).toBe("string");
    expect(ref.gate.length).toBeGreaterThan(0);
  });

  it("carries every TAS status through to the ref verbatim", () => {
    const tasStatuses = AppointmentStatus.options as readonly string[];
    expect([...tasStatuses].sort()).toEqual([...GATEWATCH_REF_STATUSES].sort());

    for (const status of GATEWATCH_REF_STATUSES) {
      const ref = toAppointmentRef(
        validAppointment(status as AppointmentStatusType),
      );
      expect(ref.status).toBe(status);
    }
  });
});
