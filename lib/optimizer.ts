/**
 * lib/optimizer.ts
 *
 * Slot-allocation optimizer for the truck appointment system.
 *
 * Two strategies:
 *   - optimizeSlots: greedy assignment (preferred window first, least-loaded
 *     gate/slot) followed by a short local-search improvement phase that
 *     minimizes peak slot load, reschedules, and waiting time.
 *   - baselineAssign: first-come-first-served — each truck takes the earliest
 *     feasible slot at its cargo's default gate, ignoring load balancing.
 *     This reproduces the "status quo" congestion for comparison.
 *
 * Deterministic given a seed. Pure functions — no I/O, no framework.
 */

import type { BookingRequest, SlotAssignment, GateId } from './types';
import {
  GATES,
  GATE_IDS,
  SLOT_MINUTES,
  DAY_START_MIN,
  DAY_END_MIN,
  SLOTS_PER_GATE,
  slotIndexToStart,
  startToSlotIndex,
} from './types';
import { makeRng } from './data';
import { noShowProbability, overbookLimit } from './predictor';

/** Trucks served per gate per 30-minute slot (5-minute service time). */
export const SLOT_CAPACITY = 4;

/** Penalty added when a candidate slot falls outside the preferred window. */
const RESCHEDULE_PENALTY = 6;

/** Local-search iterations. */
const LOCAL_SEARCH_ITERATIONS = 250;

export interface OptimizeOptions {
  seed?: number;
  /** Inflate per-slot capacity using the no-show-aware overbooking limit. */
  overbook?: boolean;
}

/** Default gate per cargo family (matches TERMINAL_BY_GATE in data.ts). */
const DEFAULT_GATE: Record<string, GateId> = {
  general: 0,
  grain: 1,
  reefer: 2,
  hazmat: 0,
};

/** Number of slots in the operating day. */
export function slotsPerDay(): number {
  return SLOTS_PER_GATE;
}

/** Clamp an absolute minute into a valid slot index. */
export function slotIndexFor(min: number): number {
  return startToSlotIndex(min);
}

/** Current load keyed by `${gate}:${slotStart}` — handy for tests and UI. */
export function loadBySlot(assignments: SlotAssignment[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of assignments) {
    const k = `${a.gate}:${a.slotStart}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function featuresFor(r: BookingRequest, slotStart: number) {
  return {
    leadTimeHours: r.leadTimeHours,
    driverNoShowRate: r.driverNoShowRate,
    slotStartMin: slotStart,
    cargo: r.cargo,
  };
}

interface Placed {
  req: BookingRequest;
  gate: GateId;
  slot: number; // slot index
}

function assignmentOf(p: Placed, loads: number[][]): SlotAssignment {
  const slotStart = slotIndexToStart(p.slot);
  const inWindow =
    slotStart >= p.req.preferredStart - SLOT_MINUTES / 2 &&
    slotStart <= p.req.preferredEnd;
  const load = loads[p.gate][p.slot];
  return {
    requestId: p.req.id,
    gate: p.gate,
    slotStart,
    rescheduled: !inWindow,
    noShowProbability: noShowProbability(featuresFor(p.req, slotStart)),
    // Expected queue wait: half the trucks ahead of you × service time.
    waitEstimateMin: Math.max(0, ((load - 1) * 5) / 2),
  };
}

function totalCost(placed: Placed[], loads: number[][]): number {
  let maxLoad = 0;
  let rescheduled = 0;
  let wait = 0;
  for (const p of placed) {
    const a = assignmentOf(p, loads);
    if (a.rescheduled) rescheduled += 1;
    wait += a.waitEstimateMin;
    const l = loads[p.gate][p.slot];
    if (l > maxLoad) maxLoad = l;
  }
  return maxLoad * 10 + rescheduled * 3 + wait * 0.5;
}

function rebuildLoads(placed: Placed[]): number[][] {
  const loads: number[][] = GATE_IDS.map(() =>
    new Array<number>(SLOTS_PER_GATE).fill(0),
  );
  for (const p of placed) loads[p.gate][p.slot] += 1;
  return loads;
}

/**
 * Greedy + local-search slot assignment.
 */
export function optimizeSlots(
  requests: BookingRequest[],
  opts: OptimizeOptions = {},
): SlotAssignment[] {
  if (!requests || requests.length === 0) return [];
  const rng = makeRng(opts.seed ?? 7);

  // Capacity, optionally inflated by expected no-shows.
  let capacity = SLOT_CAPACITY;
  if (opts.overbook) {
    const avg =
      requests.reduce(
        (s, r) =>
          s +
          noShowProbability({
            leadTimeHours: r.leadTimeHours,
            driverNoShowRate: r.driverNoShowRate,
            slotStartMin: r.preferredStart,
            cargo: r.cargo,
          }),
        0,
      ) / requests.length;
    capacity = overbookLimit(SLOT_CAPACITY, avg);
  }

  // Greedy order: earliest preferred start first (stable by id).
  const order = [...requests].sort(
    (a, b) => a.preferredStart - b.preferredStart || (a.id < b.id ? -1 : 1),
  );

  const loads: number[][] = GATE_IDS.map(() =>
    new Array<number>(SLOTS_PER_GATE).fill(0),
  );
  const placed: Placed[] = [];

  for (const req of order) {
    const ws = startToSlotIndex(req.preferredStart);
    const we = Math.max(ws, startToSlotIndex(req.preferredEnd));
    let best: { g: GateId; s: number; cost: number } | null = null;

    for (let s = 0; s < SLOTS_PER_GATE; s++) {
      const inWindow = s >= ws && s <= we;
      const penalty = inWindow ? 0 : RESCHEDULE_PENALTY;
      for (const g of GATE_IDS) {
        if (loads[g][s] >= capacity) continue;
        const cost = loads[g][s] + penalty;
        if (
          best === null ||
          cost < best.cost - 1e-9 ||
          (Math.abs(cost - best.cost) <= 1e-9 &&
            (g < best.g || (g === best.g && s < best.s)))
        ) {
          best = { g, s, cost };
        }
      }
    }

    // Fallback: if every slot is at capacity (extreme overload), allow overflow
    // on the least-loaded slot inside the window.
    if (!best) {
      let minLoad = Infinity;
      for (let s = ws; s <= we; s++) {
        for (const g of GATE_IDS) {
          if (loads[g][s] < minLoad) {
            minLoad = loads[g][s];
            best = { g, s, cost: minLoad + 0 };
          }
        }
      }
    }
    // Absolute fallback (should be unreachable): first slot, gate 0.
    const pick = best ?? { g: 0 as GateId, s: ws, cost: 0 };
    loads[pick.g][pick.s] += 1;
    placed.push({ req, gate: pick.g, slot: pick.s });
  }

  // Local search: random reassignments accepted only on strict improvement.
  for (let it = 0; it < LOCAL_SEARCH_ITERATIONS; it++) {
    const i = Math.floor(rng() * placed.length);
    const p = placed[i];
    const before = totalCost(placed, loads);

    const oldG = p.gate;
    const oldS = p.slot;
    loads[oldG][oldS] -= 1;

    const newG = GATE_IDS[Math.floor(rng() * GATE_IDS.length)];
    const newS = Math.floor(rng() * SLOTS_PER_GATE);
    p.gate = newG;
    p.slot = newS;
    loads[newG][newS] += 1;

    const after = totalCost(placed, loads);
    if (!(after < before - 1e-9) || loads[newG][newS] > capacity) {
      // revert: no improvement, or the move broke slot capacity
      loads[newG][newS] -= 1;
      p.gate = oldG;
      p.slot = oldS;
      loads[oldG][oldS] += 1;
    }
  }

  const finalLoads = rebuildLoads(placed);
  return placed.map((p) => assignmentOf(p, finalLoads));
}

/**
 * First-come-first-served baseline: earliest feasible slot at the cargo's
 * default gate, ignoring load balancing. Reproduces status-quo bunching.
 */
export function baselineAssign(requests: BookingRequest[]): SlotAssignment[] {
  if (!requests || requests.length === 0) return [];
  const order = [...requests].sort((a, b) => a.createdAt - b.createdAt);
  const loads: number[][] = GATE_IDS.map(() =>
    new Array<number>(SLOTS_PER_GATE).fill(0),
  );
  const out: SlotAssignment[] = [];

  for (const req of order) {
    const gate = DEFAULT_GATE[req.cargo] ?? 0;
    const ws = startToSlotIndex(req.preferredStart);
    // Earliest slot at this gate with spare capacity; else the emptiest slot.
    let slot = -1;
    for (let s = ws; s < SLOTS_PER_GATE; s++) {
      if (loads[gate][s] < SLOT_CAPACITY) {
        slot = s;
        break;
      }
    }
    if (slot === -1) {
      let minLoad = Infinity;
      for (let s = 0; s < SLOTS_PER_GATE; s++) {
        if (loads[gate][s] < minLoad) {
          minLoad = loads[gate][s];
          slot = s;
        }
      }
    }
    loads[gate][slot] += 1;
    const slotStart = slotIndexToStart(slot);
    out.push({
      requestId: req.id,
      gate,
      slotStart,
      rescheduled: false, // baseline never "reschedules" — it just queues
      noShowProbability: 0, // unknown without a TAS
      waitEstimateMin: Math.max(0, ((loads[gate][slot] - 1) * 5) / 2),
    });
  }
  return out;
}

export { GATES, SLOT_MINUTES, DAY_START_MIN, DAY_END_MIN };
