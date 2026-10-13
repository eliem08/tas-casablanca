import { NextResponse } from "next/server";
import { validateDay } from "@/lib/statistics";

export const dynamic = "force-dynamic";

/**
 * POST /api/validate — statistical validation of one simulated TAS day:
 * warm-up handling, batch-means CIs, and the Little's Law bookkeeping check.
 * Body: { trucks? (default 220), seed?, warmUpMin? (default 60),
 *         batches? (default 10), tolerance? (default 0.20) }.
 * Little's Law validates bookkeeping consistency, not physics.
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
    const warmUpMin =
      typeof body.warmUpMin === "number" && Number.isFinite(body.warmUpMin)
        ? Math.max(0, Math.min(240, Math.trunc(body.warmUpMin)))
        : 60;
    const batches =
      typeof body.batches === "number" && Number.isFinite(body.batches)
        ? Math.max(2, Math.min(30, Math.trunc(body.batches)))
        : 10;
    const tolerance =
      typeof body.tolerance === "number" && Number.isFinite(body.tolerance)
        ? Math.min(0.9, Math.max(0.01, body.tolerance))
        : 0.2;

    const v = validateDay(trucks, seed, { warmUpMin, batches, tolerance });
    const round3 = (x: number) => Math.round(x * 1000) / 1000;

    return NextResponse.json({
      trucks: v.nTrucks,
      seed: v.seed,
      warmUpMin: v.warmUpMin,
      window: v.window,
      meanQueue: v.meanQueue,
      avgWait: v.avgWait,
      littlesLaw: {
        avgNumberInSystem: round3(v.littlesLaw.avgNumberInSystem),
        arrivalRate: round3(v.littlesLaw.arrivalRate),
        avgWait: round3(v.littlesLaw.avgWait),
        predicted: round3(v.littlesLaw.predicted),
        meanPhase: round3(v.littlesLaw.meanPhase),
        relativeError: round3(v.littlesLaw.relativeError),
        passes: v.littlesLaw.passes,
        tolerance: v.littlesLaw.tolerance,
        trucksCounted: v.littlesLaw.trucksCounted,
      },
      queueBatchMeans: {
        mean: round3(v.queueBatchMeans.mean),
        low: round3(v.queueBatchMeans.low),
        high: round3(v.queueBatchMeans.high),
        halfWidth: round3(v.queueBatchMeans.halfWidth),
        batches: v.queueBatchMeans.batches,
      },
      waitBatchMeans: {
        mean: round3(v.waitBatchMeans.mean),
        low: round3(v.waitBatchMeans.low),
        high: round3(v.waitBatchMeans.high),
        halfWidth: round3(v.waitBatchMeans.halfWidth),
        batches: v.waitBatchMeans.batches,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Validation failed" },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    description:
      "Warm-up + batch-means CIs + Little's Law bookkeeping check on one simulated TAS day. Little's Law is a theorem: the check validates the simulator's measurement consistency, not the physics.",
    method: "POST",
    body: {
      trucks: "number (default 220)",
      seed: "number (default 42)",
      warmUpMin: "number (default 60)",
      batches: "number (default 10)",
      tolerance: "number (default 0.20)",
    },
  });
}
