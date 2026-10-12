/**
 * lib/simulation.ts
 *
 * Day-level discrete-event simulation comparing two worlds:
 *
 *   baseline  — no appointment system. Trucks arrive around their preferred
 *               time with wide jitter, plus a 12% unannounced walk-in surge
 *               at the morning peak. Nobody is turned away; queues explode.
 *   optimized — TAS. Trucks arrive inside a tight window around their
 *               assigned slot; modeled no-shows (lib/predictor) never arrive.
 *
 * Queue model (deliberately simple, fully deterministic per seed): 5-minute
 * time steps, one FIFO queue per gate, one truck served per gate per step
 * (SERVICE_MIN_PER_TRUCK = 5). Enough to reproduce the congestion curve
 * without pretending to be a traffic microsimulator.
 */

import type { DayMetrics, ScenarioResult } from './types';
import {
  GATE_IDS,
  DAY_START_MIN,
  DAY_END_MIN,
  SERVICE_MIN_PER_TRUCK,
  IDLE_FUEL_L_PER_H,
  CO2_KG_PER_L,
  minutesToHHMM,
} from './types';
import { makeRng, generateDayRequests } from './data';
import { optimizeSlots, baselineAssign } from './optimizer';
import { noShowProbability } from './predictor';

const STEP_MIN = 5;
const OPT_JITTER = 12; // optimized arrivals: ±12 min around slot
const BASE_JITTER_EARLY = -30; // baseline arrivals: -30..
const BASE_JITTER_LATE = 90; // ..+90 min around preferred start
const BASELINE_SURGE_RATE = 0.12; // unannounced walk-ins at morning peak
const PEAK_WINDOW_MIN = 180; // first 3h of the operating day
const SERIES_EVERY_MIN = 30;

const SIM_START = DAY_START_MIN - 60;
const SIM_END = DAY_END_MIN + 120;

interface Arrival {
  time: number;
  gate: number;
}

function simulateQueues(arrivals: Arrival[]): {
  maxQueue: number;
  avgWaitMin: number;
  served: number;
  utilization: [number, number, number];
  queueSeries: number[];
  seriesTimes: number[];
} {
  const sorted = [...arrivals].sort((a, b) => a.time - b.time);
  const queues: number[][] = GATE_IDS.map(() => []); // arrival times
  const busySteps = [0, 0, 0];
  let totalSteps = 0;
  let maxQueue = 0;
  let waitSum = 0;
  let served = 0;
  const queueSeries: number[] = [];
  const seriesTimes: number[] = [];

  let ai = 0;
  for (let t = SIM_START; t <= SIM_END; t += STEP_MIN) {
    totalSteps += 1;
    while (ai < sorted.length && sorted[ai].time <= t) {
      queues[sorted[ai].gate].push(sorted[ai].time);
      ai += 1;
    }
    let q = 0;
    for (const g of GATE_IDS) {
      q += queues[g].length;
      if (queues[g].length > 0) {
        busySteps[g] += 1;
        const arrivedAt = queues[g].shift()!;
        waitSum += Math.max(0, t - arrivedAt);
        served += 1;
      }
    }
    if (q > maxQueue) maxQueue = q;
    if ((t - SIM_START) % SERIES_EVERY_MIN === 0) {
      queueSeries.push(q);
      seriesTimes.push(t);
    }
  }
  // Trucks still queued at SIM_END never got served; charge them the
  // remaining wait estimate so avgWait reflects the meltdown honestly.
  let stranded = 0;
  for (const g of GATE_IDS) {
    for (const arrivedAt of queues[g]) {
      waitSum += Math.max(0, SIM_END - arrivedAt);
      stranded += 1;
    }
  }

  const denom = Math.max(1, served + stranded);
  return {
    maxQueue,
    avgWaitMin: waitSum / denom,
    served,
    utilization: [
      busySteps[0] / totalSteps,
      busySteps[1] / totalSteps,
      busySteps[2] / totalSteps,
    ],
    queueSeries,
    seriesTimes,
  };
}

/**
 * Simulate one operating day with `nTrucks` of demand.
 * Deterministic for a given seed.
 */
export function simulateDay(nTrucks = 220, seed = 42): ScenarioResult {
  const rng = makeRng(seed);
  const requests = generateDayRequests(nTrucks, seed);

  const optAssignments = optimizeSlots(requests, { seed, overbook: true });
  const baseAssignments = baselineAssign(requests);
  const byId = new Map(requests.map((r) => [r.id, r]));

  // --- Optimized arrivals: tight around the assigned slot, minus no-shows.
  const optArrivals: Arrival[] = [];
  for (const a of optAssignments) {
    const req = byId.get(a.requestId);
    if (!req) continue;
    const p = noShowProbability({
      leadTimeHours: req.leadTimeHours,
      driverNoShowRate: req.driverNoShowRate,
      slotStartMin: a.slotStart,
      cargo: req.cargo,
    });
    if (rng() < p) continue; // no-show: never arrives
    const jitter = (rng() * 2 - 1) * OPT_JITTER;
    optArrivals.push({ time: a.slotStart + jitter, gate: a.gate });
  }

  // --- Baseline arrivals: preferred time ± wide jitter + walk-in surge.
  const baseArrivals: Arrival[] = [];
  for (const a of baseAssignments) {
    const req = byId.get(a.requestId);
    if (!req) continue;
    const jitter =
      BASE_JITTER_EARLY + rng() * (BASE_JITTER_LATE - BASE_JITTER_EARLY);
    baseArrivals.push({ time: req.preferredStart + jitter, gate: a.gate });
  }
  const surge = Math.round(nTrucks * BASELINE_SURGE_RATE);
  for (let i = 0; i < surge; i++) {
    baseArrivals.push({
      time: DAY_START_MIN + rng() * PEAK_WINDOW_MIN,
      gate: GATE_IDS[Math.floor(rng() * GATE_IDS.length)],
    });
  }

  const opt = simulateQueues(optArrivals);
  const base = simulateQueues(baseArrivals);

  const co2 = (avgWaitMin: number, trucks: number) =>
    ((trucks * avgWaitMin * IDLE_FUEL_L_PER_H) / 60) * CO2_KG_PER_L / 1000;

  const operatingHours = (DAY_END_MIN - DAY_START_MIN) / 60;

  const toMetrics = (
    s: ReturnType<typeof simulateQueues>,
    totalTrucks: number,
    rescheduleRate: number,
  ): DayMetrics => ({
    maxQueueLength: s.maxQueue,
    avgWaitMin: Math.round(s.avgWaitMin * 10) / 10,
    totalTrucks,
    servedTrucks: s.served,
    rescheduleRate: Math.round(rescheduleRate * 1000) / 1000,
    gateUtilization: [
      Math.round(s.utilization[0] * 1000) / 1000,
      Math.round(s.utilization[1] * 1000) / 1000,
      Math.round(s.utilization[2] * 1000) / 1000,
    ],
    co2Tonnes: Math.round(co2(s.avgWaitMin, totalTrucks) * 1000) / 1000,
    throughputPerHour: Math.round((s.served / operatingHours) * 10) / 10,
    queueSeries: s.seriesTimes.map((t, i) => ({
      t: minutesToHHMM(t),
      baseline: 0, // filled by caller
      optimized: 0,
    })),
  });

  const bMetrics = toMetrics(base, nTrucks + surge, 0);
  const oMetrics = toMetrics(
    opt,
    nTrucks,
    optAssignments.filter((a) => a.rescheduled).length /
      Math.max(1, optAssignments.length),
  );

  // Merge the two queue curves into one series for the chart.
  const queueSeries = base.seriesTimes.map((t, i) => ({
    t: minutesToHHMM(t),
    baseline: base.queueSeries[i] ?? 0,
    optimized: opt.queueSeries[i] ?? 0,
  }));
  bMetrics.queueSeries = queueSeries;
  oMetrics.queueSeries = queueSeries;

  return {
    baseline: bMetrics,
    optimized: oMetrics,
    params: { trucks: nTrucks, seed },
  };
}
