import { NextResponse } from "next/server";
import {
  parseAppointmentCreateInput,
  newAppointmentId,
  type Appointment,
} from "@/lib/contracts";
import { auditLog } from "@/lib/server/audit";
import { authProvider } from "@/lib/server/auth";
import { bookingIdempotency, readIdempotencyKey } from "@/lib/server/idempotency";
import {
  guardRequest,
  validationFailed,
  conflict,
  internalError,
} from "@/lib/server/api-guard";
import {
  appointmentStore,
  countInSlotBucket,
  BOOKING_CAPACITY_PER_SLOT,
} from "@/lib/server/stores";

export const dynamic = "force-dynamic";

/**
 * POST /api/bookings — create a truck appointment.
 *
 * Body: AppointmentCreateInput (see APPOINTMENT_CONTRACT_VERSION "1.0.0").
 * The server assigns id (appt_<ulid>), status "requested", createdAtUtc,
 * updatedAtUtc. Returns 201 + the full AppointmentContract on success.
 *
 * Headers:
 *   Idempotency-Key (optional): repeated submissions with the same key
 *   return the ORIGINAL response instead of creating a second booking.
 *
 * Errors:
 *   400 { error: "validation_failed", issues } — contract violation
 *   409 { error: "slot_full" }                  — capacity exhausted
 *   413 / 429 via the shared API guard.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await guardRequest(request, "bookings");
  if (!guard.ok) return guard.response;

  try {
    const ctx = await authProvider.getAuthContext(request);

    const parsed = parseAppointmentCreateInput(guard.body);
    if (!parsed.ok || !parsed.value) {
      return validationFailed(parsed.issues);
    }
    const input = parsed.value;

    // Capacity guard (demo model): no silent over-booking.
    const load = countInSlotBucket(input.terminal, input.gate, input.slot.startUtc);
    if (load >= BOOKING_CAPACITY_PER_SLOT) {
      return conflict(
        `slot_full: terminal ${input.terminal} gate ${input.gate} at ${input.slot.startUtc} already has ${load} bookings (capacity ${BOOKING_CAPACITY_PER_SLOT})`,
      );
    }

    const idempotencyKey = readIdempotencyKey(request);
    if (idempotencyKey) {
      const prior = bookingIdempotency.get(idempotencyKey);
      if (prior) {
        return NextResponse.json(prior.response, {
          status: prior.status,
          headers: { "Idempotent-Replayed": "true" },
        });
      }
    }

    const now = new Date().toISOString();
    const appointment: Appointment = {
      ...input,
      id: newAppointmentId(),
      status: "requested",
      createdAtUtc: now,
      updatedAtUtc: now,
    };
    appointmentStore.set(appointment);

    auditLog.record({
      actor: ctx.userId,
      action: "booking.created",
      entityType: "appointment",
      entityId: appointment.id,
      before: null,
      after: appointment,
    });

    if (idempotencyKey) {
      bookingIdempotency.setIfAbsent(idempotencyKey, {
        response: appointment,
        status: 201,
        storedAtMs: Date.now(),
      });
    }

    return NextResponse.json(appointment, { status: 201 });
  } catch (e) {
    return internalError("POST /api/bookings", e);
  }
}

/**
 * GET /api/bookings — list all appointments (demo store).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const guard = await guardRequest(request, "bookings");
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ appointments: appointmentStore.list() });
  } catch (e) {
    return internalError("GET /api/bookings", e);
  }
}
