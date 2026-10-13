# TAS Casablanca — Truck Appointment System for the Port of Casablanca

[![Next.js 14](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-vitest-green)](#testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](#license)

An interactive, deployment-ready demo of a **Truck Appointment System (TAS)** for the Port of Casablanca — the lever Moroccan press coverage and local research both point to as the #1 fix for the port's landside congestion crisis.

**Live demo:** https://tas-casablanca-eliem08s-projects.vercel.app

---

## The problem

The Port of Casablanca handles roughly **65% of Morocco's foreign trade**. In October 2026 it entered what port watchers called its worst landside congestion crisis on record:

| Indicator | Before | Crisis (Oct 2026) |
|---|---|---|
| Daily throughput | ~2,800 containers/day | ~800 containers/day (−70%) |
| Truck waiting time | normal | up to **12 hours** |
| Gates in operation | 3 | 3 (hard constraint) |
| Truck scheduling | chaotic, first-come-first-served | **no appointment system** |

Reported causes: traffic diverted from Tanger Med, record grain imports, importers leaving containers in the port ("squatting"), slow customs clearance, and total truck-arrival chaos with no slot discipline. Demurrage and storage fines pushed small importers toward bankruptcy.

> **Honesty note:** the crisis figures above come from Moroccan press and social-media coverage of October 2026, not from an audited port dataset. They are presented here as *reported* figures to motivate the demo.

## The evidence this demo is built on

A Moroccan research team (ENSEM Casablanca) modeled a **dynamic truck appointment system on real Casablanca port data** and reported:

- **−62%** maximum queue length
- **7.8%** of trucks rescheduled against their preferred time
- **−785 tonnes/year** of CO₂

> These are the researchers' reported results, summarized from secondary coverage. This repo does not re-implement their paper; it demonstrates the same *class* of system — slot optimization + no-show-aware overbooking — on simulated data.

## Methodology — the formal problem

The full formal statement (sets, parameters, decision variables, objective, constraints, complexity, honest mapping) lives in [`lib/formulation.ts`](lib/formulation.ts) and is rendered at **`/methodology`** in the app, so the docs cannot drift from the code.

**Problem class:** a Truck Appointment System (TAS) slot-allocation problem — single-day, multi-gate, time-slotted assignment with preferred windows, per-gate service rates, and no-show uncertainty.

**Objective (deterministic core):**

```
min  10·peakSlotLoad + 3·rescheduled + 2·terminalMismatches + 0.5·totalWait
```

where total wait uses the closed form of the in-slot queue: with L trucks sharing a slot at service time τ, modelled waits are 0, τ/2, …, (L−1)·τ/2, summing to L·(L−1)·τ/2. CO₂ is a derived KPI (idle fuel × emission factor), *not* an objective term — because it is a linear function of wait, waiting-vs-CO₂ is a degenerate pair, so the Pareto panel trades waiting against reschedules, the two genuinely conflicting objectives.

**Method ladder — what each algorithm guarantees:**

| Method | Guarantee | Complexity |
|---|---|---|
| Greedy + local search | Feasible; no optimality guarantee | O(n·G·S + 250 moves) |
| Simulated annealing | Never worse than greedy (best-seen kept); no optimality guarantee | O(2,500 moves) |
| Branch-and-bound (exact) | **PROVES optimality** for n ≤ 12, or reports "not proven" on node-budget exhaustion | Worst case O((G·S)ⁿ), pruned by a valid lower bound |
| Stochastic SAA + chance constraint | Exact evaluation over sampled scenarios; candidate-set search is heuristic | O(candidates × scenarios × n) |
| Pareto frontier (weight sweep) | Returned points mutually non-dominated; SA-refined, not proven Pareto-optimal | O(|Λ| × SA), |Λ| = 11 |
| Batch-means CI + Little's Law | Statistical consistency check on simulator bookkeeping; not a physics validation | O(steps) instrumentation |
| Congestion pricing (mechanism) | Illustrative demand-shaping mechanism; no equilibrium claim | O(n·slots) + one re-optimization |

**Literature — every citation verified to exist (journal, volume, pages, DOI):**

- Huynh, N.; Walton, C.M. (2008). Robust scheduling of truck arrivals at marine container terminals. *J. Transp. Eng.* 134(8), 347–353. DOI: [10.1061/(ASCE)0733-947X(2008)134:8(347)](https://doi.org/10.1061/(ASCE)0733-947X(2008)134:8(347))
- Phan, M.-H.; Kim, K.H. (2015). Negotiating truck arrival times among trucking companies and a container terminal. *Transp. Res. Part E* 75, 132–144. DOI: [10.1016/j.tre.2015.01.004](https://doi.org/10.1016/j.tre.2015.01.004)
- Zehendner, E.; Feillet, D. (2014). Benefits of a truck appointment system on the service quality of inland transport modes at a multimodal container terminal. *Eur. J. Oper. Res.* 235(2), 461–469. [Source](https://econpapers.repec.org/RePEc:eee:ejores:v:235:y:2014:i:2:p:461-469)
- Chen, G.; Govindan, K.; Golias, M.M. (2013). Reducing truck emissions at container terminals: An emission-based bi-objective model for optimizing truck arrival pattern. *Transp. Res. Part E* 55, 3–22. DOI: [10.1016/j.tre.2013.03.008](https://doi.org/10.1016/j.tre.2013.03.008)
- Chen, G.; Govindan, K.; Yang, Z. (2013). Managing truck arrivals with time windows to alleviate gate congestion at container terminals. *Int. J. Prod. Econ.* 141, 179–188. DOI: [10.1016/j.ijpe.2012.03.033](https://doi.org/10.1016/j.ijpe.2012.03.033)
- Giuliano, G.; O'Brien, T. (2007). Reducing port-related truck emissions: The terminal gate appointment system at the Ports of Los Angeles and Long Beach. *Transp. Res. Part D* 12, 460–473.
- Abdelmagid, A.M.; Gheith, M.S.; Eltawil, A.B. (2022). A comprehensive review of the truck appointment scheduling models and directions for future research. *Transport Reviews* 42, 102–126.

**Two honest corrections made during the professor-level review (2026-10-13):**

1. **Paired comparison (common random numbers).** The simulation previously filtered no-shows in the TAS world but not in the baseline world — so the TAS-vs-baseline gap was confounded by different realized demand (~91 arrivals vs ~246). Both worlds now share one no-show draw per truck; the comparison isolates the *scheduling* effect. The baseline still gets its unannounced walk-in surge (TAS eliminates walk-ins — that asymmetry is the point).
2. **Predictor recalibration.** The old coefficients implied a 40–60% no-show rate, contradicting the file's own documented ~10% base rate and real TAS experience. Recalibrated to a typical p ≈ 0.08–0.16 (intercept −3.2, lead coefficient +0.012; direction preserved: longer lead → higher risk). The explanation strings were also fixed to match the formula (they previously said the opposite).
3. **Demo demand 220 → 400 trucks/day.** At 220/day the gates sit below capacity and any appointment system looks useless — a property of queueing, not of TAS. 400/day puts the system near the congestion threshold, so the demo shows a real effect (baseline 77-truck peak queue, ~97-min waits; TAS cuts both by >90% on the reference day). The real port moves 800–2,800 containers/day, so 400 trucks/day remains conservative.

## What this app does

- **Slot booking** (`/book`) — trucking companies pick a day in the 7-day rolling horizon and a terminal, then request pickup/delivery windows; the optimizer assigns a gate + 30-minute slot, predicts no-show risk, and flags reschedules.
- **Optimization engine** (`lib/optimizer.ts`) — greedy assignment plus local-search improvement, **upgraded with simulated annealing** (`lib/annealer.ts`) that provably never loses to greedy on the shared cost function. A first-come-first-served baseline is computed for comparison.
- **Exact solver** (`lib/exact.ts`) — branch-and-bound that **proves** the optimum for n ≤ 12 trucks, with a node budget and honest "not proven" reporting. The demo's Exact panel measures greedy and annealing against proven optima (optimality gaps), not against each other.
- **Stochastic planning** (`lib/stochastic.ts`) — Sample Average Approximation over sampled no-show scenarios with a chance constraint P(any slot overflows) ≤ α. The deterministic plan is always a candidate, so expected cost never gets worse.
- **Pareto frontier** (`lib/pareto.ts`) — bi-objective (total wait vs reschedules) via weight sweep + non-domination filter, rendered as a chart; click a point to select that operating point.
- **Statistical validation** (`lib/statistics.ts`) — warm-up handling, batch-means 95% CIs on KPIs, and a Little's Law bookkeeping check with the derived discrete-time phase correction (L = λ·(W − phase + step)).
- **Congestion pricing** (`lib/pricing.ts`) — time-of-day + load-based slot prices shift carrier demand; the terminal re-optimizes and reports peak flattening + revenue. An illustrative mechanism, not a tariff proposal.
- **Methodology page** (`/methodology`) — the formal problem statement, method guarantees, and verified literature, rendered from `lib/formulation.ts`.
- **Multi-day rolling horizon** — bookings, optimization, and simulation all run across 7 days (`lib/data.ts` `generateWeekRequests`, `lib/optimizer.ts` `optimizeHorizon`, `lib/simulation.ts` `simulateWeek`). Days share no capacity — each day has its own slots — so the horizon plan is one optimized day-plan per day, plus week totals.
- **Live replanning** (`lib/replan.ts`) — the day is running and trucks go late or no-show: the dispatcher marks disruptions, confirmed slots freeze, and the rest of the day is re-optimized. The UI shows exactly what moved.
- **Per-gate service model** — gates are not interchangeable: Express (4 min/truck, 7 per slot), Standard (5 min, 6 per slot), Inspection (8 min, 3 per slot). The optimizer and the queue simulation both use these rates; bookings name a terminal and the optimizer prefers that terminal's gate.
- **CSV export** (`lib/csv.ts`) — download the day plan (slot, truck, gate, terminal, window, status) for dispatchers and TOS import.
- **No-show prediction** (`lib/predictor.ts`) — a transparent heuristic scoring function (lead time, driver history, night slots, cargo type) driving intelligent overbooking. **This is a heuristic, not the LSTM-Transformer arrival model from the literature** — the code and docs say so wherever it matters.
- **Live dashboard** (`/demo`) — day selector, optimizer-method toggle (greedy vs annealing), horizon totals, queue-length curves (baseline vs optimized), gate utilization, reschedule rate, CO₂ estimate, a TAS ON/OFF scenario toggle, a greedy-vs-annealing benchmark panel, the gate service model, the live-replanning panel, and the research-methods section (exact, stochastic, Pareto, validation, pricing).
- **Marketing landing page** (`/`) — the pitch: problem, evidence, ROI.

## Algorithms

### Slot optimization — greedy + local search + simulated annealing

All three stages share one cost function (`totalCost` in `lib/optimizer.ts`):

```
cost = 10 × peak slot load + 3 × rescheduled + 2 × terminal mismatches + 0.5 × total wait
```

1. **Greedy:** earliest preferred start first; each truck takes the lowest-cost feasible gate/slot (load + reschedule penalty + terminal penalty), respecting per-gate capacity (and overbooking, when enabled).
2. **Local search:** 250 random single-truck reassignments, accepted only on strict cost improvement.
3. **Simulated annealing** (`lib/annealer.ts`, 2,500 moves, geometric cooling 6 → 0.02): random single-truck moves, uphill moves accepted with probability exp(−Δ/T). The best state seen is always kept — annealing starts from the greedy solution, so **it can never score worse than greedy** (asserted in `tests/annealer.test.ts`).

Per-gate capacity: a slot holds `floor(30 / serviceMin)` trucks — 7 express, 6 standard, 3 inspection. Overbooking inflates capacity by the expected no-show factor (capped at 2×).

### Live replanning (`lib/replan.ts`)

1. **Freeze** assignments whose slot starts before `now` — confirmed, never moved.
2. **Drop** no-shows — their slot is freed.
3. **Re-insert** late trucks with a window starting at `max(now, old slot + delay)` — never in the past.
4. **Re-optimize** the remaining unserved trucks with frozen slots as blocked capacity and an earliest-slot constraint at `now`.

The result reports moved trucks, freed slots, and before/after scores on the shared cost function.

### Queue simulation (`lib/simulation.ts`)

5-minute discrete-event steps, one FIFO queue per gate. Each gate serves at its own rate via a service-credit accumulator (credit grows by `5 / serviceMin` per step; a truck is served once credit ≥ 1). Baseline world: wide arrival jitter + 12% unannounced morning walk-ins. TAS world: tight arrivals around assigned slots. **Both worlds share one no-show draw per truck (common random numbers)** — see the Methodology corrections above. Simulation supports instrumentation (`simulateQueues(..., { instrument: true })`) for the validation module.

### Exact solver (`lib/exact.ts`)

Branch-and-bound over single-truck (gate, slot) assignments with a valid lower bound: peak-so-far + placed separable terms + partial slot wait (monotone in added trucks) + cheapest possible terms for unplaced trucks. Prunes any branch that cannot beat the greedy incumbent. Node budget (default 1M) with honest `optimal: false` / `aborted: true` reporting. Capped at n ≤ 12 — worst case O((G·S)ⁿ).

### Stochastic planning (`lib/stochastic.ts`)

K no-show scenarios sampled from the predictor's probabilities. Every candidate plan is evaluated *exactly* on every scenario (cost recomputed on the realized subset). Candidates: the deterministic plan + one plan per scenario (optimized on realized demand, completed for absent trucks). Selection: lowest expected cost among candidates satisfying P(overflow) ≤ α; if none satisfies, best-effort with `chanceSatisfied: false`.

### Pareto frontier (`lib/pareto.ts`)

Weight sweep λ ∈ {0, 0.1, …, 1} on λ·(wait/(n·60)) + (1−λ)·(rescheduled/n) via the weighted cost function, SA-refined, then a non-domination filter on raw (wait, rescheduled). Scalarization can miss non-convex frontier regions — documented, not hidden.

### Statistical validation (`lib/statistics.ts`)

Warm-up (default 60 min) discarded from statistics. Batch means: window split into b batches, CI = mean ± t_{b−1,0.975}·s/√b with a Student-t table. Little's Law: L measured by time-sampling the queue, λ·W from per-truck records, with the derived discrete-time correction L = λ·(W − meanPhase + STEP) — the sampler counts a truck in (k−j+1) samples while its true wait is (t_k − a_i), giving a +STEP/2 bias for uniform arrivals; the correction uses the *measured* mean phase, not an assumed one. On the reference day the check passes at ~0.5% error.

### Congestion pricing (`lib/pricing.ts`)

Slot price p = P₀ · tier(s) · (1 + σ · loadFactor): tiers ×1.8 peak (07–11h), ×1.15 shoulder, ×0.6 off-peak. Each carrier picks the slot minimizing p + VoT·displacement/60 (displacement from the nearest edge of its preferred window; VoT synthetic $30–120/h). Shifted demand is re-optimized; revenue = Σ prices over assigned slots. Illustrative mechanism — willingness-to-pay is synthetic.

### No-show heuristic (`lib/predictor.ts`)

Logistic-style hand-tuned score (lead time, driver history, night slots, cargo) — priors, not fitted parameters. Recalibrated 2026-10-13 to a realistic typical p ≈ 0.08–0.16 (see Methodology corrections). See the file header for the honest methodology note.

## Architecture

```mermaid
flowchart LR
    subgraph UI [Next.js 14 App Router]
        L[Landing /] --> D[Demo /demo]
        L --> B[Booking /book]
        D --> C1[QueueChart]
        D --> C2[GateChart]
        D --> C3[BenchmarkPanel]
        D --> C4[ReplanPanel]
        D --> C5[GateProfiles]
        B --> F[BookingForm]
    end
    subgraph API [API Routes]
        O[POST /api/optimize]
        S[POST /api/simulate]
        P[POST /api/plan]
        BM[POST /api/benchmark]
        R[POST /api/replan]
    end
    subgraph CORE [lib/ — pure TypeScript]
        OPT[optimizer.ts<br/>greedy + local search + SA]
        ANN[annealer.ts<br/>generic SA engine]
        REP[replan.ts<br/>live replanning]
        CSV[csv.ts<br/>day-plan export]
        PRE[predictor.ts<br/>no-show heuristic]
        SIM[simulation.ts<br/>discrete-event week sim]
        DAT[data.ts<br/>seed data + PRNG]
    end
    F --> O --> OPT
    D --> S --> SIM
    D --> P --> OPT
    D --> BM --> OPT
    D --> R --> REP
    REP --> OPT
    SIM --> OPT
    OPT --> ANN
    OPT --> PRE
    SIM --> DAT
```

All domain logic is pure, deterministic (seeded PRNG), and framework-free — it can be lifted into any backend.

## ROI — why a port authority buys this

Using the ENSEM-reported benchmarks as the reference case:

1. **Throughput recovery.** Appointments flatten the morning arrival spike that chokes 3 gates. The demo's simulated day shows peak queue collapsing when the optimizer spreads arrivals across all slots and gates.
2. **−62% max queue length** (ENSEM, real port data). Shorter queues = less gate idle/starve cycling = more containers per day without pouring concrete.
3. **−785 t CO₂/year** (ENSEM). Idling trucks burn ~2.5 L/h; a 12-hour wait is ~80 kg CO₂ per truck. The demo computes CO₂ from simulated waiting time so buyers see the green dividend live.
4. **Only 7.8% rescheduled** (ENSEM). The optimizer respects preferred windows; truckers keep their habits, the port keeps its flow.
5. **No-show-aware overbooking.** The predictor fills expected gaps instead of leaving paid gate capacity idle.

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest — optimizer, predictor, simulation
npm run build    # production build
```

Deploy: push to `main` — the Vercel project auto-deploys (or `vercel --prod`).

## API

### POST /api/optimize
Assign slots to booking requests.

```json
{
  "requests": [
    {
      "id": "req-1", "company": "Atlas Freight Maroc", "truckPlate": "48213 - A - 6",
      "cargo": "general", "move": "import", "containers": 1,
      "preferredStart": 420, "preferredEnd": 600,
      "leadTimeHours": 24, "driverNoShowRate": 0.05, "createdAt": 1
    }
  ]
}
```

Response: `{ assignments: [...], method, summary: { total, rescheduled, rescheduleRate, avgNoShowRisk, optimizerCost, avgWaitMin, maxSlotLoad } }`.

Optional body field `method: "greedy" | "annealed"` selects the optimizer. Optional per-request fields: `day` (0..6, default 0), `terminal` (T1|T2|T3|any). All requests in one call must share the same day.

### POST /api/simulate
```json
{ "trucks": 220, "seed": 42, "days": 7, "method": "greedy" }
```
`days=1` (default) returns `{ baseline: DayMetrics, optimized: DayMetrics, params }` — queue series, gate utilization, CO₂, waits. `days=2..7` returns `{ days: ScenarioResult[], horizon: HorizonSummary }` with week totals. `method` selects the optimizer for the optimized world.

### POST /api/plan
```json
{ "trucks": 220, "seed": 42, "day": 0, "method": "greedy" }
```
Response: `{ day, method, requests, assignments, summary }` — the actual optimized plan for one horizon day. Powers the demo's replanning panel and CSV export.

### POST /api/benchmark
```json
{ "trucks": 220, "seed": 42, "day": 0 }
```
Response: `{ day, trucks, seed, greedy: {...}, annealed: {...}, delta: {...} }` — both optimizers on identical demand, with cost, avg wait, reschedules, peak slot load, and CO₂ for each.

### POST /api/replan
```json
{
  "requests": [ ... ],
  "assignments": [ ... ],
  "disruptions": [{ "requestId": "REQ-0001", "kind": "late", "lateByMin": 60 }],
  "nowMin": 600,
  "method": "greedy"
}
```
Response: `{ after, before, moved, removedNoShows, lateReplaced, frozen, beforeScore, afterScore }`.

`GET` on any route returns usage docs.

### POST /api/exact
```json
{ "trucks": 8, "seed": 42, "day": 0, "maxNodes": 1000000 }
```
Response: `{ exact: { cost, optimal, aborted, feasible, nodes, pruned }, greedy: { cost, gapPct }, annealed: { cost, gapPct } }` — branch-and-bound proven optimum vs heuristics on a small instance (trucks ≤ 12, else 400). Gaps are (heuristic − optimum) / optimum in %.

### POST /api/stochastic
```json
{ "trucks": 220, "seed": 42, "day": 0, "scenarios": 25, "alpha": 0.05 }
```
Response: `{ scenarios, alpha, chanceSatisfied, expectedImprovement, deterministic: {...}, chosen: {...} }` — SAA stochastic planning under no-show uncertainty with chance constraint P(overflow) ≤ α.

### POST /api/pareto
```json
{ "trucks": 220, "seed": 42, "day": 0 }
```
Response: `{ points: [{ lambda, totalWait, rescheduled, avgWait, rescheduleRate }] }` — bi-objective Pareto frontier (total wait vs reschedules), mutually non-dominated.

### POST /api/validate
```json
{ "trucks": 220, "seed": 42, "warmUpMin": 60, "batches": 10, "tolerance": 0.2 }
```
Response: `{ window, meanQueue, avgWait, littlesLaw: { avgNumberInSystem, arrivalRate, avgWait, predicted, meanPhase, relativeError, passes, tolerance, trucksCounted }, queueBatchMeans: {...}, waitBatchMeans: {...} }` — warm-up + batch-means CIs + Little's Law bookkeeping check.

### POST /api/pricing
```json
{ "trucks": 220, "seed": 42, "day": 0, "basePrice": 25, "surcharge": 0.5, "maxShiftMin": 120 }
```
Response: `{ basePeakLoad, pricedPeakLoad, peakReductionPct, revenue, shiftedCount, avgDisplacementMin, avgPricePaid }` — congestion-pricing mechanism experiment. Illustrative only.

## Screenshots

Captured from the live demo at https://tas-casablanca-eliem08s-projects.vercel.app:

- `docs/screenshots/landing.jpg` — landing page hero with the crisis stat strip
- `docs/screenshots/demo-on.jpg` — dashboard with TAS ON: flattened queue curve, balanced gates, benchmark panel
- `docs/screenshots/demo-off.jpg` — dashboard with TAS OFF: the status-quo congestion spike
- `docs/screenshots/booking.jpg` — carrier booking form with live no-show risk meter

## Guided demo script (for a buyer meeting)

1. Open `/` — the landing page tells the crisis story in 60 seconds.
2. Go to `/demo` — toggle **TAS OFF**: red queue curve spikes to a midday wall; gates saturate; CO₂ climbs.
3. Toggle **TAS ON**: the teal curve flattens, utilization balances across 3 gates, reschedule rate stays single-digit.
4. Switch **Day 1 → Day 7**: the horizon totals update; each day has its own demand and plan.
5. Toggle **Greedy → Sim. annealing**: the benchmark panel shows annealing's improvement on identical demand — never worse, usually better.
6. **Live replanning**: set "now" to 10:00, mark a truck late +60 min, hit Re-optimize — watch the plan absorb the disruption without touching confirmed slots.
7. **Export CSV**: download the day plan for dispatchers.
8. Open `/book` — submit a booking as a trucking company on a chosen day/terminal; watch the optimizer place it, show no-show risk, and explain any reschedule.
9. Close with the ROI panel: 62% / 785t / 7.8% — the ENSEM numbers this demo is calibrated to echo.

## Honest limitations

- **All "live" numbers are simulated.** The dashboard runs a discrete-event simulation on synthetic demand, not on ANP or terminal operating data.
- **Days are independent.** The horizon has no cross-day carryover — a truck that misses its day does not roll into the next day's plan. Real operations would need a carryover rule.
- **Simulated annealing is a heuristic**, not a proof of optimality. It never loses to greedy on the shared cost function, but neither method certifies a global optimum. The exact solver certifies optima only for n ≤ 12.
- **Stochastic planning is SAA with a candidate-set search** — evaluation over sampled scenarios is exact, but the search is heuristic, and the chance constraint is an empirical frequency over sampled scenarios, not a true probability.
- **Pareto points are SA-refined approximations** — scalarization can miss non-convex frontier regions; points are mutually non-dominated, not proven Pareto-optimal.
- **Little's Law validates bookkeeping, not physics.** Agreement between two independent measurements of the same simulated queue means the simulator's accounting is consistent; it says nothing about whether the queue model matches the real port.
- **Congestion prices are illustrative.** Willingness-to-pay is synthetic; nothing here is a claim about real Casablanca port tariffs.
- **Replanning is a same-day heuristic.** Frozen slots are never revisited, so a replan can be locally optimal at best; a full-day re-optimization from scratch could theoretically do better (at the cost of disrupting confirmed trucks).
- **The predictor is a heuristic**, not a trained model. Real deployment needs historical gate logs to fit no-show models (the literature uses LSTM-Transformer architectures for arrival forecasting). Its coefficients are priors — recalibrated once during review (see Methodology corrections) and still awaiting real data.
- **Single-instance in-memory demo.** No database, no auth, no real carrier integration — those are Phase-1 build items, listed in `docs/roadmap.md` (planned).
- Crisis figures are press-reported, not audited.

## Project structure

```
app/                # Next.js app router: / (landing), /demo, /book, /methodology, /api/*
components/         # Nav, Footer, ui primitives, charts, BookingForm,
                    # BenchmarkPanel, ReplanPanel, GateProfiles,
                    # ExactPanel, StochasticPanel, ParetoPanel,
                    # ValidationPanel, PricingPanel
lib/                # types, data, optimizer, annealer, replan, csv,
                    # predictor, simulation, exact, stochastic, pareto,
                    # statistics, pricing, formulation (pure TS)
tests/              # vitest suites for lib/
public/             # static assets
```

## Testing

```bash
npm test
```

Suites cover: optimizer feasibility (every request assigned, per-gate capacity respected, determinism, optimized ≤ baseline peak load, terminal preference, horizon day), annealing (beats-or-matches greedy on cost, determinism, capacity), replanning (confirmed slots frozen, no-show frees slot, late re-placement, no placements in the past, determinism), CSV (header, row count, quoting, slot geometry, status values), horizon (7-day coverage, per-day capacity, week aggregation, determinism), predictor monotonicity and bounds, simulation sanity (metrics in range, TAS improves on baseline for the reference seed, paired no-show comparison), exact solver (matches brute force on tiny instances, proves optimality, never exceeds heuristic cost, capacity, cap enforcement, honest not-proven reporting, determinism), stochastic planning (deterministic scenarios, full-shown equivalence, chosen never worse than deterministic on expected cost, valid overflow frequencies, determinism), Pareto (non-domination, ordering property, endpoints, complete plans, determinism), statistics (t critical values, batch-means CI properties, Little's Law pass/fail, validation determinism), pricing (tier ordering, surcharge, demand shift, zero-price edge case, window-length preservation, determinism), formulation (complete blocks, verified citations, method guarantees).

## License

MIT.
