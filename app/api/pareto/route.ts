import { NextResponse } from "next/server";
import { guardRequest, internalError } from "@/lib/server/api-guard";
import { generateDayRequests } from "@/lib/data";
import { paretoFrontier } from "@/lib/pareto";
import { HORIZON_DAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/pareto — bi-objective Pareto frontier: total wait vs reschedules.
 * Body: { trucks? (default 220), seed?, day? }.
 * Weight sweep λ ∈ {0, 0.1, …, 1} with SA refinement, then a non-domination
 * filter on the raw objectives. Points are SA-refined approximations of the
 * true frontier, not proven Pareto-optimal.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const guard = await guardRequest(request, "pareto");
    if (!guard.ok) return guard.response;
    const body = (guard.body ?? {}) as Record<string, unknown>;
    const trucks =
      typeof body.trucks === "number" && Number.isFinite(body.trucks)
        ? Math.max(1, Math.min(600, Math.trunc(body.trucks)))
        : 220;
    const seed =
      typeof body.seed === "number" && Number.isFinite(body.seed)
        ? Math.trunc(body.seed)
        : 42;
    const day =
      typeof body.day === "number" && Number.isFinite(body.day)
        ? Math.max(0, Math.min(HORIZON_DAYS - 1, Math.trunc(body.day)))
        : 0;

    const requests = generateDayRequests(trucks, seed + day * 101).map((r) => ({
      ...r,
      day,
    }));
    const frontier = paretoFrontier(requests, { seed });

    return NextResponse.json({
      day,
      trucks,
      seed,
      points: frontier.map((p) => ({
        lambda: p.lambda,
        totalWait: p.totalWait,
        rescheduled: p.rescheduled,
        avgWait: p.avgWait,
        rescheduleRate: p.rescheduleRate,
      })),
    });
  } catch (e) {
    return internalError("POST /api/pareto", e);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await guardRequest(request, "pareto");
  if (!guard.ok) return guard.response;
  return NextResponse.json({
    description:
      "Bi-objective Pareto frontier (total wait vs rescheduled trucks) by weight sweep + non-domination filter. CO2 is excluded because it is a linear function of wait (degenerate pair).",
    method: "POST",
    body: {
      trucks: "number (default 220)",
      seed: "number (default 42)",
      day: "integer 0..6 (default 0)",
    },
  });
}
