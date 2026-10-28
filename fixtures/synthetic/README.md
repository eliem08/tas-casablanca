# fixtures/synthetic — SYNTHETIC DATA ONLY

> **Every file in this directory is hand-written synthetic data.**
> It exists to exercise the dataset-schema validators
> (`lib/datasets/schemas.ts`) and the fixture-conformance tests
> (`tests/phase-d-fixtures.test.ts`). It proves **software correctness
> only**: that the schemas parse what they claim to parse.
>
> It proves **nothing** about the Port of Casablanca, its gates, its
> queues, or its trucks. No record here was observed, measured, or
> received from any operator. Do not use these fixtures to calibrate
> models, fit distributions, or support any real-world claim.

## What each file is

| file | schema | records |
|------|--------|--------:|
| `truck-arrivals.json` | `TruckArrivalRecord` | 5 |
| `appointment-adherence.json` | `AppointmentAdherenceRecord` | 5 |
| `gate-service-times.json` | `GateServiceTimeRecord` | 5 |
| `queue-measurements.json` | `QueueMeasurement` | 5 |

Each file is a `DatasetEnvelope`:
`{ "synthetic": true, "schema_version": "1.0.0", "records": [...] }`.
The `"synthetic": true` flag is load-bearing: any consumer that
calibrates a model MUST refuse envelopes with `synthetic: true`.

## The gap these fixtures do NOT close

Real validation needs real extracts from the terminal operator / ANP:

1. **Truck arrivals** — timestamped gate passages (TOS/ANPR), to replace
   the invented arrival distribution in `lib/data.ts`.
2. **Appointment adherence** — scheduled vs actual check-in per booking,
   to calibrate the no-show heuristic in `lib/predictor.ts`
   (currently uncalibrated by its own admission).
3. **Gate service times** — per-truck service durations by gate/lane,
   to replace the hard-coded 4/5/8-minute guesses in
   `lib/types.ts` (GATE_PROFILES).
4. **Queue measurements** — timestamped queue snapshots, to check the
   simulator's queue predictions against reality.

Until those extracts exist, every "queue reduction" number this app
produces is a property of the simulation, not of the port.
See `docs/ACCEPTANCE.md` for the checkable criteria.
