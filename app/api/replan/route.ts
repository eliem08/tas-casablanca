import { NextResponse } from "next/server";
import { guardRequest, internalError } from "@/lib/server/api-guard";
import { replanDay } from "@/lib/replan";
import {
  validateBookingRequest,
  validateSlotAssignment,
} from "@/lib/request-validation";
import type {
  BookingRequest,
  SlotAssignment,
  OptimizerMethod,
} from "@/lib/types";
import { HORIZON_DAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 1000;

/**
 * POST /api/replan — live replanning for a day already in progress.
 * Body: { requests, assignments, disruptions, nowMin, method? }.
 *
 * disruptions: [{ requestId, kind: 'no-show' | 'late', lateByMin? }]
 * nowMin: current time, minutes since midnight. Slots before nowMin are
 * confirmed and frozen — never moved.
 *
 * Returns the new plan plus exactly what changed (moved trucks, freed
 * slots, before/after scores) so a dispatcher can approve it.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const guard = await guardRequest(request, "replan");
    if (!guard.ok) return guard.response;
    const body: unknown = guard.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
    }
    const { requests, assignments, disruptions, nowMin, method } = body as Record<
      string,
      unknown
    >;

    if (!Array.isArray(requests) || !Array.isArray(assignments) || !Array.isArray(disruptions)) {
      return NextResponse.json(
        { error: "Body must contain requests, assignments, and disruptions arrays" },
        { status: 400 },
      );
    }
    if (
      requests.length > MAX_ITEMS ||
      assignments.length > MAX_ITEMS ||
      disruptions.length > MAX_ITEMS
    ) {
      return NextResponse.json(
        { error: `Each array is limited to ${MAX_ITEMS} items` },
        { status: 400 },
      );
    }
    if (typeof nowMin !== "number" || !Number.isFinite(nowMin) || nowMin < 0 || nowMin >= 1440) {
      return NextResponse.json(
        { error: "nowMin must be minutes since midnight (0..1439)" },
        { status: 400 },
      );
    }
    for (let i = 0; i < requests.length; i++) {
      const err = validateBookingRequest(requests[i], i);
      if (err)
        return NextResponse.json({ error: err }, { status: 400 });
    }
    for (let i = 0; i < assignments.length; i++) {
      const err = validateSlotAssignment(assignments[i], i);
      if (err)
        return NextResponse.json({ error: err }, { status: 400 });
    }
    for (let i = 0; i < disruptions.length; i++) {
      const d = disruptions[i] as Record<string, unknown>;
      if (typeof d?.requestId !== "string" || (d.kind !== "no-show" && d.kind !== "late")) {
        return NextResponse.json(
          { error: `disruptions[${i}] must have requestId and kind 'no-show' | 'late'` },
          { status: 400 },
        );
      }
      if (d.kind === "late" && d.lateByMin !== undefined) {
        if (typeof d.lateByMin !== "number" || !Number.isFinite(d.lateByMin) || d.lateByMin < 0) {
          return NextResponse.json(
            { error: `disruptions[${i}].lateByMin must be a non-negative number` },
            { status: 400 },
          );
        }
      }
    }

    const result = replanDay(
      requests as BookingRequest[],
      assignments as SlotAssignment[],
      disruptions as Array<{ requestId: string; kind: "no-show" | "late"; lateByMin?: number }>,
      nowMin,
      {
        method: (method === "annealed" ? "annealed" : "greedy") as OptimizerMethod,
        seed: 7,
      },
    );

    return NextResponse.json(result);
  } catch (e) {
    return internalError("POST /api/replan", e);
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const guard = await guardRequest(request, "replan");
  if (!guard.ok) return guard.response;
  return NextResponse.json({
    description: `Live replanning: freeze confirmed slots, drop no-shows, re-place late trucks, re-optimize the rest of the day. Horizon days are 0..${HORIZON_DAYS - 1}.`,
    method: "POST",
    body: {
      requests: "BookingRequest[] — the day's demand",
      assignments: "SlotAssignment[] — the current plan",
      disruptions: "[{ requestId, kind: 'no-show' | 'late', lateByMin? }]",
      nowMin: "current time, minutes since midnight (0..1439)",
      method: "'greedy' | 'annealed' (default 'greedy')",
    },
    response: "{ after, before, moved, removedNoShows, lateReplaced, frozen, beforeScore, afterScore }",
  });
}
