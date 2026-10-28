# Performance — measured numbers (Phase D)

All numbers below are **measured wall-clock** on the dev VM (shared CPU,
Node 20, `vitest run`), not estimates. Re-run
`npx vitest run tests/phase-d-performance.test.ts` to reproduce; the test
file prints `[perf]` rows and asserts only generous sanity bounds
(< 60 s per case) so CI machines with different speeds don't flake.

Measured 2026-10-18 (single run; expect ±30% run-to-run on shared infra).

## Booking creation — POST /api/bookings (route level)

Sequential creations, rate limiter reset between batches of 50 (the route
rate-limits at 60 req/min/IP — production would 429 past that; the reset
isolates creation-path throughput from the limiter).

| creations | wall clock | throughput |
|----------:|-----------:|-----------:|
| 100  | 78 ms  | ~1,290 req/s |
| 500  | 388 ms | ~1,290 req/s |
| 1000 | 497 ms | ~2,010 req/s |

Scaling is ~linear in request count. No degradation observed at 1000.

## Slot optimization — optimizeSlots (lib level)

Random demand (seed 777), default cost weights, overbook off.

| n    | greedy | annealed |
|-----:|-------:|---------:|
| 100  | 65 ms  | 400 ms   |
| 500  | 180 ms | 568 ms   |
| 1000 | 198 ms | 1,534 ms |

Greedy is comfortably sub-second at 1000 trucks. Annealed grows roughly
linearly (SA runs a fixed 2500 iterations × O(n) cost evaluations) and is
~8× slower than greedy at n=1000 — the known price of the annealing
phase, which never scores worse than greedy (property P2 in
tests/phase-d-property.test.ts). Nothing superlinear was observed in the
measured range; the exact solver is intentionally NOT benchmarked here —
it is capped at n ≤ 12 by design (EXACT_MAX_TRUCKS).

## POST /api/optimize (route level, greedy)

Includes JSON parse, request validation, optimization, and scoring.

| n   | wall clock |
|----:|-----------:|
| 100 | 23 ms  |
| 250 | 81 ms  |
| 500 | 125 ms |

The route cap is 500 requests (MAX_REQUESTS); larger demand is rejected
with 400, not processed slowly.

## Slow routes (from fuzz timing, single empty-body calls)

These are compute-heavy by design — documented here so nobody mistakes
them for regressions:

| route | empty-body call | why |
|-------|----------------:|-----|
| POST /api/pareto | ~1.9 s | weight-sweep × full optimizations |
| POST /api/stochastic | ~0.6 s | scenario ensemble |
| POST /api/benchmark | ~0.17 s | multi-method comparison |

## Full test-suite wall clock

301 tests / 27 files, all passing: ~90 s on the dev VM
(`npm test`; dominated by the exact-solver and fuzz tests — the
property tests themselves run in ~3 s). `npm run typecheck`, `npm run
lint`, and `npm run build` all clean.
