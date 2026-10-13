import { NextResponse } from "next/server";
import { generateDayRequests } from "@/lib/data";
import { compareAgainstExact, EXACT_MAX_TRUCKS } from "@/lib/exact";
import { HORIZON_DAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/exact — exact optimum vs greedy vs annealing on a SMALL instance.
 * Body: { trucks? (default 8, max 12), seed?, day?, maxNodes? }.
 * Returns proven optimum (or not-proven status) plus optimality gaps.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    let body: Record<string, unknown> = {};
    const raw = await request.text();
    if (raw.trim() !== "") {
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }
    }
    const trucks =
      typeof body.trucks === "number" && Number.isFinite(body.trucks)
        ? Math.max(1, Math.trunc(body.trucks))
        : 8;
    if (trucks > EXACT_MAX_TRUCKS) {
      return NextResponse.json(
        { error: `Exact solver capped at ${EXACT_MAX_TRUCKS} trucks (got ${trucks})` },
        { status: 400 },
      );
    }
    const seed =
      typeof body.seed === "number" && Number.isFinite(body.seed)
        ? Math.trunc(body.seed)
        : 42;
    const day =
      typeof body.day === "number" && Number.isFinite(body.day)
        ? Math.max(0, Math.min(HORIZON_DAYS - 1, Math.trunc(body.day)))
        : 0;
    const maxNodes =
      typeof body.maxNodes === "number" && Number.isFinite(body.maxNodes)
        ? Math.max(1000, Math.min(5_000_000, Math.trunc(body.maxNodes)))
        : undefined;

    const requests = generateDayRequests(trucks, seed + day * 101).map((r) => ({
      ...r,
      day,
    }));
    const cmp = compareAgainstExact(requests, { seed, maxNodes });
    const round2 = (v: number) => Math.round(v * 100) / 100;

    return NextResponse.json({
      day,
      trucks,
      seed,
      exact: {
        cost: round2(cmp.exact.cost),
        optimal: cmp.exact.optimal,
        aborted: cmp.exact.aborted,
        feasible: cmp.exact.feasible,
        nodes: cmp.exact.nodes,
        pruned: cmp.exact.pruned,
      },
      greedy: { cost: round2(cmp.greedy.cost), gapPct: round2(cmp.greedy.gapPct) },
      annealed: { cost: round2(cmp.annealed.cost), gapPct: round2(cmp.annealed.gapPct) },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Exact comparison failed" },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    description:
      "Branch-and-bound exact optimum vs greedy vs annealing on a small instance (n <= 12). Gaps are (heuristic - optimum) / optimum in %.",
    method: "POST",
    body: {
      trucks: `number (default 8, max ${EXACT_MAX_TRUCKS})`,
      seed: "number (default 42)",
      day: "integer 0..6 (default 0)",
      maxNodes: "number (default 1000000)",
    },
  });
}
