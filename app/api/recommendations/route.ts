import { NextResponse } from "next/server";
import {
  parseRecommendationCreateInput,
  newRecommendationId,
  type Recommendation,
} from "@/lib/contracts";
import { auditLog } from "@/lib/server/audit";
import { authProvider } from "@/lib/server/auth";
import {
  recommendationIdempotency,
  readIdempotencyKey,
} from "@/lib/server/idempotency";
import {
  guardRequest,
  validationFailed,
  internalError,
} from "@/lib/server/api-guard";
import { recommendationStore } from "@/lib/server/stores";

export const dynamic = "force-dynamic";

/**
 * POST /api/recommendations — propose an optimization recommendation.
 *
 * Body: RecommendationCreateInput (payload validated per `type`).
 * The server assigns id (rec_<ulid>), status "proposed", createdAtUtc.
 * Approving/rejecting happens at POST /api/recommendations/[id]/approve
 * and requires the approver role.
 *
 * Headers:
 *   Idempotency-Key (optional): repeated submissions with the same key
 *   return the ORIGINAL response instead of creating a duplicate.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await guardRequest(request, "recommendations");
  if (!guard.ok) return guard.response;

  try {
    const ctx = await authProvider.getAuthContext(request);

    const parsed = parseRecommendationCreateInput(guard.body);
    if (!parsed.ok || !parsed.value) {
      return validationFailed(parsed.issues);
    }

    const idempotencyKey = readIdempotencyKey(request);
    if (idempotencyKey) {
      const prior = recommendationIdempotency.get(idempotencyKey);
      if (prior) {
        return NextResponse.json(prior.response, {
          status: prior.status,
          headers: { "Idempotent-Replayed": "true" },
        });
      }
    }

    const recommendation: Recommendation = {
      ...parsed.value,
      id: newRecommendationId(),
      status: "proposed",
      createdAtUtc: new Date().toISOString(),
    };
    recommendationStore.set(recommendation);

    auditLog.record({
      actor: ctx.userId,
      action: "recommendation.proposed",
      entityType: "recommendation",
      entityId: recommendation.id,
      before: null,
      after: recommendation,
    });

    if (idempotencyKey) {
      recommendationIdempotency.setIfAbsent(idempotencyKey, {
        response: recommendation,
        status: 201,
        storedAtMs: Date.now(),
      });
    }

    return NextResponse.json(recommendation, { status: 201 });
  } catch (e) {
    return internalError("POST /api/recommendations", e);
  }
}

/**
 * GET /api/recommendations — list all recommendations (demo store).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const guard = await guardRequest(request, "recommendations");
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({
      recommendations: recommendationStore.list(),
    });
  } catch (e) {
    return internalError("GET /api/recommendations", e);
  }
}
