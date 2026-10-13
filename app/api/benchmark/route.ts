import { NextResponse } from "next/server";
import { generateDayRequests } from "@/lib/data";
import { optimizeSlots, scorePlan } from "@/lib/optimizer";
import { idleCo2Tonnes } from "@/lib/types";
import { HORIZON_DAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/benchmark — greedy vs simulated annealing on IDENTICAL demand.
 * Body: { trucks?, seed?, day? }.
 * Runs both methods on the same generated requests and returns both scores
 * plus deltas. Because annealing starts from the greedy solution and keeps
 * the best seen, its cost is never worse than greedy's.
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

    const daySeed = seed + day * 101;
    const requests = generateDayRequests(trucks, daySeed).map((r) => ({ ...r, day }));

    const greedy = optimizeSlots(requests, { seed: daySeed, overbook: true, method: 'greedy' });
    const annealed = optimizeSlots(requests, { seed: daySeed, overbook: true, method: 'annealed' });
    const g = scorePlan(greedy, requests);
    const a = scorePlan(annealed, requests);

    const round2 = (v: number) => Math.round(v * 100) / 100;
    const co2 = (avgWait: number) => idleCo2Tonnes(trucks, avgWait);

    return NextResponse.json({
      day,
      trucks,
      seed,
      greedy: {
        cost: round2(g.cost),
        avgWaitMin: round2(g.avgWait),
        rescheduled: g.rescheduled,
        rescheduleRate: round2(g.rescheduled / Math.max(1, requests.length)),
        maxSlotLoad: g.maxLoad,
        co2Tonnes: round2(co2(g.avgWait)),
      },
      annealed: {
        cost: round2(a.cost),
        avgWaitMin: round2(a.avgWait),
        rescheduled: a.rescheduled,
        rescheduleRate: round2(a.rescheduled / Math.max(1, requests.length)),
        maxSlotLoad: a.maxLoad,
        co2Tonnes: round2(co2(a.avgWait)),
      },
      delta: {
        // Negative = annealing improved (lower is better on every metric).
        cost: round2(a.cost - g.cost),
        avgWaitMin: round2(a.avgWait - g.avgWait),
        rescheduled: a.rescheduled - g.rescheduled,
        co2Tonnes: round2(co2(a.avgWait) - co2(g.avgWait)),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Benchmark failed" },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    description:
      "Compares greedy+local-search vs greedy+local-search+simulated-annealing on identical demand. Annealing can never score worse than greedy (it starts from the greedy solution and keeps the best seen).",
    method: "POST",
    body: {
      trucks: "number (default 220)",
      seed: "number (default 42)",
      day: "integer 0..6 (default 0)",
    },
    response: "{ day, trucks, seed, greedy, annealed, delta }",
  });
}
