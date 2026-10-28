import { NextResponse } from "next/server";
import { z } from "zod";
import {
  validateTransition,
  type AppointmentStatus,
} from "@/lib/contracts";
import { auditLog } from "@/lib/server/audit";
import { authProvider } from "@/lib/server/auth";
import {
  guardRequest,
  validationFailed,
  badRequest,
  notFound,
  internalError,
} from "@/lib/server/api-guard";
import { appointmentStore } from "@/lib/server/stores";

export const dynamic = "force-dynamic";

const PatchBody = z
  .object({
    status: z.string(),
    reason: z.string().max(500).optional(),
  })
  .strict();

/**
 * GET /api/bookings/[id] — fetch one appointment.
 */
export async function GET(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const params = await paramsPromise;
  const guard = await guardRequest(request, "bookings");
  if (!guard.ok) return guard.response;
  try {
    const appointment = appointmentStore.get(params.id);
    if (!appointment) return notFound(`appointment ${params.id} not found`);
    return NextResponse.json(appointment);
  } catch (e) {
    return internalError("GET /api/bookings/[id]", e);
  }
}

/**
 * PATCH /api/bookings/[id] — change appointment status.
 *
 * Body: { status: <next status>, reason? }.
 * The transition is validated against BookingStatusTransition
 * (e.g. confirmed→cancelled is legal, completed→requested is not).
 * Illegal transitions return 400 { error: "validation_failed", issues }.
 * Every change is written to the audit log with before/after state.
 */
export async function PATCH(
  request: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const params = await paramsPromise;
  const guard = await guardRequest(request, "bookings");
  if (!guard.ok) return guard.response;

  try {
    const ctx = await authProvider.getAuthContext(request);

    const existing = appointmentStore.get(params.id);
    if (!existing) return notFound(`appointment ${params.id} not found`);

    const bodyParsed = PatchBody.safeParse(guard.body);
    if (!bodyParsed.success) {
      return validationFailed(
        bodyParsed.error.issues.map((i) => ({
          path: i.path.map(String).join(".") || "(root)",
          code: String(i.code),
          message: i.message,
        })),
      );
    }

    const issues = validateTransition(
      existing.status,
      bodyParsed.data.status as AppointmentStatus,
    );
    if (issues.length > 0) return validationFailed(issues);

    const before = { ...existing };
    const updated = {
      ...existing,
      status: bodyParsed.data.status as AppointmentStatus,
      updatedAtUtc: new Date().toISOString(),
    };
    appointmentStore.set(updated);

    auditLog.record({
      actor: ctx.userId,
      action: `booking.${updated.status === "cancelled" ? "cancelled" : "status-changed"}`,
      entityType: "appointment",
      entityId: updated.id,
      before,
      after: updated,
      reason: bodyParsed.data.reason,
    });

    return NextResponse.json(updated);
  } catch (e) {
    return internalError("PATCH /api/bookings/[id]", e);
  }
}
