"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BookingRequest,
  SlotAssignment,
  OptimizerMethod,
} from "@/lib/types";
import { minutesToHHMM, HORIZON_DAYS } from "@/lib/types";
import { horizonDayLabel } from "@/lib/data";
import { ErrorNote, LoadingSpinner } from "./ui";

interface PlanData {
  day: number;
  method: OptimizerMethod;
  requests: BookingRequest[];
  assignments: SlotAssignment[];
  summary: {
    total: number;
    rescheduled: number;
    rescheduleRate: number;
    optimizerCost: number;
    avgWaitMin: number;
    maxSlotLoad: number;
  };
}

interface DisruptionDraft {
  requestId: string;
  kind: "no-show" | "late";
  lateByMin: number;
}

interface MovedTruck {
  requestId: string;
  fromGate: number;
  fromSlotStart: number;
  toGate: number;
  toSlotStart: number;
}

interface ReplanData {
  after: SlotAssignment[];
  before: SlotAssignment[];
  moved: MovedTruck[];
  removedNoShows: string[];
  lateReplaced: string[];
  frozen: SlotAssignment[];
  beforeScore: { cost: number; avgWait: number; rescheduled: number; maxLoad: number };
  afterScore: { cost: number; avgWait: number; rescheduled: number; maxLoad: number };
}

const LATE_OPTIONS = [30, 60, 120];

/**
 * Live replanning: the day is running, reality diverges. Mark trucks late
 * or no-show, re-optimize the rest of the day, and see exactly what moved.
 * Confirmed slots (before "now") are frozen and never touched.
 */
export default function ReplanPanel({
  trucks,
  seed,
  day,
}: {
  trucks: number;
  seed: number;
  day: number;
}) {
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  const [nowMin, setNowMin] = useState(600); // 10:00
  const [selectedId, setSelectedId] = useState<string>("");
  const [kind, setKind] = useState<"no-show" | "late">("late");
  const [lateBy, setLateBy] = useState(60);
  const [disruptions, setDisruptions] = useState<DisruptionDraft[]>([]);
  const [result, setResult] = useState<ReplanData | null>(null);
  const [replanError, setReplanError] = useState<string | null>(null);
  const [replanLoading, setReplanLoading] = useState(false);

  const loadPlan = useCallback(async () => {
    setPlanError(null);
    setPlanLoading(true);
    setResult(null);
    setDisruptions([]);
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trucks, seed, day, method: "greedy" }),
      });
      if (!res.ok) throw new Error(`Plan API returned ${res.status}`);
      setPlan(await res.json());
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Plan failed.");
    } finally {
      setPlanLoading(false);
    }
  }, [trucks, seed, day]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const reqById = useMemo(
    () => new Map((plan?.requests ?? []).map((r) => [r.id, r])),
    [plan],
  );

  // Disruptable trucks: unserved at "now", not already disrupted.
  const candidates = useMemo(() => {
    if (!plan) return [];
    const disrupted = new Set(disruptions.map((d) => d.requestId));
    return plan.assignments
      .filter((a) => a.slotStart >= nowMin && !disrupted.has(a.requestId))
      .sort((a, b) => a.slotStart - b.slotStart || a.gate - b.gate);
  }, [plan, nowMin, disruptions]);

  const frozenCount = useMemo(
    () => (plan?.assignments ?? []).filter((a) => a.slotStart < nowMin).length,
    [plan, nowMin],
  );

  function addDisruption() {
    if (!selectedId) return;
    setDisruptions((prev) => [
      ...prev,
      { requestId: selectedId, kind, lateByMin: kind === "late" ? lateBy : 0 },
    ]);
    setSelectedId("");
    setResult(null);
  }

  async function runReplan() {
    if (!plan || disruptions.length === 0) return;
    setReplanError(null);
    setReplanLoading(true);
    try {
      const res = await fetch("/api/replan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: plan.requests,
          assignments: plan.assignments,
          disruptions: disruptions.map((d) => ({
            requestId: d.requestId,
            kind: d.kind,
            lateByMin: d.lateByMin,
          })),
          nowMin,
          method: "greedy",
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || `Replan API returned ${res.status}`);
      }
      setResult(await res.json());
    } catch (e) {
      setReplanError(e instanceof Error ? e.message : "Replanning failed.");
    } finally {
      setReplanLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-ink-950">
            Live replanning — {horizonDayLabel(day)}
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-900/60">
            The day is running and reality diverges: mark a truck late or
            no-show and re-optimize the rest of the day. Confirmed slots
            (before “now”) are frozen and never moved.
          </p>
        </div>
        <button
          onClick={loadPlan}
          disabled={planLoading}
          className="rounded-xl border border-ink-900/15 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:border-ink-900/30 disabled:opacity-50"
        >
          {planLoading ? "Loading…" : "Reset plan"}
        </button>
      </div>

      {planError && (
        <div className="mt-4">
          <ErrorNote message={planError} onRetry={loadPlan} />
        </div>
      )}
      {planLoading && !plan && <LoadingSpinner label="Building the day plan…" />}

      {plan && (
        <>
          {/* controls */}
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="now">
                  Current time (“now”) ·{" "}
                  <span className="tnum">{minutesToHHMM(nowMin)}</span> —{" "}
                  {frozenCount} slot{frozenCount === 1 ? "" : "s"} already
                  confirmed & frozen
                </label>
                <input
                  id="now"
                  type="range"
                  min={360}
                  max={1320}
                  step={30}
                  value={nowMin}
                  onChange={(e) => {
                    setNowMin(Number(e.target.value));
                    setResult(null);
                  }}
                  className="w-full accent-amber-500"
                />
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1">
                  <label className="label" htmlFor="truck">
                    Truck to disrupt
                  </label>
                  <select
                    id="truck"
                    className="input"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                  >
                    <option value="">— pick a truck —</option>
                    {candidates.slice(0, 60).map((a) => {
                      const req = reqById.get(a.requestId);
                      return (
                        <option key={a.requestId} value={a.requestId}>
                          {minutesToHHMM(a.slotStart)} · Gate {a.gate + 1} ·{" "}
                          {req?.company ?? a.requestId} · {req?.truckPlate ?? ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="flex gap-2">
                  {(["late", "no-show"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={`rounded-xl border px-4 py-2.5 text-sm font-semibold capitalize transition ${
                        kind === k
                          ? "border-ink-900 bg-ink-900 text-white"
                          : "border-ink-900/15 bg-white text-ink-900/60 hover:border-ink-900/30"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                {kind === "late" && (
                  <div className="flex gap-2">
                    {LATE_OPTIONS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setLateBy(m)}
                        className={`tnum rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                          lateBy === m
                            ? "border-brand-500 bg-brand-500/10 text-brand-600"
                            : "border-ink-900/15 text-ink-900/60 hover:border-ink-900/30"
                        }`}
                      >
                        +{m} min
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={addDisruption}
                  disabled={!selectedId}
                  className="rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-900/90 disabled:opacity-50"
                >
                  Add disruption
                </button>
              </div>

              {disruptions.length > 0 && (
                <ul className="space-y-2">
                  {disruptions.map((d) => {
                    const req = reqById.get(d.requestId);
                    return (
                      <li
                        key={d.requestId}
                        className="flex items-center justify-between gap-3 rounded-xl border border-ink-900/10 bg-paper px-4 py-2.5 text-sm"
                      >
                        <span>
                          <strong>{req?.company ?? d.requestId}</strong> ·{" "}
                          {req?.truckPlate ?? ""} —{" "}
                          {d.kind === "late"
                            ? `late +${d.lateByMin} min`
                            : "no-show"}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDisruptions((prev) =>
                              prev.filter((x) => x.requestId !== d.requestId),
                            )
                          }
                          className="text-xs font-semibold text-red-700 hover:underline"
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex flex-col justify-end">
              <button
                type="button"
                onClick={runReplan}
                disabled={disruptions.length === 0 || replanLoading}
                className="btn-gold whitespace-nowrap"
              >
                {replanLoading
                  ? "Re-optimizing…"
                  : `Re-optimize rest of day (${disruptions.length})`}
              </button>
            </div>
          </div>

          {replanError && (
            <div className="mt-4">
              <ErrorNote message={replanError} onRetry={runReplan} />
            </div>
          )}

          {result && (
            <div className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-paper p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                    Optimizer cost
                  </p>
                  <p className="tnum font-display mt-1 text-2xl font-bold">
                    {result.beforeScore.cost.toFixed(1)} →{" "}
                    {result.afterScore.cost.toFixed(1)}
                  </p>
                  <p className="mt-1 text-xs text-sea-700">
                    {result.afterScore.cost <= result.beforeScore.cost
                      ? "New plan is at least as good"
                      : "New plan trades cost for feasibility"}
                  </p>
                </div>
                <div className="rounded-xl bg-paper p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                    Trucks moved
                  </p>
                  <p className="tnum font-display mt-1 text-2xl font-bold">
                    {result.moved.length}
                  </p>
                  <p className="mt-1 text-xs text-ink-900/55">
                    {result.frozen.length} confirmed slots untouched
                  </p>
                </div>
                <div className="rounded-xl bg-paper p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                    Avg wait / truck
                  </p>
                  <p className="tnum font-display mt-1 text-2xl font-bold">
                    {result.beforeScore.avgWait.toFixed(1)} →{" "}
                    {result.afterScore.avgWait.toFixed(1)} min
                  </p>
                  <p className="mt-1 text-xs text-ink-900/55">
                    Assignment-model estimate
                  </p>
                </div>
                <div className="rounded-xl bg-paper p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
                    No-shows dropped
                  </p>
                  <p className="tnum font-display mt-1 text-2xl font-bold">
                    {result.removedNoShows.length}
                  </p>
                  <p className="mt-1 text-xs text-ink-900/55">
                    {result.lateReplaced.length} late truck
                    {result.lateReplaced.length === 1 ? "" : "s"} re-placed
                  </p>
                </div>
              </div>

              {result.moved.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-ink-900/10 text-xs uppercase tracking-wider text-ink-900/50">
                        <th className="py-2 pr-3 font-semibold">Truck</th>
                        <th className="py-2 pr-3 font-semibold">From</th>
                        <th className="py-2 font-semibold">To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.moved.slice(0, 20).map((m) => {
                        const req = reqById.get(m.requestId);
                        return (
                          <tr key={m.requestId} className="border-b border-ink-900/5">
                            <td className="py-2 pr-3">
                              {req?.company ?? m.requestId} · {req?.truckPlate ?? ""}
                            </td>
                            <td className="tnum py-2 pr-3">
                              {minutesToHHMM(m.fromSlotStart)} · Gate {m.fromGate + 1}
                            </td>
                            <td className="tnum py-2">
                              {minutesToHHMM(m.toSlotStart)} · Gate {m.toGate + 1}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {result.moved.length > 20 && (
                    <p className="mt-2 text-xs text-ink-900/50">
                      Showing 20 of {result.moved.length} moved trucks.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-900/60">
                  No trucks needed to move — the freed slots absorbed the
                  disruption without touching anyone else&apos;s plan.
                </p>
              )}
            </div>
          )}
        </>
      )}
      <p className="mt-4 text-xs leading-relaxed text-ink-900/50">
        Horizon: {HORIZON_DAYS} days. Late trucks are re-inserted with a
        window starting at max(now, old slot + delay) — never in the past.
        No-shows free their slot for the re-optimization.
      </p>
    </div>
  );
}
