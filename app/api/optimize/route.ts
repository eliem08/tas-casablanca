import { NextResponse } from "next/server";
import { guardRequest, internalError } from "@/lib/server/api-guard";
import {
  optimizeSlots,
  scorePlan,
  overbookFactorFor,
  findOverloads,
} from "@/lib/optimizer";
import type {
  BookingRequest,
  SlotAssignment,
  OptimizerMethod,
} from "@/lib/types";
import { HORIZON_DAYS } from "@/lib/types";
import {
  isRecord,
  validateBookingRequest,
} from "@/lib/request-validation";

export const dynamic = "force-dynamic";

const MAX_REQUESTS = 500;
const OPTIMIZER_SEED = 7;

const METHODS: OptimizerMethod[] = ["greedy", "annealed"];

/** Validate one raw object against the BookingRequest contract. */
function validateRequest(v: unknown, i: number): string | null {
  return validateBookingRequest(v, i);
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const guard = await guardRequest(request, "optimize");
    if (!guard.ok) return guard.response;
    const body: unknown = guard.body;
    if (!isRecord(body) || !Array.isArray(body.requests)) {
      return NextResponse.json(
        { error: 'Body must be an object with a "requests" array' },
        { status: 400 },
      );
    }
    const raw = body.requests as unknown[];
    if (raw.length === 0)
      return NextResponse.json(
        { error: "requests must contain at least one item" },
        { status: 400 },
      );
    if (raw.length > MAX_REQUESTS)
      return NextResponse.json(
        { error: `requests limited to ${MAX_REQUESTS} items` },
        { status: 400 },
      );
    for (let i = 0; i < raw.length; i++) {
      const err = validateRequest(raw[i], i);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }

    const requests = raw as BookingRequest[];
    // Single-day endpoint: all requests must belong to the same horizon day.
    const days = new Set(requests.map((r) => r.day ?? 0));
    if (days.size > 1) {
      return NextResponse.json(
        {
          error:
            "requests must all belong to the same horizon day (0..6); use one call per day or optimizeHorizon for a full week",
        },
        { status: 400 },
      );
    }
    const method: OptimizerMethod =
      isRecord(body) && METHODS.includes(body.method as OptimizerMethod)
        ? (body.method as OptimizerMethod)
        : "greedy";

    const assignments: SlotAssignment[] = optimizeSlots(requests, {
      seed: OPTIMIZER_SEED,
      overbook: true,
      method,
    });
    const rescheduled = assignments.filter((a) => a.rescheduled).length;
    const avgRisk =
      assignments.reduce((s, a) => s + a.noShowProbability, 0) /
      Math.max(1, assignments.length);
    const score = scorePlan(assignments, requests);
    // Overload visibility: under extreme demand the optimizer spills onto
    // full slots rather than dropping trucks (documented fallback). Report
    // how many slots exceed the (overbook-inflated) capacity actually used.
    const overflowSlots = findOverloads(
      assignments,
      overbookFactorFor(requests),
    ).length;

    return NextResponse.json({
      assignments,
      method,
      summary: {
        total: assignments.length,
        rescheduled,
        rescheduleRate: Math.round((rescheduled / Math.max(1, assignments.length)) * 10000) / 10000,
        avgNoShowRisk: Math.round(avgRisk * 10000) / 10000,
        optimizerCost: Math.round(score.cost * 100) / 100,
        avgWaitMin: Math.round(score.avgWait * 100) / 100,
        maxSlotLoad: score.maxLoad,
        overflowSlots,
      },
    });
  } catch (e) {
    return internalError("POST /api/optimize", e);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await guardRequest(request, "optimize");
  if (!guard.ok) return guard.response;
  return NextResponse.json({
    description:
      "Assigns gate/time slots to truck booking requests. Methods: 'greedy' (greedy + local search, default) or 'annealed' (greedy + local search + simulated annealing — never worse than greedy on the shared cost function). Deterministic (seed 7), overbooking enabled. Times are minutes since midnight. All requests in one call must share the same horizon day (0..6).",
    method: "POST",
    body: {
      requests: "BookingRequest[] (max 500). Required fields per item: id, company, truckPlate, cargo (general|grain|reefer|hazmat), move (import|export), containers (1|2), preferredStart, preferredEnd (minutes since midnight), leadTimeHours, driverNoShowRate (0..1), createdAt. Optional: day (0..6, default 0), terminal (T1|T2|T3|any).",
      method: "'greedy' | 'annealed' (default 'greedy')",
    },
    example: {
      requests: [
        {
          id: "req-1001",
          company: "Atlas Freight Maroc",
          truckPlate: "48213 - A - 6",
          cargo: "general",
          move: "import",
          containers: 1,
          preferredStart: 480,
          preferredEnd: 600,
          leadTimeHours: 24,
          driverNoShowRate: 0.05,
          createdAt: 1,
          day: 0,
          terminal: "T1",
        },
      ],
      method: "annealed",
    },
    response: {
      assignments: "SlotAssignment[] — gate, slotStart, rescheduled, noShowProbability, waitEstimateMin, day, terminal",
      method: "Optimizer method used",
      summary: "{ total, rescheduled, rescheduleRate, avgNoShowRisk, optimizerCost, avgWaitMin, maxSlotLoad, overflowSlots }",
    },
  });
}
