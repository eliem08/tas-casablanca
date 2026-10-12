import { NextResponse } from "next/server";
import { optimizeSlots } from "@/lib/optimizer";
import type { BookingRequest, SlotAssignment } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_REQUESTS = 500;
const OPTIMIZER_SEED = 7;

const CARGOS = ["general", "grain", "reefer", "hazmat"] as const;
const MOVES = ["import", "export"] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Validate one raw object against the BookingRequest contract. */
function validateRequest(v: unknown, i: number): string | null {
  if (!isRecord(v)) return `requests[${i}] must be an object`;
  if (typeof v.id !== "string" || !v.id.trim())
    return `requests[${i}].id must be a non-empty string`;
  if (typeof v.company !== "string" || !v.company.trim())
    return `requests[${i}].company must be a non-empty string`;
  if (typeof v.truckPlate !== "string")
    return `requests[${i}].truckPlate must be a string`;
  if (!CARGOS.includes(v.cargo as (typeof CARGOS)[number]))
    return `requests[${i}].cargo must be one of ${CARGOS.join(", ")}`;
  if (!MOVES.includes(v.move as (typeof MOVES)[number]))
    return `requests[${i}].move must be one of ${MOVES.join(", ")}`;
  if (v.containers !== 1 && v.containers !== 2)
    return `requests[${i}].containers must be 1 or 2`;
  const ps = num(v.preferredStart);
  const pe = num(v.preferredEnd);
  if (ps === null || ps < 0 || ps >= 1440)
    return `requests[${i}].preferredStart must be minutes since midnight (0–1439)`;
  if (pe === null || pe < 0 || pe >= 1440)
    return `requests[${i}].preferredEnd must be minutes since midnight (0–1439)`;
  if (ps >= pe)
    return `requests[${i}].preferredStart must be before preferredEnd`;
  const lt = num(v.leadTimeHours);
  if (lt === null || lt < 0)
    return `requests[${i}].leadTimeHours must be a non-negative number`;
  const hr = num(v.driverNoShowRate);
  if (hr === null || hr < 0 || hr > 1)
    return `requests[${i}].driverNoShowRate must be between 0 and 1`;
  if (num(v.createdAt) === null)
    return `requests[${i}].createdAt must be a number`;
  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
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
    const assignments: SlotAssignment[] = optimizeSlots(requests, {
      seed: OPTIMIZER_SEED,
      overbook: true,
    });
    const rescheduled = assignments.filter((a) => a.rescheduled).length;
    const avgRisk =
      assignments.reduce((s, a) => s + a.noShowProbability, 0) /
      Math.max(1, assignments.length);

    return NextResponse.json({
      assignments,
      summary: {
        total: assignments.length,
        rescheduled,
        rescheduleRate: Math.round((rescheduled / Math.max(1, assignments.length)) * 10000) / 10000,
        avgNoShowRisk: Math.round(avgRisk * 10000) / 10000,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Optimization failed" },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    description:
      "Assigns gate/time slots to truck booking requests with a greedy + local-search optimizer. Deterministic (seed 7), overbooking enabled. Times are minutes since midnight.",
    method: "POST",
    body: {
      requests: "BookingRequest[] (max 500). Required fields per item: id, company, truckPlate, cargo (general|grain|reefer|hazmat), move (import|export), containers (1|2), preferredStart, preferredEnd (minutes since midnight), leadTimeHours, driverNoShowRate (0..1), createdAt.",
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
        },
      ],
    },
    response: {
      assignments: "SlotAssignment[] — gate, slotStart, rescheduled, noShowProbability, waitEstimateMin",
      summary: "{ total, rescheduled, rescheduleRate, avgNoShowRisk }",
    },
  });
}
