"use client";

import { useMemo, useState } from "react";
import type {
  BookingRequest,
  SlotAssignment,
  CargoType,
  MoveType,
  TerminalId,
} from "@/lib/types";
import { HORIZON_DAYS } from "@/lib/types";
import {
  TRUCKING_COMPANIES,
  CARGO_META,
  CARGO_TYPES,
  TERMINALS,
  horizonDayLabel,
  makeRng,
  randomPlate,
} from "@/lib/data";
import {
  noShowProbability,
  riskBand,
  explainProbability,
} from "@/lib/predictor";
import { minutesToHHMM } from "@/lib/types";
import { ErrorNote } from "./ui";

const RISK_STYLE: Record<string, string> = {
  low: "bg-sea-700",
  medium: "bg-brand-500",
  high: "bg-red-600",
};
const RISK_TEXT: Record<string, string> = {
  low: "text-sea-700",
  medium: "text-brand-600",
  high: "text-red-700",
};

function hhmmToMin(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

export default function BookingForm({
  onBooked,
}: {
  onBooked: (req: BookingRequest, assignment: SlotAssignment) => void;
}) {
  const [company, setCompany] = useState(TRUCKING_COMPANIES[0]);
  const [plate, setPlate] = useState(() => randomPlate(makeRng(Date.now() % 100000)));
  const [cargo, setCargo] = useState<CargoType>("general");
  const [move, setMove] = useState<MoveType>("import");
  const [containers, setContainers] = useState<1 | 2>(1);
  const [day, setDay] = useState(0);
  const [terminal, setTerminal] = useState<TerminalId | "any">("any");
  const [winStart, setWinStart] = useState("08:00");
  const [winEnd, setWinEnd] = useState("10:00");
  const [leadTime, setLeadTime] = useState(24);
  const [history, setHistory] = useState(0.05);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const risk = useMemo(() => {
    const f = {
      leadTimeHours: leadTime,
      driverNoShowRate: history,
      slotStartMin: hhmmToMin(winStart),
      cargo,
    };
    const p = noShowProbability(f);
    return { p, band: riskBand(p), reasons: explainProbability(f) };
  }, [leadTime, history, winStart, cargo]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const ps = hhmmToMin(winStart);
    const pe = hhmmToMin(winEnd);
    if (!(ps < pe)) {
      setFormError("Preferred window end must be after its start.");
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      const req: BookingRequest = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `req-${Date.now()}`,
        company,
        truckPlate: plate || "—",
        cargo,
        move,
        containers,
        preferredStart: ps,
        preferredEnd: pe,
        leadTimeHours: leadTime,
        driverNoShowRate: history,
        createdAt: Date.now(),
        day,
        terminal,
      };
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [req] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Optimizer returned ${res.status}`);
      }
      const body = await res.json();
      const assignment = body.assignments?.[0];
      if (!assignment) throw new Error("No assignment returned.");
      onBooked(req, assignment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-5">
      {/* Day + terminal: the rolling-horizon booking surface */}
      <div>
        <span className="label">Operating day (7-day horizon)</span>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: HORIZON_DAYS }, (_, d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                day === d
                  ? "border-ink-900 bg-ink-900 text-white"
                  : "border-ink-900/15 bg-white text-ink-900/60 hover:border-ink-900/30"
              }`}
            >
              Day {d + 1}
              <span className="ml-1 text-xs font-normal opacity-70">
                {horizonDayLabel(d)}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="terminal">Terminal</label>
          <select
            id="terminal"
            className="input"
            value={terminal}
            onChange={(e) => setTerminal(e.target.value as TerminalId | "any")}
          >
            <option value="any">Any terminal (optimizer picks)</option>
            {TERMINALS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} · {t.name} (Gate {t.gate + 1})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="company">Trucking company</label>
          <select
            id="company"
            className="input"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          >
            {TRUCKING_COMPANIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="plate">Truck plate</label>
          <input
            id="plate"
            className="input tnum"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="48213 - A - 6"
          />
        </div>
        <div>
          <label className="label" htmlFor="cargo">Cargo</label>
          <select
            id="cargo"
            className="input"
            value={cargo}
            onChange={(e) => setCargo(e.target.value as CargoType)}
          >
            {CARGO_TYPES.map((c) => (
              <option key={c} value={c}>
                {CARGO_META[c].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">Direction</span>
          <div className="grid grid-cols-2 gap-2">
            {(["import", "export"] as MoveType[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMove(m)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-semibold capitalize transition ${
                  move === m
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-900/15 bg-white text-ink-900/60 hover:border-ink-900/30"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">Containers</span>
          <div className="flex items-center gap-3">
            {[1, 2].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setContainers(n as 1 | 2)}
                className={`tnum h-11 w-11 rounded-xl border text-sm font-bold transition ${
                  containers === n
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-ink-900/15 text-ink-900/60 hover:border-ink-900/30"
                }`}
              >
                {n}
              </button>
            ))}
            <span className="text-xs text-ink-900/50">TEU per truck</span>
          </div>
        </div>
        <div>
          <span className="label">Preferred window</span>
          <div className="flex items-center gap-2">
            <input
              type="time"
              className="input tnum"
              value={winStart}
              onChange={(e) => setWinStart(e.target.value)}
            />
            <span className="text-ink-900/40">→</span>
            <input
              type="time"
              className="input tnum"
              value={winEnd}
              onChange={(e) => setWinEnd(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="lead">
            Booking lead time · <span className="tnum">{leadTime} h</span>
          </label>
          <input
            id="lead"
            type="range"
            min={1}
            max={72}
            value={leadTime}
            onChange={(e) => setLeadTime(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
        </div>
        <div>
          <label className="label" htmlFor="hist">
            Carrier no-show history ·{" "}
            <span className="tnum">{Math.round(history * 100)}%</span>
          </label>
          <input
            id="hist"
            type="range"
            min={0}
            max={0.35}
            step={0.01}
            value={history}
            onChange={(e) => setHistory(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
        </div>
      </div>

      {/* live risk preview */}
      <div className="rounded-2xl border border-ink-900/10 bg-paper p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/55">
            No-show risk preview
          </p>
          <p className={`tnum text-sm font-bold uppercase ${RISK_TEXT[risk.band]}`}>
            {risk.band} · {(risk.p * 100).toFixed(1)}%
          </p>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink-900/10">
          <div
            className={`h-full rounded-full transition-all ${RISK_STYLE[risk.band]}`}
            style={{ width: `${Math.min(100, risk.p * 100)}%` }}
          />
        </div>
        <ul className="mt-3 space-y-1">
          {risk.reasons.map((r) => (
            <li key={r} className="text-xs text-ink-900/60">
              · {r}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-900/40">
          Heuristic estimate, not a trained model — see the README for the
          honest methodology note.
        </p>
      </div>

      {formError && <p className="text-sm font-medium text-red-700">{formError}</p>}
      {error && <ErrorNote message={error} onRetry={() => setError(null)} />}

      <button type="submit" disabled={loading} className="btn-gold w-full">
        {loading ? "Optimizing slot…" : "Request optimized slot"}
      </button>
      <p className="text-center text-[11px] text-ink-900/40">
        Assignment target: {minutesToHHMM(hhmmToMin(winStart))} –{" "}
        {minutesToHHMM(hhmmToMin(winEnd))} · Gate chosen by the optimizer
      </p>
    </form>
  );
}
