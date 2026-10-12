/**
 * Core domain types and constants for the Port of Casablanca
 * truck-appointment (TAS) simulation.
 *
 * All times are expressed in "minutes since midnight" unless the field
 * name explicitly says otherwise (e.g. `createdAt` is an epoch ms value).
 */

export type GateId = 0 | 1 | 2;

export type CargoType = 'general' | 'grain' | 'reefer' | 'hazmat';

export type MoveType = 'import' | 'export';

/** A trucking company's request for a gate slot on the simulated day. */
export interface BookingRequest {
  id: string;
  company: string;
  truckPlate: string;
  cargo: CargoType;
  move: MoveType;
  /** Number of containers carried by the truck: 1 or 2. */
  containers: 1 | 2;
  /** Preferred window start, minutes since midnight. */
  preferredStart: number;
  /** Preferred window end, minutes since midnight. */
  preferredEnd: number;
  /** How far in advance the booking was made, in hours. */
  leadTimeHours: number;
  /** Historical probability that this driver does not show up: 0..1. */
  driverNoShowRate: number;
  /** Epoch milliseconds at which the request was created. */
  createdAt: number;
}

/** The scheduler's decision for a single request. */
export interface SlotAssignment {
  requestId: string;
  gate: GateId;
  /** Assigned slot start, minutes since midnight. */
  slotStart: number;
  /** True when the assignment falls outside the preferred window. */
  rescheduled: boolean;
  /** Modeled probability the truck does not arrive: 0..1. */
  noShowProbability: number;
  /** Modeled queue wait for this truck, in minutes. */
  waitEstimateMin: number;
}

/** Aggregated KPIs for one simulated day. */
export interface DayMetrics {
  maxQueueLength: number;
  avgWaitMin: number;
  totalTrucks: number;
  servedTrucks: number;
  /** Fraction of assignments that had to be moved: 0..1. */
  rescheduleRate: number;
  /** Per-gate utilization: 0..1 for gates 0, 1 and 2. */
  gateUtilization: [number, number, number];
  co2Tonnes: number;
  throughputPerHour: number;
  /** Queue length over the day, baseline vs optimized, `t` is "HH:MM". */
  queueSeries: Array<{ t: string; baseline: number; optimized: number }>;
}

/** Full result of a baseline-vs-optimized scenario run. */
export interface ScenarioResult {
  baseline: DayMetrics;
  optimized: DayMetrics;
  params: { trucks: number; seed: number };
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Number of physical gates at the terminal. */
export const GATES = 3;

/** Length of one appointment slot, in minutes. */
export const SLOT_MINUTES = 30;

/** Operating day start: 06:00. */
export const DAY_START_MIN = 360;

/** Operating day end: 22:00. */
export const DAY_END_MIN = 1320;

/** Average gate service time per truck, in minutes. */
export const SERVICE_MIN_PER_TRUCK = 5;

/** Idle fuel burn of a waiting truck, litres per hour. */
export const IDLE_FUEL_L_PER_H = 2.5;

/** Kilograms of CO2 emitted per litre of diesel burned. */
export const CO2_KG_PER_L = 2.68;

/* ------------------------------------------------------------------ */
/* Derived values                                                      */
/* ------------------------------------------------------------------ */

/** Total minutes in the operating day (960). */
export const DAY_LENGTH_MIN = DAY_END_MIN - DAY_START_MIN;

/** Number of 30-minute slots per gate per day (32). */
export const SLOTS_PER_GATE = Math.floor(DAY_LENGTH_MIN / SLOT_MINUTES);

/** Total appointment capacity across all gates for one day (96). */
export const TOTAL_SLOTS_PER_DAY = SLOTS_PER_GATE * GATES;

/** Stable list of gate ids, useful for iteration. */
export const GATE_IDS: readonly GateId[] = [0, 1, 2];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Formats minutes-since-midnight as a zero-padded "HH:MM" string. */
export function minutesToHHMM(min: number): string {
  const safe = Number.isFinite(min) ? Math.round(min) : 0;
  const wrapped = ((safe % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Converts a slot index (0..SLOTS_PER_GATE-1) to its start minute. */
export function slotIndexToStart(index: number): number {
  return DAY_START_MIN + index * SLOT_MINUTES;
}

/** Converts a start minute to the nearest slot index, clamped to the day. */
export function startToSlotIndex(start: number): number {
  return clampSlotIndex(Math.floor((start - DAY_START_MIN) / SLOT_MINUTES));
}

/** Clamps a slot index into the valid range for the operating day. */
export function clampSlotIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  const i = Math.trunc(index);
  if (i < 0) return 0;
  if (i > SLOTS_PER_GATE - 1) return SLOTS_PER_GATE - 1;
  return i;
}

/** Type guard for gate identifiers. */
export function isGateId(value: number): value is GateId {
  return value === 0 || value === 1 || value === 2;
}

/** CO2 (tonnes) produced by `trucks` idling for `minutes` each. */
export function idleCo2Tonnes(trucks: number, minutes: number): number {
  const litres = (trucks * minutes * IDLE_FUEL_L_PER_H) / 60;
  return (litres * CO2_KG_PER_L) / 1000;
}

/** Fraction of the operating day covered by a slot, used for utilization. */
export const SLOT_HOURS = SLOT_MINUTES / 60;
