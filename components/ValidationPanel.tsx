"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorNote, LoadingSpinner } from "./ui";

interface ValidationData {
  trucks: number;
  seed: number;
  warmUpMin: number;
  window: { start: number; end: number };
  meanQueue: number;
  avgWait: number;
  littlesLaw: {
    avgNumberInSystem: number;
    arrivalRate: number;
    avgWait: number;
    predicted: number;
    meanPhase: number;
    relativeError: number;
    passes: boolean;
    tolerance: number;
    trucksCounted: number;
  };
  queueBatchMeans: { mean: number; low: number; high: number; halfWidth: number; batches: number };
  waitBatchMeans: { mean: number; low: number; high: number; halfWidth: number; batches: number };
}

/**
 * Statistical validation: warm-up + batch-means CIs + Little's Law check.
 * Little's Law is a theorem — the check validates the simulator's
 * bookkeeping (two independent measurements agreeing), not the physics.
 */
export default function ValidationPanel({
  trucks,
  seed,
}: {
  trucks: number;
  seed: number;
}) {
  const [warmUpMin, setWarmUpMin] = useState(60);
  const [data, setData] = useState<ValidationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trucks, seed, warmUpMin }),
      });
      if (!res.ok) throw new Error(`Validation API returned ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed.");
    } finally {
      setLoading(false);
    }
  }, [trucks, seed, warmUpMin]);

  useEffect(() => {
    load();
  }, [load]);

  const fmtClock = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink-950">
            Statistical validation — warm-up, batch means, Little&apos;s Law
          </h3>
          <p className="mt-1 text-sm text-ink-900/60">
            KPIs are reported with 95% batch-means confidence intervals, not
            bare point estimates. The Little&apos;s Law check compares two
            independent measurements of the same queue (time-sampled L vs
            λ·W from per-truck records) — agreement means the simulator&apos;s
            bookkeeping is consistent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-ink-900/60">
            Warm-up (min)
            <input
              type="number"
              min={0}
              max={240}
              value={warmUpMin}
              onChange={(e) => setWarmUpMin(Math.max(0, Math.min(240, Number(e.target.value) || 60)))}
              className="ml-2 w-16 rounded-lg border border-ink-900/15 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl border border-ink-900/15 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:border-ink-900/30 disabled:opacity-50"
          >
            {loading ? "Validating…" : "Re-run"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote message={error} onRetry={load} />
        </div>
      )}
      {loading && !data && <LoadingSpinner label="Running instrumented simulation…" />}

      {data && (
        <div className="mt-5 space-y-5">
          <div className="rounded-xl bg-paper p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-900/50">
                Little&apos;s Law check — L = λ · (W − phase + step)
              </p>
              {data.littlesLaw.passes ? (
                <span className="rounded-full bg-sea-700/10 px-2.5 py-1 text-xs font-bold text-sea-700">
                  ✓ Consistent
                </span>
              ) : (
                <span className="rounded-full bg-amber-700/10 px-2.5 py-1 text-xs font-bold text-amber-700">
                  ✗ Inconsistent — bookkeeping error suspected
                </span>
              )}
            </div>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs text-ink-900/50">L (time-sampled)</p>
                <p className="tnum font-display text-lg font-bold">{data.littlesLaw.avgNumberInSystem.toFixed(2)} trucks</p>
              </div>
              <div>
                <p className="text-xs text-ink-900/50">λ (arrivals/min)</p>
                <p className="tnum font-display text-lg font-bold">{data.littlesLaw.arrivalRate.toFixed(3)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-900/50">W (avg wait)</p>
                <p className="tnum font-display text-lg font-bold">{data.littlesLaw.avgWait.toFixed(1)} min</p>
              </div>
              <div>
                <p className="text-xs text-ink-900/50">λ·W (predicted L)</p>
                <p className="tnum font-display text-lg font-bold">{data.littlesLaw.predicted.toFixed(2)} trucks</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-900/55">
              Relative error {(data.littlesLaw.relativeError * 100).toFixed(1)}%
              (tolerance {(data.littlesLaw.tolerance * 100).toFixed(0)}%) ·{" "}
              {data.littlesLaw.trucksCounted} trucks counted · mean arrival
              phase {data.littlesLaw.meanPhase.toFixed(2)} min (discrete-time
              correction: predicted L = λ·(W − phase + 5)) · window{" "}
              {fmtClock(data.window.start)}–{fmtClock(data.window.end)} after a{" "}
              {data.warmUpMin}-minute warm-up. The system is non-stationary
              (morning peak), so exact equality is not expected.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-paper p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-900/50">
                Queue length — 95% batch-means CI
              </p>
              <p className="tnum font-display mt-2 text-2xl font-bold">
                {data.queueBatchMeans.mean.toFixed(2)}{" "}
                <span className="text-sm font-medium text-ink-900/50">
                  [{data.queueBatchMeans.low.toFixed(2)}, {data.queueBatchMeans.high.toFixed(2)}]
                </span>
              </p>
              <p className="mt-1 text-xs text-ink-900/55">
                Half-width ±{data.queueBatchMeans.halfWidth.toFixed(2)} ·{" "}
                {data.queueBatchMeans.batches} batches · Student-t critical values.
              </p>
            </div>
            <div className="rounded-xl bg-paper p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-900/50">
                Wait per truck — 95% batch-means CI
              </p>
              <p className="tnum font-display mt-2 text-2xl font-bold">
                {data.waitBatchMeans.mean.toFixed(1)}{" "}
                <span className="text-sm font-medium text-ink-900/50">
                  [{data.waitBatchMeans.low.toFixed(1)}, {data.waitBatchMeans.high.toFixed(1)}] min
                </span>
              </p>
              <p className="mt-1 text-xs text-ink-900/55">
                Half-width ±{data.waitBatchMeans.halfWidth.toFixed(1)} min ·{" "}
                {data.waitBatchMeans.batches} batches · Student-t critical values.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
