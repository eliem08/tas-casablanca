/**
 * tests/phase-d-helpers.ts
 *
 * Shared helpers for the Phase D (realistic validation) test files.
 * NOT a test file itself (vitest only picks up *.test.ts).
 *
 * mulberry32 is a small, self-contained, seedable PRNG — no new
 * dependencies. Every randomized test below takes an explicit seed so
 * failures are reproducible: re-run with the same seed to replay.
 */

import type { BookingRequest, CargoType, GateId, MoveType } from "../lib/types";
import { DAY_START_MIN, DAY_END_MIN } from "../lib/types";

/** mulberry32: tiny seedable PRNG, output in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** Float in [0, 1). */
  next: () => number;
  /** Integer in [lo, hi] inclusive. */
  int: (lo: number, hi: number) => number;
  /** Pick one element of a non-empty array. */
  pick: <T>(arr: readonly T[]) => T;
  /** True with probability p. */
  chance: (p: number) => boolean;
}

export function makeTestRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  };
}

const CARGOS: readonly CargoType[] = ["general", "grain", "reefer", "hazmat"];
const MOVES: readonly MoveType[] = ["import", "export"];
const TERMINALS = ["T1", "T2", "T3", "any"] as const;

export interface RandomInstanceOptions {
  /** Number of booking requests to generate. */
  count: number;
  /** Seed for reproducibility. */
  seed: number;
  /** All requests share this horizon day (default 0). */
  day?: number;
  /**
   * Preferred-window generator. Default: random 60–180 min windows inside
   * the operating day. Pass "tight" for adversarial bunching (everyone
   * wants the same 30-minute window).
   */
  windowMode?: "spread" | "tight";
}

/** Generate a random, schema-valid BookingRequest set (deterministic per seed). */
export function randomBookingRequests(opts: RandomInstanceOptions): BookingRequest[] {
  const rng = makeTestRng(opts.seed);
  const out: BookingRequest[] = [];
  for (let i = 0; i < opts.count; i++) {
    let preferredStart: number;
    let preferredEnd: number;
    if (opts.windowMode === "tight") {
      preferredStart = 480;
      preferredEnd = 510;
    } else {
      const width = rng.int(2, 6) * 30; // 60–180 min
      preferredStart =
        DAY_START_MIN + rng.int(0, Math.floor((DAY_END_MIN - DAY_START_MIN - width) / 30)) * 30;
      preferredEnd = preferredStart + width;
    }
    out.push({
      id: `pd-${opts.seed}-${i}`,
      company: `Carrier ${rng.int(1, 40)}`,
      truckPlate: `${rng.int(10000, 99999)} - A - ${rng.int(1, 9)}`,
      cargo: rng.pick(CARGOS),
      move: rng.pick(MOVES),
      containers: rng.chance(0.75) ? 1 : 2,
      preferredStart,
      preferredEnd,
      leadTimeHours: Math.round((2 + rng.next() * 70) * 2) / 2,
      driverNoShowRate: Math.round(rng.next() * 0.35 * 1000) / 1000,
      createdAt: 1_700_000_000_000 + i,
      day: opts.day ?? 0,
      terminal: rng.pick(TERMINALS),
    });
  }
  return out;
}

/** Random frozen (blocked) slot loads for exact-solver infeasibility tests. */
export function randomBlockedLoads(
  seed: number,
  fillFraction: number,
): Array<{ gate: GateId; slotStart: number }> {
  const rng = makeTestRng(seed);
  const out: Array<{ gate: GateId; slotStart: number }> = [];
  for (let g = 0 as GateId; g < 3; g = (g + 1) as GateId) {
    for (let s = 0; s < 32; s++) {
      if (rng.chance(fillFraction)) {
        out.push({ gate: g, slotStart: DAY_START_MIN + s * 30 });
      }
    }
  }
  return out;
}
