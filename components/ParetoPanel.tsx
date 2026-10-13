"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { ErrorNote, LoadingSpinner } from "./ui";

interface ParetoPoint {
  lambda: number;
  totalWait: number;
  rescheduled: number;
  avgWait: number;
  rescheduleRate: number;
}

interface ParetoData {
  day: number;
  trucks: number;
  seed: number;
  points: ParetoPoint[];
}

/**
 * Bi-objective Pareto frontier: total wait vs rescheduled trucks.
 * CO₂ is deliberately excluded — it is a linear function of wait, so
 * waiting-vs-CO₂ would be a degenerate pair (all points on a line).
 * Click a point to select it as the operating point.
 */
export default function ParetoPanel({
  trucks,
  seed,
  day,
}: {
  trucks: number;
  seed: number;
  day: number;
}) {
  const [data, setData] = useState<ParetoData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ParetoPoint | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/pareto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trucks, seed, day }),
      });
      if (!res.ok) throw new Error(`Pareto API returned ${res.status}`);
      const json = (await res.json()) as ParetoData;
      setData(json);
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pareto computation failed.");
    } finally {
      setLoading(false);
    }
  }, [trucks, seed, day]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink-950">
            Pareto frontier — waiting vs reschedules
          </h3>
          <p className="mt-1 text-sm text-ink-900/60">
            No single “best” plan: cutting wait moves more trucks out of their
            preferred windows. The frontier is the set of mutually
            non-dominated trade-offs (weight sweep + SA refinement). Click a
            point to select that operating point.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-xl border border-ink-900/15 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:border-ink-900/30 disabled:opacity-50"
        >
          {loading ? "Sweeping…" : "Re-run"}
        </button>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote message={error} onRetry={load} />
        </div>
      )}
      {loading && !data && <LoadingSpinner label="Sweeping λ across the frontier…" />}

      {data && (
        <div className="mt-5">
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="totalWait"
                    name="Total wait"
                    unit=" min"
                    tick={{ fontSize: 11 }}
                    label={{ value: "Total wait (min) →", position: "insideBottom", offset: -2, fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="rescheduled"
                    name="Rescheduled"
                    tick={{ fontSize: 11 }}
                    label={{ value: "Rescheduled trucks", angle: -90, position: "insideLeft", fontSize: 11 }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    formatter={(value, name) => [
                      typeof value === "number" ? value.toFixed(1) : value,
                      name,
                    ]}
                  />
                  <Scatter
                    data={data.points}
                    fill="#0ea5e9"
                    onClick={(p) => {
                      const pt = p?.payload as ParetoPoint | undefined;
                      if (pt) setSelected(pt);
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <div className="lg:col-span-2">
              {selected ? (
                <div className="rounded-xl bg-brand-500/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
                    Selected operating point
                  </p>
                  <p className="tnum font-display mt-2 text-xl font-bold">
                    λ = {selected.lambda.toFixed(1)}
                  </p>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-900/60">Total wait</dt>
                      <dd className="tnum font-semibold">{selected.totalWait.toFixed(1)} min</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-900/60">Avg wait / truck</dt>
                      <dd className="tnum font-semibold">{selected.avgWait.toFixed(1)} min</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-ink-900/60">Rescheduled</dt>
                      <dd className="tnum font-semibold">
                        {selected.rescheduled} ({(selected.rescheduleRate * 100).toFixed(1)}%)
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-3 text-xs leading-relaxed text-ink-900/55">
                    λ = 1 minimizes wait only; λ = 0 minimizes reschedules
                    only. The dispatcher picks the trade-off — there is no
                    mathematically “correct” λ.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-paper p-4 text-sm text-ink-900/60">
                  <p className="font-semibold text-ink-900">How to read this</p>
                  <p className="mt-2 leading-relaxed">
                    Every dot is a plan no other plan beats on BOTH objectives.
                    Moving left cuts waiting; moving down cuts reschedules.
                    Click any dot to inspect it.
                  </p>
                  <p className="mt-2 leading-relaxed">
                    {data.points.length} non-dominated points found from the
                    11-point λ sweep.
                  </p>
                </div>
              )}
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-900/50">
            Honest note: scalarization can miss points in non-convex regions
            of the true frontier, and SA refinement is heuristic — these are
            mutually non-dominated approximations, not proven Pareto-optimal
            points.
          </p>
        </div>
      )}
    </div>
  );
}
