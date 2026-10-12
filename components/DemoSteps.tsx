"use client";

const STEPS = [
  {
    title: "The crisis",
    body: "October 2026: throughput collapsed 70%, trucks queue up to 12 hours at 3 gates.",
  },
  {
    title: "TAS off",
    body: "Status quo — first-come-first-served. Watch the red queue spike at midday.",
  },
  {
    title: "TAS on",
    body: "Optimized appointments flatten the peak and balance all three gates.",
  },
  {
    title: "Book a slot",
    body: "Try it as a trucking company — gate, slot and no-show risk in one click.",
  },
];

export default function DemoSteps({
  current,
  onStep,
}: {
  current: number;
  onStep: (i: number) => void;
}) {
  return (
    <div className="card">
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => {
          const active = i === current;
          const done = i < current;
          return (
            <button
              key={s.title}
              onClick={() => onStep(i)}
              className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                active
                  ? "border-brand-500 bg-brand-500/10 text-ink-950"
                  : done
                    ? "border-sea-700/30 bg-sea-700/5 text-ink-900/70 hover:border-sea-700/50"
                    : "border-ink-900/10 text-ink-900/50 hover:border-ink-900/25 hover:text-ink-900"
              }`}
            >
              <span
                className={`tnum flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  active
                    ? "bg-brand-500 text-ink-950"
                    : done
                      ? "bg-sea-700 text-white"
                      : "bg-ink-900/10 text-ink-900/60"
                }`}
              >
                {done ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3}>
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              {s.title}
            </button>
          );
        })}
      </div>
      <p className="mt-4 border-t border-ink-900/10 pt-4 text-sm leading-relaxed text-ink-900/65">
        <strong className="text-ink-950">
          Step {current + 1} — {STEPS[current].title}:
        </strong>{" "}
        {STEPS[current].body}
      </p>
    </div>
  );
}
