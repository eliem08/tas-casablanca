# Known limitations registry (Phase D)

A frank list of what is unproven, simplified, or demo-only — and the
evidence that would resolve each item. Read alongside
`docs/ACCEPTANCE.md` (the checkable criteria) and
`fixtures/synthetic/README.md` (what the synthetic data does not prove).

## Model / real-world accuracy

1. **No real operational data has ever touched this system.**
   Every arrival time, service time, queue length, and no-show rate in
   the app is invented by `lib/data.ts` or hard-coded. Resolves with:
   operator extracts conforming to `lib/datasets/schemas.ts`
   (criteria B1–B4 in ACCEPTANCE.md).

2. **Gate service times (4/5/8 min) are engineering guesses.**
   `GATE_PROFILES` in `lib/types.ts` was never measured. Slot capacity,
   wait estimates, and the exact solver's cost function all depend on
   these numbers. Resolves with: `GateServiceTimeRecord` extracts.

3. **The no-show model is an uncalibrated heuristic.**
   `lib/predictor.ts` floors probabilities and invents the lead-time
   curve. Overbooking factors derived from it inherit the error.
   Resolves with: `AppointmentAdherenceRecord` extracts + a calibration
   report (predicted vs observed by lead-time bucket).

4. **"Queue reduction" numbers are simulation-vs-simulation.**
   The baseline (`baselineAssign`) is a caricature of the status quo
   (first-come-first-served at fixed gates), not a measured baseline.
   Any −X% claim compares two models, not model vs reality. Resolves
   with: B3/B5 — measured queues before and during a supervised pilot.

5. **The −62% literature figure does not transfer automatically.**
   The README's evidence section cites published truck-appointment
   results; those were different ports, different gates, different
   years. It is motivation, not validation of this deployment.

## Optimizer / solver

6. **Exact solver caps at n ≤ 12** (`EXACT_MAX_TRUCKS`).
   By design — branch-and-bound is exponential. The property tests
   cross-check n ≤ 5 against brute force; n = 6..12 relies on the
   solver's own proof machinery (valid lower bound, never claims
   optimality on budget exhaustion — both tested). Not a defect, but
   the optimality evidence is strongest at n ≤ 5.

7. **Single-day, single-resource model.**
   Days are optimized independently (no carry-over), gates are the only
   scarce resource (no yard, crane, or labor constraints), and trucks
   are identical except for cargo/move/terminal. A real terminal has
   coupled resources the model ignores.

8. **Cost weights (10/3/2/0.5) are chosen, not fitted.**
   The documented cost function reflects judgment about what matters
   (peak load dominates). Pareto sweeps explore trade-offs, but the
   default weights were never elicited from dispatchers or fitted to
   outcomes.

## API / operations (demo doctrine)

9. **In-memory everything.** Bookings, recommendations, idempotency
   records, rate-limit buckets, audit log: all die with the process.
   The audit trail is append-only *within* a process lifetime only.

10. **Idempotency is not atomic under concurrency.** Two simultaneous
    POSTs with the same key can both pass the cache check and create
    two bookings (`setIfAbsent` wins for the *response*, not for the
    side effect). Production needs an atomic check-and-set / unique
    constraint. (Criterion C3.)

11. **Auth is a mock.** `x-demo-role` is client-controlled. The seam
    (`AuthProvider` interface + production checklist in
    `lib/server/auth.ts`) exists; a real IdP does not. (Criterion C1.)

12. **Rate limiter is per-process.** 60 req/min/IP/route holds on one
    instance; N instances allow N×. (Criterion C4.)

13. **Fuzzing found no 500s, but fuzzing is not proof.**
    ~700 seeded payloads across 14 endpoints is a smoke screen, not a
    security audit. The `params`-destructuring crash the fuzzer first
    tripped on is a test-harness artifact (Next.js always passes
    `{ params }` in production), not a production bug — but it shows
    the harness gap: route handlers are tested outside the Next.js
    runtime.

14. **Performance numbers are single-machine, single-run.**
    `docs/PERFORMANCE.md` records one VM's wall clock. Treat as order
    of magnitude, not SLA. The pareto route (~1.9 s) and stochastic
    route (~0.6 s) are slow by design; they are analysis endpoints,
    not hot paths.

## Process

15. **No dispatcher has ever seen this.**
    UI copy, disruption kinds (`no-show` / `late`), and the approval
    flow were designed without operator input. A supervised pilot
    (B5) is as much a UX validation as a model validation.
