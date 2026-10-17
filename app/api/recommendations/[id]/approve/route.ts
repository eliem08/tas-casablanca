import { NextResponse } from "next/server";
import { z } from "zod";
import { validateRecommendationTransition, type RecommendationStatus } from "@/lib/contracts";
import { auditLog } from "@/lib/server/audit";
import { authProvider, requireRole } from "@/lib/server/auth";
import {
  guardRequest,
  validationFailed,
  forbidden,
  notFound,
  internalError,
} from "@/lib/server/api-guard";
import { recommendationStore } from "@/lib/server/stores";

export const dynamic = "force-dynamic";

const ApproveBody = z
  .object({
    decision: z.enum(["approve", "reject"]),
    reason: z.string().max(500).optional(),
  })
  .strict();

/**
 * POST /api/recommendations/[id]/approve — decide a recommendation.
 *
 * Body: { decision: "approve" | "reject", reason? }.
 * Requires the `approver` role (admin implies it). Requests without
 * the role get 403 { error: "forbidden", requiredRole: "approver" }.
 * The DevMockAuthProvider reads the demo-only `x-demo-role` header;
 * a real provider must verify signed credentials (see lib/server/auth.ts).
 *
 * Decisions are audit-logged with before/after state.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const guard = await guardRequest(request, "recommendations");
  if (!guard.ok) return guard.response;

  try {
    const ctx = await authProvider.getAuthContext(request);

    const denied = requireRole(ctx, "approver");
    if (denied) {
      auditLog.record({
        actor: ctx.userId,
        action: "recommendation.decision-denied",
        entityType: "recommendation",
        entityId: params.id,
        before: null,
        after: null,
        reason: `missing role: ${denied.requiredRole}`,
      });
      return forbidden(denied);
    }

    const existing = recommendationStore.get(params.id);
    if (!existing) return notFound(`recommendation ${params.id} not found`);

    const bodyParsed = ApproveBody.safeParse(guard.body);
    if (!bodyParsed.success) {
      return validationFailed(
        bodyParsed.error.issues.map((i) => ({
          path: i.path.map(String).join(".") || "(root)",
          code: String(i.code),
          message: i.message,
        })),
      );
    }

    const nextStatus: RecommendationStatus =
      bodyParsed.data.decision === "approve" ? "approved" : "rejected";
    const issues = validateRecommendationTransition(existing.status, nextStatus);
    if (issues.length > 0) return validationFailed(issues);

    const now = new Date().toISOString();
    const before = { ...existing };
    const updated = {
      ...existing,
      status: nextStatus,
      approvedBy: ctx.userId,
      approvedAtUtc: now,
    };
    recommendationStore.set(updated);

    auditLog.record({
      actor: ctx.userId,
      action: `recommendation.${nextStatus}`,
      entityType: "recommendation",
      entityId: updated.id,
      before,
      after: updated,
      reason: bodyParsed.data.reason,
    });

    return NextResponse.json(updated);
  } catch (e) {
    return internalError("POST /api/recommendations/[id]/approve", e);
  }
}
