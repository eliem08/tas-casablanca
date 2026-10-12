import Link from "next/link";
import { Container, SectionHeading, StatCard } from "@/components/ui";
import { PORT_FACTS, ENSEM_BENCHMARKS } from "@/lib/data";

const PILLARS = [
  {
    title: "Appointment scheduling",
    body: "Every truck gets a 30-minute window at a specific gate. The morning rush is spread across the whole operating day instead of crushing three gates at 8am.",
  },
  {
    title: "Slot optimization",
    body: "A greedy + local-search allocator packs bookings to minimize peak queue, reschedules, and waiting time — respecting each carrier's preferred window.",
  },
  {
    title: "No-show-aware overbooking",
    body: "A transparent risk model scores every booking (lead time, carrier history, night slots, cargo) so expected gaps are overbooked instead of leaving gate capacity idle.",
  },
  {
    title: "Live congestion analytics",
    body: "Queue curves, gate utilization, reschedule rate and CO₂ — computed live from a discrete-event simulation of the operating day.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Carriers book",
    body: "Trucking companies request pickup/delivery windows through a simple booking interface — company, cargo, preferred time.",
  },
  {
    n: "02",
    title: "The optimizer assigns",
    body: "Each request is placed on the least-loaded gate and slot inside its preferred window, with intelligent overbooking driven by no-show risk.",
  },
  {
    n: "03",
    title: "The port flows",
    body: "Arrivals flatten across the day. Queues shrink, gates stay balanced, and every stakeholder sees the same live picture.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* ================= HERO ================= */}
      <section className="hero-grid relative overflow-hidden text-white">
        <div className="relative">
          <Container>
            <div className="pb-20 pt-16 sm:pb-28 sm:pt-24">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-400">
                Port of Casablanca · Landside congestion demo
              </p>
              <h1 className="font-display max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
                Unclog the port with{" "}
                <span className="text-brand-400">appointments</span>, not
                concrete.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
                Casablanca handles {PORT_FACTS.tradeSharePct}% of Morocco&apos;s
                foreign trade — and its trucks were queuing{" "}
                {PORT_FACTS.maxWaitHours} hours at {PORT_FACTS.gates} gates.
                This is an interactive demonstration of the truck appointment
                system Moroccan researchers modeled on real port data:{" "}
                <strong className="text-white">
                  −{ENSEM_BENCHMARKS.queueReductionPct}% peak queue
                </strong>
                , with only {ENSEM_BENCHMARKS.reschedulePct}% of trucks moved
                against their preference.
              </p>
              <div className="mt-9 flex flex-wrap gap-4">
                <Link href="/demo" className="btn-gold">
                  Run the live demo
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <Link
                  href="/book"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
                >
                  Book a slot as a carrier
                </Link>
              </div>

              {/* crisis stat strip */}
              <dl className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 lg:grid-cols-4">
                {[
                  { k: "Throughput collapse", v: "−70%", s: "2,800 → 800 boxes/day (reported)" },
                  { k: "Max truck wait", v: "12 h", s: "at the gates, Oct 2026 (reported)" },
                  { k: "Gates in operation", v: "3", s: "hard physical constraint" },
                  { k: "Appointment system", v: "None", s: "first-come-first-served chaos" },
                ].map((s) => (
                  <div key={s.k} className="bg-ink-950/80 px-6 py-5">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-white/50">
                      {s.k}
                    </dt>
                    <dd className="tnum font-display mt-1 text-3xl font-bold text-brand-400">
                      {s.v}
                    </dd>
                    <dd className="mt-1 text-xs text-white/45">{s.s}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Container>
        </div>
      </section>

      {/* ================= PROBLEM ================= */}
      <section className="py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow="The problem"
            title="Three gates. No schedule. Twelve-hour queues."
            sub="Diverted Tanger Med traffic, record grain imports, containers squatting in the yard, slow customs — and trucks arriving whenever they please. The result is the worst landside congestion the port has seen."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            <StatCard
              label="Queue cost"
              value="12 h"
              sub="Maximum reported truck waiting time at the gates."
              delta="Paid in diesel, demurrage & missed rotations"
              tone="bad"
            />
            <StatCard
              label="Lost throughput"
              value="−70%"
              sub="From ~2,800 to ~800 containers per day (reported)."
              delta="Without adding a single gate"
              tone="bad"
            />
            <StatCard
              label="Small importers"
              value="At risk"
              sub="Demurrage and storage fines pushing small operators toward bankruptcy."
              delta="The human cost of congestion"
              tone="neutral"
            />
          </div>
        </Container>
      </section>

      {/* ================= EVIDENCE ================= */}
      <section className="bg-ink-950 py-20 text-white sm:py-28">
        <Container>
          <SectionHeading
            dark
            eyebrow="The evidence"
            title="Already proven — on this exact port"
            sub="A Moroccan research team (ENSEM Casablanca) modeled a dynamic truck appointment system on real Casablanca port data. Their reported results are the benchmark this demo is calibrated to:"
          />
          <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
            {[
              { v: "−62%", l: "Maximum queue length", s: "Peak congestion collapses when arrivals are scheduled." },
              { v: "7.8%", l: "Trucks rescheduled", s: "The optimizer respects preferred windows — carriers keep their habits." },
              { v: "785 t", l: "CO₂ saved per year", s: "Less idling in line: ~2.5 L of diesel burned per waiting hour, per truck." },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-2xl border border-white/10 bg-white/5 p-7 text-center"
              >
                <p className="tnum font-display text-5xl font-bold text-brand-400">
                  {s.v}
                </p>
                <p className="mt-3 font-semibold text-white">{s.l}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{s.s}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-white/40">
            Research figures as reported in 2026 secondary coverage of the ENSEM
            Casablanca study. Crisis figures as reported in Moroccan press and
            social coverage, October 2026. All live numbers inside the demo are
            simulated — see “Honest limitations” in the README.
          </p>
        </Container>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow="How it works"
            title="Book. Optimize. Flow."
            sub="Four components, one data flow — from a carrier's booking request to a balanced gate plan."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {PILLARS.map((p, i) => (
              <div key={p.title} className="card">
                <p className="tnum font-display text-sm font-bold text-brand-600">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="font-display mt-2 text-xl font-semibold text-ink-950">
                  {p.title}
                </h3>
                <p className="mt-2 leading-relaxed text-ink-900/65">{p.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative">
                <p className="tnum font-display text-6xl font-bold text-ink-900/10">
                  {s.n}
                </p>
                <h3 className="font-display -mt-6 text-xl font-semibold text-ink-950">
                  {s.title}
                </h3>
                <p className="mt-2 text-ink-900/65">{s.body}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ================= ROI ================= */}
      <section className="border-y border-ink-900/10 bg-white py-20 sm:py-28">
        <Container>
          <SectionHeading
            eyebrow="Why this · ROI"
            title="The business case writes itself"
            sub="No new gates. No new cranes. Just discipline — enforced by software."
          />
          <div className="mx-auto mt-12 grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Throughput recovery"
              value="+3.5×"
              sub="Path back from 800 toward 2,800 boxes/day."
              delta="Flattened arrival peaks"
              tone="good"
            />
            <StatCard
              label="Peak queue"
              value="−62%"
              sub="ENSEM benchmark on real port data."
              delta="Simulated live in the demo"
              tone="good"
            />
            <StatCard
              label="CO₂ avoided"
              value="785 t/yr"
              sub="ENSEM benchmark — the green dividend."
              delta="ESG reporting ready"
              tone="good"
            />
            <StatCard
              label="Carrier friction"
              value="7.8%"
              sub="Rescheduled against preference (ENSEM)."
              delta="Adoption without revolt"
              tone="good"
            />
          </div>
          <div className="mt-12 text-center">
            <Link href="/demo" className="btn-primary">
              See the numbers move — open the demo
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </Container>
      </section>

      {/* ================= CTA ================= */}
      <section className="py-20 sm:py-24">
        <Container>
          <div className="hero-grid relative overflow-hidden rounded-3xl px-8 py-14 text-center text-white sm:px-16">
            <div className="relative">
              <h2 className="font-display mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
                The algorithm was never the blocker. Deployment is.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-white/65">
                Try the booking flow as a trucking company, then watch the
                whole port breathe on the operations dashboard.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <Link href="/book" className="btn-gold">
                  Book a slot
                </Link>
                <Link
                  href="/demo"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5"
                >
                  Operations dashboard
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
