"use client";

import { GATE_IDS, GATE_PROFILES } from "@/lib/types";

const LANE_BADGE: Record<string, string> = {
  express: "bg-sea-700/10 text-sea-700 border-sea-700/25",
  standard: "bg-brand-500/10 text-brand-600 border-brand-500/30",
  inspection: "bg-red-600/10 text-red-700 border-red-600/25",
};

/**
 * Per-gate service model: gates are not interchangeable. The express lane
 * checks a truck in ~4 minutes, standard in ~5, inspection (grain bulk +
 * document checks) in ~8 — so per-slot capacity differs (7 / 6 / 3).
 */
export default function GateProfiles() {
  return (
    <div className="card">
      <h3 className="font-display text-lg font-semibold text-ink-950">
        Gate service model
      </h3>
      <p className="mt-1 text-sm text-ink-900/60">
        Gates are not interchangeable — service time sets how many trucks each
        gate takes per 30-minute slot.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {GATE_IDS.map((g) => {
          const p = GATE_PROFILES[g];
          return (
            <div
              key={g}
              className="rounded-2xl border border-ink-900/10 bg-paper p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-base font-bold text-ink-950">
                  {p.name}
                </p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${LANE_BADGE[p.lane]}`}
                >
                  {p.lane}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-900/55">{p.terminalName}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-900/50">
                    Service
                  </dt>
                  <dd className="tnum font-display mt-0.5 text-xl font-bold">
                    {p.serviceMin} min
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-900/50">
                    Per slot
                  </dt>
                  <dd className="tnum font-display mt-0.5 text-xl font-bold">
                    {p.capacityPerSlot} trucks
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-900/50">
        The optimizer and the queue simulation both use these rates — faster
        gates absorb more of the peak, and the inspection lane is the
        bottleneck the plan protects.
      </p>
    </div>
  );
}
