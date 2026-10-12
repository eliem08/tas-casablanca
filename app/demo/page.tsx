"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ScenarioResult } from "@/lib/types";
import { ENSEM_BENCHMARKS } from "@/lib/data";
import QueueChart from "@/components/QueueChart";
import GateChart from "@/components/GateChart";
import DemoSteps from "@/components/DemoSteps";
import {
  Container,
  SectionHeading,
  StatCard,
  ScenarioToggle,
  LoadingSpinner,
  ErrorNote,
} from "@/components/ui";

export default function DemoPage() {
  const [data, setData] = useState<ScenarioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<"on" | "off">("off");
  const [step, setStep] = useState(1);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trucks: 220, seed: 42 }),
      });
      if (!res.ok) throw new Error(`Simulation API returned ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load ]);

  const m = scenario === "on" ? data?.optimized : data?.baseline;
  const other = scenario === "on" ? data?.baseline : data?.optimized;

  const queueDelta =
    data && other && m
      ? Math.round(
          ((other.maxQueueLength - m.maxQueueLength) /
            Math.max(1, other.maxQueueLength)) *
            100,
        )
      : 0;

  return (
    <div className="py-12 sm:py-16">
      <Container>
        <SectionHeading
          align="left"
          eyebrow="Live demo"
          title="One operating day at the Port of Casablanca"
          sub="A discrete-event simulation of 220 trucks across 3 gates. Toggle the appointment system and watch congestion respond — the same comparison the ENSEM researchers ran on real port data."
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
        {!data && !error && <LoadingSpinner label="Simulating the operating day…" />}

        {data && m && (
          <>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
              <ScenarioToggle
                value={scenario}
                onChange={(v) => {
                  setScenario(v);
                  setStep(v === "on" ? 2 : 1);
                }}
              />
              <p className="text-sm text-ink-900/55">
                Deterministic scenario · seed 42 · 220 trucks ·{" "}
                <span className="tnum font-semibold text-ink-900">
                  {scenario === "on" ? "appointments enforced" : "walk-ins welcome"}
                </span>
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
                  data
                    ? `${(
                        data.baseline.avgWaitMin - data.optimized.avgWaitMin
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
                  data
                    ? `−${(
                        data.baseline.co2Tonnes - data.optimized.co2Tonnes
                      ).toFixed(2)} t vs status quo`
                    : undefined
                }
                tone="good"
              />
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <QueueChart
                  data={data.baseline.queueSeries}
                  showOptimized={scenario === "on"}
                />
              </div>
              <div className="lg:col-span-2">
                <GateChart
                  baseline={data.baseline.gateUtilization}
                  optimized={data.optimized.gateUtilization}
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
                    {(data.optimized.rescheduleRate * 100).toFixed(1)}%
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
                    {(data.baseline.co2Tonnes - data.optimized.co2Tonnes).toFixed(2)} t
                    <span className="ml-2 text-sm font-medium text-ink-900/50">
                      scales toward {ENSEM_BENCHMARKS.co2SavedTonnesPerYear} t/yr
                    </span>
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs leading-relaxed text-ink-900/50">
                Demo figures are simulated on synthetic demand (seed 42); ENSEM
                figures are the researchers&apos; reported results on real port
                data. The demo echoes their shape — it does not reproduce their
                study.
              </p>
            </div>
          </>
        )}
      </Container>
    </div>
  );
}
