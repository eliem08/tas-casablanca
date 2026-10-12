import { NextResponse } from 'next/server';
import { simulateDay } from '@/lib/simulation';
import type { ScenarioResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

const DEFAULT_TRUCKS = 220;
const MIN_TRUCKS = 20;
const MAX_TRUCKS = 600;
const DEFAULT_SEED = 42;

interface SimulateDocs {
  description: string;
  params: {
    trucks: {
      type: 'number';
      required: false;
      default: number;
      min: number;
      max: number;
      description: string;
    };
    seed: {
      type: 'number';
      required: false;
      default: number;
      description: string;
    };
  };
  example: {
    request: {
      trucks: number;
      seed: number;
    };
    responseSummary: {
      trucks: number;
      seed: number;
      utilization: number;
      avgWaitMinutes: number;
      onTimeRate: number;
      peakQueueLength: number;
      totalDwellMinutes: number;
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readFiniteNumber(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    let body: unknown = {};

    const rawBody = await request.text();
    if (rawBody.trim() !== '') {
      try {
        body = JSON.parse(rawBody) as unknown;
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    }

    if (body !== null && body !== undefined && !isRecord(body)) {
      return NextResponse.json(
        { error: 'Body must be an object with optional "trucks" and "seed" fields' },
        { status: 400 },
      );
    }

    const source: Record<string, unknown> = isRecord(body) ? body : {};

    const rawTrucks = readFiniteNumber(source, 'trucks');
    if (source.trucks !== undefined && source.trucks !== null && rawTrucks === null) {
      return NextResponse.json({ error: '"trucks" must be a finite number' }, { status: 400 });
    }

    const rawSeed = readFiniteNumber(source, 'seed');
    if (source.seed !== undefined && source.seed !== null && rawSeed === null) {
      return NextResponse.json({ error: '"seed" must be a finite number' }, { status: 400 });
    }

    const trucks = clamp(Math.trunc(rawTrucks ?? DEFAULT_TRUCKS), MIN_TRUCKS, MAX_TRUCKS);
    const seed = Math.trunc(rawSeed ?? DEFAULT_SEED);

    const result: ScenarioResult = simulateDay(trucks, seed);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error while simulating day';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(): Promise<NextResponse> {
  const docs: SimulateDocs = {
    description:
      'Runs a deterministic single-day yard/dock simulation for a given number of trucks and a random seed. Truck count defaults to 220 and is clamped to the range 20..600. Seed defaults to 42. The response is a full ScenarioResult describing throughput, waiting times, utilization and queue behaviour for the simulated day.',
    params: {
      trucks: {
        type: 'number',
        required: false,
        default: DEFAULT_TRUCKS,
        min: MIN_TRUCKS,
        max: MAX_TRUCKS,
        description: 'Number of trucks to simulate for the day. Clamped to 20..600.',
      },
      seed: {
        type: 'number',
        required: false,
        default: DEFAULT_SEED,
        description: 'Deterministic random seed. Same seed and truck count always produce the same result.',
      },
    },
    example: {
      request: {
        trucks: 220,
        seed: 42,
      },
      responseSummary: {
        trucks: 220,
        seed: 42,
        utilization: 0.78,
        avgWaitMinutes: 24.6,
        onTimeRate: 0.91,
        peakQueueLength: 17,
        totalDwellMinutes: 9840,
      },
    },
  };

  return NextResponse.json(docs, { status: 200 });
}
