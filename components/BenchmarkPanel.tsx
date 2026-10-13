"use client";

import { useCallback, useEffect, useState } from "react";
import { horizonDayLabel } from "@/lib/data";
import { ErrorNote, LoadingSpinner } from "./ui";

interface BenchmarkRow {
  cost: number;
  avgWaitMin: number;
  rescheduled: number;
  rescheduleRate: number;
  maxSlotLoad: number;
  co2Tonnes: number;
}

interface BenchmarkData {
  day: number;
  trucks: number;
  seed: number;
  greedy: BenchmarkRow;
  annealed: BenchmarkRow;
  delta: {
    cost: number;
    avgWaitMin: number;
    rescheduled: number;
    co2Tonnes: number;
  };
}

function fmt(v: number, digits = 2): string {
  return v.toFixed(digits);
}

/**
 * Greedy vs simulated annealing on identical demand. Annealing starts from
 * the greedy solution and keeps the best seen, so its cost is never worse —
 * the panel shows how much better it actually gets on this day.
 */
export default function BenchmarkPanel({
  trucks,
  seed,
  day,
}: {
  trucks: number;
  seed: number;
  day: number;
}) {
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trucks, seed, day }),
      });
      if (!res.ok) throw new Error(`Benchmark API returned ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Benchmark failed.");
    } finally {
      setLoading(false);
    }
  }, [trucks, seed, day]);

  useEffect(() => {
    load();
  }, [load]);

  const rows: Array<{
    label: string;
    greedy: string;
    annealed: string;
    delta: string;
    better: boolean;
  }> = data
    ? [
        {
          label: "Optimizer cost (lower = better)",
          greedy: fmt(data.greedy.cost, 1),
          annealed: fmt(data.annealed.cost, 1),
          delta:
            data.delta.cost < -0.05
              ? `−${fmt(Math.abs(data.delta.cost), 1)}`
              : data.delta.cost > 0.05
                ? `+${fmt(data.delta.cost, 1)}`
                : "±0",
          better: data.delta.cost < -0.05,
        },
        {
          label: "Avg wait per truck (min)",
          greedy: fmt(data.greedy.avgWaitMin, 1),
          annealed: fmt(data.annealed.avgWaitMin, 1),
          delta:
            data.delta.avgWaitMin < -0.05
              ? `−${fmt(Math.abs(data.delta.avgWaitMin), 1)}`
              : data.delta.avgWaitMin > 0.05
                ? `+${fmt(data.delta.avgWaitMin, 1)}`
                : "±0",
          better: data.delta.avgWaitMin < -0.05,
        },
        {
          label: "Trucks rescheduled",
          greedy: `${data.greedy.rescheduled} (${(data.greedy.rescheduleRate * 100).toFixed(1)}%)`,
          annealed: `${data.annealed.rescheduled} (${(data.annealed.rescheduleRate * 100).toFixed(1)}%)`,
          delta:
            data.delta.rescheduled < 0
              ? `${data.delta.rescheduled}`
              : data.delta.rescheduled > 0
                ? `+${data.delta.rescheduled}`
                : "±0",
          better: data.delta.rescheduled < 0,
        },
        {
          label: "Peak slot load (trucks)",
          greedy: `${data.greedy.maxSlotLoad}`,
          annealed: `${data.annealed.maxSlotLoad}`,
          delta:
            data.annealed.maxSlotLoad < data.greedy.maxSlotLoad
              ? `${data.annealed.maxSlotLoad - data.greedy.maxSlotLoad}`
              : data.annealed.maxSlotLoad > data.greedy.maxSlotLoad
                ? `+${data.annealed.maxSlotLoad - data.greedy.maxSlotLoad}`
                : "±0",
          better: data.annealed.maxSlotLoad < data.greedy.maxSlotLoad,
        },
        {
          label: "Est. CO₂ from idling (t)",
          greedy: fmt(data.greedy.co2Tonnes),
          annealed: fmt(data.annealed.co2Tonnes),
          delta:
            data.delta.co2Tonnes < -0.005
              ? `−${fmt(Math.abs(data.delta.co2Tonnes))}`
              : data.delta.co2Tonnes > 0.005
                ? `+${fmt(data.delta.co2Tonnes)}`
                : "±0",
          better: data.delta.co2Tonnes < -0.005,
        },
      ]
    : [];

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink-950">
            Optimizer benchmark — greedy vs simulated annealing
          </h3>
          <p className="mt-1 text-sm text-ink-900/60">
            Both methods run on the identical {trucks}-truck demand for{" "}
            {horizonDayLabel(day)}. Annealing starts from the greedy plan and
            keeps the best seen, so it can never score worse.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-xl border border-ink-900/15 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:border-ink-900/30 disabled:opacity-50"
        >
          {loading ? "Running…" : "Re-run"}
        </button>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote message={error} onRetry={load} />
        </div>
      )}
      {loading && !data && <LoadingSpinner label="Running both optimizers…" />}

      {data && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wider text-ink-900/50">
                <th className="py-2 pr-3 font-semibold">Metric</th>
                <th className="py-2 pr-3 font-semibold">Greedy + local search</th>
                <th className="py-2 pr-3 font-semibold">+ Simulated annealing</th>
                <th className="py-2 font-semibold">Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-ink-900/5">
                  <td className="py-2.5 pr-3 text-ink-900/75">{r.label}</td>
                  <td className="tnum py-2.5 pr-3 font-medium">{r.greedy}</td>
                  <td className="tnum py-2.5 pr-3 font-medium">{r.annealed}</td>
                  <td
                    className={`tnum py-2.5 font-bold ${r.better ? "text-sea-700" : "text-ink-900/50"}`}
                  >
                    {r.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-relaxed text-ink-900/50">
            Annealing: 2,500 neighbour moves, geometric cooling 6 → 0.02,
            uphill moves accepted with probability exp(−Δ/T). Same seeded
            demand, same cost function — the comparison is apples-to-apples.
          </p>
        </div>
      )}
    </div>
  );
}
