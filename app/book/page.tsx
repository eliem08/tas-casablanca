"use client";

import { useState } from "react";
import Link from "next/link";
import type { BookingRequest, SlotAssignment } from "@/lib/types";
import { minutesToHHMM } from "@/lib/types";
import { TERMINAL_BY_GATE, horizonDayLabel } from "@/lib/data";
import { riskBand } from "@/lib/predictor";
import BookingForm from "@/components/BookingForm";
import { Container, SectionHeading } from "@/components/ui";

const BAND_STYLE: Record<string, string> = {
  low: "bg-sea-700/10 text-sea-700 border-sea-700/25",
  medium: "bg-brand-500/15 text-brand-600 border-brand-500/30",
  high: "bg-red-600/10 text-red-700 border-red-600/25",
};

function ResultPanel({
  req,
  assignment,
  onReset,
}: {
  req: BookingRequest;
  assignment: SlotAssignment;
  onReset: () => void;
}) {
  const band = riskBand(assignment.noShowProbability);
  const terminal = TERMINAL_BY_GATE[assignment.gate];
  const day = assignment.day ?? req.day ?? 0;
  return (
    <div className="card border-sea-700/30">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sea-700">
            Slot confirmed · Day {day + 1} — {horizonDayLabel(day)}
          </p>
          <h3 className="font-display mt-1 text-2xl font-bold text-ink-950">
            {minutesToHHMM(assignment.slotStart)} · {terminal.name}
          </h3>
          <p className="mt-1 text-sm text-ink-900/60">
            {req.company} · {req.truckPlate} · {req.containers} container
            {req.containers > 1 ? "s" : ""} · {req.move}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${BAND_STYLE[band]}`}
        >
          {band} risk
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-paper p-4">
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
            Gate
          </dt>
          <dd className="tnum font-display mt-1 text-xl font-bold">
            Gate {assignment.gate + 1}
          </dd>
        </div>
        <div className="rounded-xl bg-paper p-4">
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
            Slot
          </dt>
          <dd className="tnum font-display mt-1 text-xl font-bold">
            {minutesToHHMM(assignment.slotStart)}
          </dd>
        </div>
        <div className="rounded-xl bg-paper p-4">
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
            No-show risk
          </dt>
          <dd className="tnum font-display mt-1 text-xl font-bold">
            {(assignment.noShowProbability * 100).toFixed(1)}%
          </dd>
        </div>
        <div className="rounded-xl bg-paper p-4">
          <dt className="text-xs font-semibold uppercase tracking-wider text-ink-900/50">
            Est. wait
          </dt>
          <dd className="tnum font-display mt-1 text-xl font-bold">
            {assignment.waitEstimateMin.toFixed(0)} min
          </dd>
        </div>
      </dl>

      {assignment.rescheduled ? (
        <p className="mt-4 rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 text-sm text-ink-900/75">
          <strong>Rescheduled:</strong> your preferred window (
          {minutesToHHMM(req.preferredStart)}–{minutesToHHMM(req.preferredEnd)})
          was full, so the optimizer placed you at the nearest slot with
          capacity. This is how the system protects the peak instead of
          stacking everyone at 08:00.
        </p>
      ) : (
        <p className="mt-4 rounded-xl border border-sea-700/25 bg-sea-700/5 p-4 text-sm text-ink-900/75">
          <strong>Inside your window:</strong> placed at{" "}
          {minutesToHHMM(assignment.slotStart)} as requested — no reschedule
          needed.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={onReset} className="btn-primary">
          Book another truck
        </button>
        <Link href="/demo" className="btn-gold">
          See it in the day simulation
        </Link>
      </div>
    </div>
  );
}

export default function BookPage() {
  const [result, setResult] = useState<{
    req: BookingRequest;
    assignment: SlotAssignment;
  } | null>(null);

  return (
    <div className="py-12 sm:py-16">
      <Container>
        <SectionHeading
          align="left"
          eyebrow="Carrier booking"
          title="Request your gate slot"
          sub="Pick a day in the 7-day horizon and a terminal. The optimizer assigns the least-loaded gate and slot inside your window — and scores the no-show risk that drives intelligent overbooking."
        />
        <div className="mx-auto mt-10 max-w-3xl">
          {result ? (
            <ResultPanel
              req={result.req}
              assignment={result.assignment}
              onReset={() => setResult(null)}
            />
          ) : (
            <BookingForm
              onBooked={(req, assignment) => setResult({ req, assignment })}
            />
          )}
        </div>
      </Container>
    </div>
  );
}
