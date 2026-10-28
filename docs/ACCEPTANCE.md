# Acceptance criteria — "ready for a supervised pilot"

Each criterion is **MET**, **NOT MET**, or **BLOCKED-ON-REAL-DATA**,
with the evidence that justifies the status. "Supervised pilot" means:
a terminal operator runs TAS-Casablanca next to their existing process,
with a human dispatcher approving every plan, on real demand.

## Software correctness — MET

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| A1 | Exact solver matches an independent brute force on wider shapes (n≤4 exhaustive, n=5 sampled) | **MET** | `tests/phase-d-property.test.ts` P5 — 13 instances, independent from-scratch brute force, all agree to 1e-9 |
| A2 | Optimizer invariants hold over randomized instances: capacity respected, no double-booking, slot alignment, terminal/gate consistency, wait formula, rescheduled-flag rule | **MET** | `tests/phase-d-property.test.ts` P1 — 8 seeds × 2 methods × 2 window shapes (64 cases) |
| A3 | Annealed never scores worse than greedy on the shared cost function | **MET** | `tests/phase-d-property.test.ts` P2 — 8 random instances |
| A4 | Confirmed (frozen) bookings survive replanning byte-identical; replanned trucks never placed in the past | **MET** | `tests/phase-d-property.test.ts` P3 — 8 random disruption scenarios |
| A5 | Infeasible instances fail gracefully (`feasible:false`, never "optimal") | **MET** | `tests/phase-d-property.test.ts` P4 + `tests/exact-hardening.test.ts` regression |
| A6 | Idempotency-Key replay → byte-identical response, exactly one entity created | **MET** | `tests/phase-d-idempotency.test.ts` — bookings + recommendations |
| A7 | Randomized malformed input → always 4xx with `{ error }`, never 5xx, never silent 2xx acceptance on required-field routes | **MET** | `tests/phase-d-fuzz.test.ts` — 22 tests, ~700 payloads across 14 endpoints |
| A8 | Hot-path performance within sane bounds at representative sizes | **MET** | `docs/PERFORMANCE.md` — bookings ~1.3–2k req/s; optimize 500 trucks in 125 ms (route) |
| A9 | Full suite green: tests + typecheck + build | **MET** | run `npm test`, `npm run typecheck`, `npm run build` (numbers in README Validation section) |
| A10 | Appointment status machine enforces legal transitions only | **MET** | `lib/contracts/appointment.ts` `BookingStatusTransition` + Phase C tests |

## Real-world accuracy — BLOCKED-ON-REAL-DATA

No software test can meet these. Each names the dataset schema
(`lib/datasets/schemas.ts`) and the source that must provide it.

| # | Criterion | Status | What would resolve it |
|---|-----------|--------|----------------------|
| B1 | No-show model calibrated: predicted vs observed no-show rate within ±5pp on a held-out month | **BLOCKED-ON-REAL-DATA** | `AppointmentAdherenceRecord` extracts (TAS bookings × gate check-ins) from the terminal operator, ≥ 3 months |
| B2 | Per-gate service times measured (replacing the 4/5/8-min guesses in `GATE_PROFILES`) | **BLOCKED-ON-REAL-DATA** | `GateServiceTimeRecord` extracts (gate system / induction loops), ≥ 1 month per gate |
| B3 | Simulator queue predictions vs observed queues: mean absolute error reported on real snapshots | **BLOCKED-ON-REAL-DATA** | `QueueMeasurement` + `TruckArrivalRecord` extracts across the morning peak, ≥ 1 month |
| B4 | Arrival-time distribution matches observed arrivals (not the invented `pickPreferredWindow`) | **BLOCKED-ON-REAL-DATA** | `TruckArrivalRecord` extracts, ≥ 3 months |
| B5 | Supervised pilot KPI: measured peak-queue / avg-wait delta vs the operator's baseline, dispatcher-approved plans only | **BLOCKED-ON-REAL-DATA** | The pilot itself, with B1–B4 calibration done first |

## Production hardening — NOT MET (by design in this demo)

These are out of scope for the demo by explicit doctrine (no databases,
no auth providers, no deployments — see the Phase D task), but they are
gates for anything beyond a supervised pilot:

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| C1 | Real authentication (signed tokens, IdP roles) instead of `x-demo-role` header | **NOT MET** | `lib/server/auth.ts` is a documented mock; the interface seam exists |
| C2 | Durable stores (bookings, idempotency, audit) instead of in-memory Maps | **NOT MET** | Process restart loses all data; idempotency has no TTL |
| C3 | Concurrent idempotency: simultaneous same-key POSTs cannot double-create | **NOT MET** | `setIfAbsent` is first-write-wins but the check-and-create is not atomic |
| C4 | Multi-instance rate limiting | **NOT MET** | Token bucket is per-process memory |

## How to use this document

A criterion moves from BLOCKED-ON-REAL-DATA to MET only with a dated,
sourced measurement attached (extract date range, source system,
measured value). A criterion moves from NOT MET to MET only with a
code change plus a test. Nothing moves on the basis of a simulation.
