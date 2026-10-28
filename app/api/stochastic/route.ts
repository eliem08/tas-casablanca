import { NextResponse } from "next/server";
import { guardRequest, internalError } from "@/lib/server/api-guard";
import { generateDayRequests } from "@/lib/data";
import { stochasticPlan } from "@/lib/stochastic";
import { HORIZON_DAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/stochastic — SAA stochastic planning under no-show uncertainty.
 * Body: { trucks? (default 220), seed?, day?, scenarios? (default 25, max 50),
 *         alpha? (default 0.05) }.
 * Returns deterministic vs chosen plan on expected cost, worst-case cost,
 * and empirical overflow probability. The deterministic plan is always a
 * candidate, so the chosen plan's expected cost is never worse.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const guard = await guardRequest(request, "stochastic");
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
    const scenarios =
      typeof body.scenarios === "number" && Number.isFinite(body.scenarios)
        ? Math.max(1, Math.min(50, Math.trunc(body.scenarios)))
        : 25;
    const alpha =
      typeof body.alpha === "number" && Number.isFinite(body.alpha)
        ? Math.min(0.5, Math.max(0, body.alpha))
        : 0.05;

    const requests = generateDayRequests(trucks, seed + day * 101).map((r) => ({
      ...r,
      day,
    }));
    const result = stochasticPlan(requests, { scenarios, seed, alpha });
    const round2 = (v: number) => Math.round(v * 100) / 100;
    const slim = (c: {
      label: string;
      expectedCost: number;
      worstCost: number;
      overflowProb: number;
      satisfiesChance: boolean;
    }) => ({
      label: c.label,
      expectedCost: round2(c.expectedCost),
      worstCost: round2(c.worstCost),
      overflowProb: round2(c.overflowProb),
      satisfiesChance: c.satisfiesChance,
    });

    return NextResponse.json({
      day,
      trucks,
      seed,
      scenarios: result.scenarios,
      alpha: result.alpha,
      chanceSatisfied: result.chanceSatisfied,
      expectedImprovement: round2(result.expectedImprovement),
      deterministic: slim(result.deterministic),
      chosen: slim(result.chosen),
    });
  } catch (e) {
    return internalError("POST /api/stochastic", e);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await guardRequest(request, "stochastic");
  if (!guard.ok) return guard.response;
  return NextResponse.json({
    description:
      "Sample Average Approximation under no-show uncertainty: candidate-set search with a chance constraint P(any slot overflows) <= alpha. Evaluation over sampled scenarios is exact; the search is heuristic.",
    method: "POST",
    body: {
      trucks: "number (default 220)",
      seed: "number (default 42)",
      day: "integer 0..6 (default 0)",
      scenarios: "number (default 25, max 50)",
      alpha: "number (default 0.05)",
    },
  });
}
