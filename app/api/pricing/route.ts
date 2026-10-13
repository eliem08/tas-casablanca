import { NextResponse } from "next/server";
import { generateDayRequests } from "@/lib/data";
import { applyCongestionPricing } from "@/lib/pricing";
import { HORIZON_DAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/pricing — congestion-pricing mechanism experiment.
 * Body: { trucks? (default 220), seed?, day?, basePrice? (default 25),
 *         surcharge? (default 0.5), maxShiftMin? (default 120) }.
 * Prices are illustrative; willingness-to-pay is synthetic. Nothing here
 * is a claim about real Casablanca port tariffs.
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
    const basePrice =
      typeof body.basePrice === "number" && Number.isFinite(body.basePrice)
        ? Math.max(0, Math.min(500, body.basePrice))
        : 25;
    const surcharge =
      typeof body.surcharge === "number" && Number.isFinite(body.surcharge)
        ? Math.max(0, Math.min(3, body.surcharge))
        : 0.5;
    const maxShiftMin =
      typeof body.maxShiftMin === "number" && Number.isFinite(body.maxShiftMin)
        ? Math.max(0, Math.min(480, Math.trunc(body.maxShiftMin)))
        : 120;

    const requests = generateDayRequests(trucks, seed + day * 101).map((r) => ({
      ...r,
      day,
    }));
    const result = applyCongestionPricing(requests, {
      seed,
      basePrice,
      surcharge,
      maxShiftMin,
    });

    return NextResponse.json({
      day,
      trucks,
      seed,
      basePrice: result.basePrice,
      surcharge: result.surcharge,
      basePeakLoad: result.basePeakLoad,
      pricedPeakLoad: result.pricedPeakLoad,
      peakReductionPct: result.peakReductionPct,
      revenue: result.revenue,
      shiftedCount: result.shiftedCount,
      avgDisplacementMin: result.avgDisplacementMin,
      avgPricePaid: result.avgPricePaid,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Pricing experiment failed" },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    description:
      "Congestion-pricing mechanism experiment: time-of-day + load-based slot prices shift carrier demand; the terminal re-optimizes and reports peak flattening + revenue. Illustrative only — not a real tariff proposal.",
    method: "POST",
    body: {
      trucks: "number (default 220)",
      seed: "number (default 42)",
      day: "integer 0..6 (default 0)",
      basePrice: "number (default 25)",
      surcharge: "number (default 0.5)",
      maxShiftMin: "number (default 120)",
    },
  });
}
