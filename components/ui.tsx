"use client";

import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Section heading                                                     */
/* ------------------------------------------------------------------ */

export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "center",
  dark = false,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  align?: "center" | "left";
  dark?: boolean;
}) {
  const alignCls = align === "center" ? "text-center mx-auto" : "text-left";
  return (
    <div className={`max-w-3xl ${alignCls}`}>
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-500">
        {eyebrow}
      </p>
      <h2
        className={`font-display text-3xl font-bold tracking-tight sm:text-4xl ${
          dark ? "text-white" : "text-ink-950"
        }`}
      >
        {title}
      </h2>
      {sub && (
        <p
          className={`mt-4 text-lg leading-relaxed ${
            dark ? "text-white/70" : "text-ink-900/65"
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat card                                                           */
/* ------------------------------------------------------------------ */

type StatTone = "good" | "bad" | "neutral";

const TONE_CLASSES: Record<StatTone, string> = {
  good: "bg-sea-700/10 text-sea-700 border-sea-700/20",
  bad: "bg-red-600/10 text-red-700 border-red-600/20",
  neutral: "bg-ink-900/5 text-ink-900/70 border-ink-900/10",
};

export function StatCard({
  label,
  value,
  sub,
  delta,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  sub?: string;
  delta?: string;
  tone?: StatTone;
}) {
  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-900/55">
        {label}
      </p>
      <p className="tnum mt-2 font-display text-3xl font-bold text-ink-950">
        {value}
      </p>
      {sub && <p className="mt-1 text-sm text-ink-900/60">{sub}</p>}
      {delta && (
        <span
          className={`mt-3 inline-block rounded-full border px-2.5 py-1 text-xs font-semibold ${TONE_CLASSES[tone]}`}
        >
          {delta}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scenario toggle                                                     */
/* ------------------------------------------------------------------ */

export function ScenarioToggle({
  value,
  onChange,
}: {
  value: "on" | "off";
  onChange: (v: "on" | "off") => void;
}) {
  const opts = [
    { v: "off" as const, label: "TAS OFF · status quo" },
    { v: "on" as const, label: "TAS ON · optimized" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Scenario"
      className="inline-flex rounded-2xl border border-ink-900/10 bg-white p-1.5 shadow-sm"
    >
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.v)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:px-6 ${
              active
                ? o.v === "on"
                  ? "bg-sea-700 text-white shadow"
                  : "bg-ink-900 text-white shadow"
                : "text-ink-900/55 hover:text-ink-900"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loading / error / empty states                                      */
/* ------------------------------------------------------------------ */

export function LoadingSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-ink-900/10 border-t-brand-500"
        role="status"
        aria-label={label}
      />
      <p className="text-sm text-ink-900/60">{label}</p>
    </div>
  );
}

export function ErrorNote({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="card border-red-600/25 bg-red-50">
      <p className="font-semibold text-red-800">Something went wrong</p>
      <p className="mt-1 text-sm text-red-700/90">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="card py-14 text-center">
      <p className="font-display text-lg font-semibold text-ink-950">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-900/60">{hint}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small layout helpers                                                */
/* ------------------------------------------------------------------ */

export function Container({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
