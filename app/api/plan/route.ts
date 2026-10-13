import { NextResponse } from "next/server";
import { generateDayRequests } from "@/lib/data";
import { optimizeSlots, scorePlan } from "@/lib/optimizer";
import type { OptimizerMethod } from "@/lib/types";
import { HORIZON_DAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/plan — build the optimized day plan for one horizon day.
 * Body: { trucks?, seed?, day?, method? }.
 * Returns the generated requests + their assignments + a summary.
 * Used by the demo's replanning panel and CSV export: the client needs the
 * actual plan, not just aggregate metrics.
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
    const method: OptimizerMethod =
      body.method === "annealed" ? "annealed" : "greedy";

    const requests = generateDayRequests(trucks, seed + day * 101).map((r) => ({
      ...r,
      day,
    }));
    const assignments = optimizeSlots(requests, {
      seed: seed + day * 101,
      overbook: true,
      method,
    });
    const score = scorePlan(assignments, requests);

    return NextResponse.json({
      day,
      method,
      requests,
      assignments,
      summary: {
        total: assignments.length,
        rescheduled: score.rescheduled,
        rescheduleRate:
          Math.round((score.rescheduled / Math.max(1, assignments.length)) * 10000) / 10000,
        optimizerCost: Math.round(score.cost * 100) / 100,
        avgWaitMin: Math.round(score.avgWait * 100) / 100,
        maxSlotLoad: score.maxLoad,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Plan failed" },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    description:
      "Builds the optimized day plan for one horizon day: generated requests + slot assignments. Used by the demo's replanning panel and CSV export.",
    method: "POST",
    body: {
      trucks: "number (default 220, clamped 1..600)",
      seed: "number (default 42); day seeds are seed + day * 101",
      day: "integer 0..6 (default 0)",
      method: "'greedy' | 'annealed' (default 'greedy')",
    },
    response: "{ day, method, requests, assignments, summary }",
  });
}
