"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ErrorNote, LoadingSpinner } from "./ui";

interface ExactData {
  day: number;
  trucks: number;
  seed: number;
  exact: {
    cost: number;
    optimal: boolean;
    aborted: boolean;
    feasible: boolean;
    nodes: number;
    pruned: number;
  };
  greedy: { cost: number; gapPct: number };
  annealed: { cost: number; gapPct: number };
}

/**
 * Exact vs heuristics on a small instance. The professor move: greedy and
 * annealing are measured against a PROVEN optimum, not against each other.
 * If the search aborts on the node budget, the panel says "not proven".
 */
export default function ExactPanel({
  seed,
  day,
}: {
  seed: number;
  day: number;
}) {
  const [trucks, setTrucks] = useState(8);
  const [data, setData] = useState<ExactData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/exact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trucks, seed, day }),
      });
      if (!res.ok) throw new Error(`Exact API returned ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Exact comparison failed.");
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
            Exact optimum vs heuristics — measured against truth
          </h3>
          <p className="mt-1 text-sm text-ink-900/60">
            Branch-and-bound <strong>proves</strong> the optimum for a small
            instance (n ≤ 12). Gaps are (heuristic − optimum) / optimum. A
            gap of 0% means the heuristic found a proven optimum.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-ink-900/60">
            Trucks
            <input
              type="number"
              min={2}
              max={12}
              value={trucks}
              onChange={(e) => setTrucks(Math.max(2, Math.min(12, Number(e.target.value) || 8)))}
              className="ml-2 w-16 rounded-lg border border-ink-900/15 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl border border-ink-900/15 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:border-ink-900/30 disabled:opacity-50"
          >
            {loading ? "Proving…" : "Run exact"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote message={error} onRetry={load} />
        </div>
      )}
      {loading && !data && <LoadingSpinner label="Branch-and-bound proving the optimum…" />}

      {data && (
        <div className="mt-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-paper p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                Exact optimum
              </p>
              <p className="tnum font-display mt-1 text-2xl font-bold">
                {data.exact.cost.toFixed(1)}
              </p>
              <p className="mt-1 text-xs">
                {data.exact.optimal ? (
                  <span className="font-semibold text-sea-700">✓ Proven optimal</span>
                ) : (
                  <span className="font-semibold text-amber-700">
                    Not proven — node budget exhausted
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-ink-900/50">
                {data.exact.nodes.toLocaleString()} nodes ·{" "}
                {data.exact.pruned.toLocaleString()} pruned
              </p>
            </div>
            <div className="rounded-xl bg-paper p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                Greedy + local search
              </p>
              <p className="tnum font-display mt-1 text-2xl font-bold">
                {data.greedy.cost.toFixed(1)}
              </p>
              <p className="mt-1 text-xs">
                Gap:{" "}
                <span className={data.greedy.gapPct <= 0.01 ? "font-semibold text-sea-700" : "font-semibold text-amber-700"}>
                  {data.greedy.gapPct.toFixed(2)}%
                </span>
              </p>
            </div>
            <div className="rounded-xl bg-paper p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                + Simulated annealing
              </p>
              <p className="tnum font-display mt-1 text-2xl font-bold">
                {data.annealed.cost.toFixed(1)}
              </p>
              <p className="mt-1 text-xs">
                Gap:{" "}
                <span className={data.annealed.gapPct <= 0.01 ? "font-semibold text-sea-700" : "font-semibold text-amber-700"}>
                  {data.annealed.gapPct.toFixed(2)}%
                </span>
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-900/50">
            Branch-and-bound prunes with a valid lower bound (peak + placed
            terms + partial slot wait + cheapest possible terms for unplaced
            trucks). If the node budget is exhausted the solver returns the
            best solution found with optimal=false — it never claims a proof
            it did not complete. See <Link href="/methodology" className="underline">Methodology</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
