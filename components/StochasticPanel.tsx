"use client";

import { useCallback, useEffect, useState } from "react";
import { ErrorNote, LoadingSpinner } from "./ui";

interface CandidateSlim {
  label: string;
  expectedCost: number;
  worstCost: number;
  overflowProb: number;
  satisfiesChance: boolean;
}

interface StochasticData {
  day: number;
  trucks: number;
  seed: number;
  scenarios: number;
  alpha: number;
  chanceSatisfied: boolean;
  expectedImprovement: number;
  deterministic: CandidateSlim;
  chosen: CandidateSlim;
}

/**
 * Stochastic planning (SAA) under no-show uncertainty. The chosen plan is
 * the lowest-expected-cost candidate satisfying P(overflow) ≤ α. Because
 * the deterministic plan is always a candidate, expected cost never gets
 * worse — the panel shows the honest comparison.
 */
export default function StochasticPanel({
  trucks,
  seed,
  day,
}: {
  trucks: number;
  seed: number;
  day: number;
}) {
  const [alpha, setAlpha] = useState(0.05);
  const [scenarios, setScenarios] = useState(25);
  const [data, setData] = useState<StochasticData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/stochastic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trucks, seed, day, scenarios, alpha }),
      });
      if (!res.ok) throw new Error(`Stochastic API returned ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stochastic planning failed.");
    } finally {
      setLoading(false);
    }
  }, [trucks, seed, day, scenarios, alpha]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink-950">
            Stochastic planning — plan for the trucks that actually show up
          </h3>
          <p className="mt-1 text-sm text-ink-900/60">
            Sample Average Approximation over {scenarios} no-show scenarios.
            The chosen plan minimizes <em>expected</em> cost subject to the
            chance constraint P(any slot overflows) ≤ α. Evaluation over the
            sampled scenarios is exact; the candidate-set search is heuristic.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-900/60">
            α (chance level)
            <input
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={alpha}
              onChange={(e) => setAlpha(Number(e.target.value))}
              className="w-24"
            />
            <span className="tnum w-10 text-sm text-ink-900">{(alpha * 100).toFixed(0)}%</span>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-900/60">
            Scenarios
            <input
              type="number"
              min={5}
              max={50}
              value={scenarios}
              onChange={(e) => setScenarios(Math.max(5, Math.min(50, Number(e.target.value) || 25)))}
              className="w-16 rounded-lg border border-ink-900/15 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl border border-ink-900/15 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:border-ink-900/30 disabled:opacity-50"
          >
            {loading ? "Sampling…" : "Re-run"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote message={error} onRetry={load} />
        </div>
      )}
      {loading && !data && <LoadingSpinner label="Sampling no-show scenarios…" />}

      {data && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wider text-ink-900/50">
                <th className="py-2 pr-3 font-semibold">Plan</th>
                <th className="py-2 pr-3 font-semibold">Expected cost</th>
                <th className="py-2 pr-3 font-semibold">Worst-case cost</th>
                <th className="py-2 pr-3 font-semibold">P(overflow)</th>
                <th className="py-2 font-semibold">Chance constraint</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-ink-900/5">
                <td className="py-2.5 pr-3 text-ink-900/75">Deterministic (full demand)</td>
                <td className="tnum py-2.5 pr-3 font-medium">{data.deterministic.expectedCost.toFixed(1)}</td>
                <td className="tnum py-2.5 pr-3 font-medium">{data.deterministic.worstCost.toFixed(1)}</td>
                <td className="tnum py-2.5 pr-3 font-medium">{(data.deterministic.overflowProb * 100).toFixed(0)}%</td>
                <td className="py-2.5">
                  {data.deterministic.satisfiesChance ? (
                    <span className="font-semibold text-sea-700">Satisfied</span>
                  ) : (
                    <span className="font-semibold text-amber-700">Violated</span>
                  )}
                </td>
              </tr>
              <tr className="border-b border-ink-900/5 bg-brand-500/5">
                <td className="py-2.5 pr-3 font-semibold text-ink-950">
                  Stochastic (chosen) — {data.chosen.label}
                </td>
                <td className="tnum py-2.5 pr-3 font-bold">{data.chosen.expectedCost.toFixed(1)}</td>
                <td className="tnum py-2.5 pr-3 font-medium">{data.chosen.worstCost.toFixed(1)}</td>
                <td className="tnum py-2.5 pr-3 font-medium">{(data.chosen.overflowProb * 100).toFixed(0)}%</td>
                <td className="py-2.5">
                  {data.chosen.satisfiesChance ? (
                    <span className="font-semibold text-sea-700">Satisfied</span>
                  ) : (
                    <span className="font-semibold text-amber-700">
                      No candidate satisfied α — best-effort shown
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-relaxed text-ink-900/50">
            Expected-cost improvement vs deterministic:{" "}
            <strong>{data.expectedImprovement.toFixed(1)}</strong> (≥ 0 by
            construction — the deterministic plan is always a candidate). The
            chance constraint is an empirical frequency over {data.scenarios}{" "}
            sampled scenarios, not a true probability. No-show probabilities
            are the heuristic from the predictor module, so the scenarios
            inherit its error.
          </p>
        </div>
      )}
    </div>
  );
}
