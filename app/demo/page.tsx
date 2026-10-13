"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ScenarioResult, WeekResult, OptimizerMethod } from "@/lib/types";
import { HORIZON_DAYS } from "@/lib/types";
import { ENSEM_BENCHMARKS, horizonDayLabel } from "@/lib/data";
import { planToCsv, downloadCsv } from "@/lib/csv";
import QueueChart from "@/components/QueueChart";
import GateChart from "@/components/GateChart";
import DemoSteps from "@/components/DemoSteps";
import BenchmarkPanel from "@/components/BenchmarkPanel";
import ReplanPanel from "@/components/ReplanPanel";
import GateProfiles from "@/components/GateProfiles";
import ExactPanel from "@/components/ExactPanel";
import StochasticPanel from "@/components/StochasticPanel";
import ParetoPanel from "@/components/ParetoPanel";
import ValidationPanel from "@/components/ValidationPanel";
import PricingPanel from "@/components/PricingPanel";
import {
  Container,
  SectionHeading,
  StatCard,
  ScenarioToggle,
  LoadingSpinner,
  ErrorNote,
} from "@/components/ui";

const TRUCKS = 400;
const SEED = 42;

export default function DemoPage() {
  const [week, setWeek] = useState<WeekResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<"on" | "off">("off");
  const [step, setStep] = useState(1);
  const [day, setDay] = useState(0);
  const [method, setMethod] = useState<OptimizerMethod>("greedy");
  const [csvState, setCsvState] = useState<"idle" | "loading" | "error">("idle");

  const load = useCallback(async () => {
    setError(null);
    setWeek(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trucks: TRUCKS, seed: SEED, days: HORIZON_DAYS, method }),
      });
      if (!res.ok) throw new Error(`Simulation API returned ${res.status}`);
      setWeek(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed.");
    }
  }, [method]);

  useEffect(() => {
    load();
  }, [load]);

  const dayResult: ScenarioResult | undefined = week?.days[day];
  const m = scenario === "on" ? dayResult?.optimized : dayResult?.baseline;
  const other = scenario === "on" ? dayResult?.baseline : dayResult?.optimized;

  const queueDelta =
    dayResult && other && m
      ? Math.round(
          ((other.maxQueueLength - m.maxQueueLength) /
            Math.max(1, other.maxQueueLength)) *
            100,
        )
      : 0;

  async function exportCsv() {
    setCsvState("loading");
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trucks: TRUCKS, seed: SEED, day, method }),
      });
      if (!res.ok) throw new Error(`Plan API returned ${res.status}`);
      const plan = await res.json();
      downloadCsv(
        `tas-casablanca-day-${day + 1}-plan.csv`,
        planToCsv(plan.assignments, plan.requests),
      );
      setCsvState("idle");
    } catch {
      setCsvState("error");
    }
  }

  return (
    <div className="py-12 sm:py-16">
      <Container>
        <SectionHeading
          align="left"
          eyebrow="Live demo"
          title="Seven operating days at the Port of Casablanca"
          sub="A discrete-event simulation of 400 trucks per day across 3 gates, over a 7-day rolling horizon. Demand is set near the congestion threshold on purpose — at 220 trucks/day the gates sit below capacity and any appointment system looks useless, which is a property of queueing, not of TAS. Pick a day, pick an optimizer, toggle the appointment system — and watch congestion respond, the same comparison the ENSEM researchers ran on real port data."
        />

        <div className="mt-8">
          <DemoSteps
            current={step}
            onStep={(i) => {
              setStep(i);
              if (i === 1) setScenario("off");
              if (i === 2) setScenario("on");
            }}
          />
        </div>

        {error && (
          <div className="mt-8">
            <ErrorNote message={error} onRetry={load} />
          </div>
        )}
        {!week && !error && <LoadingSpinner label="Simulating the 7-day horizon…" />}

        {week && dayResult && m && (
          <>
            {/* Day selector + method toggle */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <div
                role="tablist"
                aria-label="Horizon day"
                className="inline-flex flex-wrap rounded-2xl border border-ink-900/10 bg-white p-1.5 shadow-sm"
              >
                {week.days.map((d, i) => (
                  <button
                    key={i}
                    role="tab"
                    aria-selected={day === i}
                    onClick={() => setDay(i)}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold transition sm:px-4 ${
                      day === i
                        ? "bg-ink-900 text-white shadow"
                        : "text-ink-900/55 hover:text-ink-900"
                    }`}
                  >
                    Day {i + 1}
                    <span className="ml-1 hidden text-xs font-normal opacity-70 sm:inline">
                      {horizonDayLabel(i)}
                    </span>
                  </button>
                ))}
              </div>
              <div
                role="tablist"
                aria-label="Optimizer method"
                className="inline-flex rounded-2xl border border-ink-900/10 bg-white p-1.5 shadow-sm"
              >
                {(["greedy", "annealed"] as OptimizerMethod[]).map((mm) => (
                  <button
                    key={mm}
                    role="tab"
                    aria-selected={method === mm}
                    onClick={() => setMethod(mm)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize transition ${
                      method === mm
                        ? "bg-brand-500 text-white shadow"
                        : "text-ink-900/55 hover:text-ink-900"
                    }`}
                  >
                    {mm === "greedy" ? "Greedy" : "Sim. annealing"}
                  </button>
                ))}
              </div>
              <p className="text-sm text-ink-900/55">
                Deterministic · seed {SEED} · {TRUCKS} trucks/day ·{" "}
                <span className="tnum font-semibold text-ink-900">
                  {scenario === "on" ? "appointments enforced" : "walk-ins welcome"}
                </span>
              </p>
            </div>

            {/* Horizon totals */}
            <div className="card mt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
                    7-day horizon totals
                  </p>
                  <h3 className="font-display mt-1 text-xl font-semibold text-ink-950">
                    The whole week, not just one day
                  </h3>
                </div>
                <button
                  onClick={exportCsv}
                  disabled={csvState === "loading"}
                  className="rounded-xl border border-ink-900/15 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:border-ink-900/30 disabled:opacity-50"
                >
                  {csvState === "loading"
                    ? "Building CSV…"
                    : `↓ Export day ${day + 1} plan (CSV)`}
                </button>
              </div>
              {csvState === "error" && (
                <p className="mt-2 text-sm font-medium text-red-700">
                  CSV export failed — please try again.
                </p>
              )}
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-paper p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                    Trucks planned
                  </p>
                  <p className="tnum font-display mt-1 text-2xl font-bold">
                    {week.horizon.totalTrucks.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl bg-paper p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                    CO₂ saved vs status quo
                  </p>
                  <p className="tnum font-display mt-1 text-2xl font-bold">
                    {week.horizon.co2SavedTonnes.toFixed(1)} t
                  </p>
                </div>
                <div className="rounded-xl bg-paper p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                    Avg wait (week)
                  </p>
                  <p className="tnum font-display mt-1 text-2xl font-bold">
                    {week.horizon.avgWaitBaseline.toFixed(0)} →{" "}
                    {week.horizon.avgWaitOptimized.toFixed(0)} min
                  </p>
                </div>
                <div className="rounded-xl bg-paper p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                    Rescheduled (week)
                  </p>
                  <p className="tnum font-display mt-1 text-2xl font-bold">
                    {(week.horizon.rescheduleRate * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <ScenarioToggle
                value={scenario}
                onChange={(v) => {
                  setScenario(v);
                  setStep(v === "on" ? 2 : 1);
                }}
              />
              <p className="text-sm text-ink-900/55">
                Showing <strong>{horizonDayLabel(day)}</strong> · optimizer:{" "}
                <strong className="capitalize">{method}</strong>
              </p>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Peak queue"
                value={`${m.maxQueueLength} trucks`}
                sub="Longest line at the gates during the day."
                delta={
                  scenario === "on"
                    ? `−${queueDelta}% vs status quo`
                    : "Status quo — no appointments"
                }
                tone={scenario === "on" ? "good" : "bad"}
              />
              <StatCard
                label="Average wait"
                value={`${m.avgWaitMin.toFixed(0)} min`}
                sub="Mean time a truck spends queuing."
                delta={
                  dayResult
                    ? `${(
                        dayResult.baseline.avgWaitMin - dayResult.optimized.avgWaitMin
                      ).toFixed(0)} min saved per truck`
                    : undefined
                }
                tone="good"
              />
              <StatCard
                label="Reschedule rate"
                value={`${(m.rescheduleRate * 100).toFixed(1)}%`}
                sub="Bookings moved outside their preferred window."
                delta={`ENSEM benchmark: ${ENSEM_BENCHMARKS.reschedulePct}%`}
                tone="neutral"
              />
              <StatCard
                label="CO₂ from idling"
                value={`${m.co2Tonnes.toFixed(2)} t`}
                sub="Diesel burned while waiting, this simulated day."
                delta={
                  dayResult
                    ? `−${(
                        dayResult.baseline.co2Tonnes - dayResult.optimized.co2Tonnes
                      ).toFixed(2)} t vs status quo`
                    : undefined
                }
                tone="good"
              />
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <QueueChart
                  data={dayResult.baseline.queueSeries}
                  showOptimized={scenario === "on"}
                />
              </div>
              <div className="lg:col-span-2">
                <GateChart
                  baseline={dayResult.baseline.gateUtilization}
                  optimized={dayResult.optimized.gateUtilization}
                  showOptimized={scenario === "on"}
                />
              </div>
            </div>

            {/* ENSEM comparison */}
            <div className="card mt-6 border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-transparent">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
                    Benchmark check
                  </p>
                  <h3 className="font-display mt-1 text-xl font-semibold text-ink-950">
                    How the demo compares to the ENSEM results
                  </h3>
                </div>
                <Link href="/book" className="btn-primary">
                  Try booking as a carrier
                </Link>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-white/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/55">
                    Peak queue reduction
                  </p>
                  <p className="tnum font-display mt-1 text-2xl font-bold text-ink-950">
                    −{queueDelta}%
                    <span className="ml-2 text-sm font-medium text-ink-900/50">
                      vs −{ENSEM_BENCHMARKS.queueReductionPct}% (ENSEM)
                    </span>
                  </p>
                </div>
                <div className="rounded-xl bg-white/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/55">
                    Rescheduled
                  </p>
                  <p className="tnum font-display mt-1 text-2xl font-bold text-ink-950">
                    {(dayResult.optimized.rescheduleRate * 100).toFixed(1)}%
                    <span className="ml-2 text-sm font-medium text-ink-900/50">
                      vs {ENSEM_BENCHMARKS.reschedulePct}% (ENSEM)
                    </span>
                  </p>
                </div>
                <div className="rounded-xl bg-white/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/55">
                    CO₂ saved today
                  </p>
                  <p className="tnum font-display mt-1 text-2xl font-bold text-ink-950">
                    {(dayResult.baseline.co2Tonnes - dayResult.optimized.co2Tonnes).toFixed(2)} t
                    <span className="ml-2 text-sm font-medium text-ink-900/50">
                      scales toward {ENSEM_BENCHMARKS.co2SavedTonnesPerYear} t/yr
                    </span>
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-ink-900/50">
                Demo figures are simulated on synthetic demand (seed {SEED});
                ENSEM figures are the researchers&apos; reported results on
                real port data. The demo echoes their shape — it does not
                reproduce their study.
              </p>
            </div>

            <div className="mt-6">
              <BenchmarkPanel trucks={TRUCKS} seed={SEED} day={day} />
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <GateProfiles />
              </div>
              <div className="lg:col-span-2">
                <div className="card">
                  <h3 className="font-display text-lg font-semibold text-ink-950">
                    What&apos;s new in this version
                  </h3>
                  <ul className="mt-3 space-y-2 text-sm text-ink-900/70">
                    <li>
                      <strong>Research-grade methods</strong> — exact optima
                      (branch-and-bound), stochastic planning, Pareto
                      frontier, Little&apos;s Law validation, congestion
                      pricing. See below.
                    </li>
                    <li>
                      <strong>Fair comparison</strong> — both worlds now see
                      the same no-show draws (common random numbers), so the
                      TAS advantage is scheduling, not a demand artifact.
                    </li>
                    <li>
                      <strong>7-day rolling horizon</strong> — plan and
                      simulate a full week, not one day.
                    </li>
                    <li>
                      <strong>Simulated annealing</strong> — a second
                      optimizer that provably never loses to greedy.
                    </li>
                    <li>
                      <strong>Live replanning</strong> — mark trucks late or
                      no-show and re-optimize the rest of the day.
                    </li>
                    <li>
                      <strong>Per-gate service model</strong> — express,
                      standard, and inspection lanes with real rate
                      differences.
                    </li>
                    <li>
                      <strong>CSV export</strong> — download the day plan
                      for dispatchers and TOS import.
                    </li>
                  </ul>
                  <p className="mt-4 text-xs leading-relaxed text-ink-900/50">
                    See the README for algorithms, API docs, and honest
                    limitations.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <ReplanPanel trucks={TRUCKS} seed={SEED} day={day} />
            </div>

            {/* Research-grade methods */}
            <div className="mt-10">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">
                    Research-grade methods
                  </p>
                  <h2 className="font-display mt-1 text-2xl font-semibold text-ink-950">
                    Measured against truth, not against each other
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-ink-900/60">
                    Exact optima, stochastic planning, Pareto trade-offs,
                    statistical validation, and a pricing mechanism — each
                    honest about its guarantee. Full formal statement:{" "}
                    <Link href="/methodology" className="font-semibold text-brand-600 underline">
                      Methodology →
                    </Link>
                  </p>
                </div>
              </div>
              <div className="mt-6 space-y-6">
                <ExactPanel seed={SEED} day={day} />
                <StochasticPanel trucks={TRUCKS} seed={SEED} day={day} />
                <ParetoPanel trucks={TRUCKS} seed={SEED} day={day} />
                <ValidationPanel trucks={TRUCKS} seed={SEED} />
                <PricingPanel trucks={TRUCKS} seed={SEED} day={day} />
              </div>
            </div>
          </>
        )}
      </Container>
    </div>
  );
}
