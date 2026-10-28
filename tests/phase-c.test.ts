/**
 * tests/phase-c.test.ts
 *
 * Phase C regression tests: versioned contracts, server-side validation,
 * idempotency, audit trail, auth/RBAC, and API hygiene (rate limiting,
 * body size limit, error sanitization).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  APPOINTMENT_CONTRACT_VERSION,
  RECOMMENDATION_CONTRACT_VERSION,
  parseAppointment,
  parseAppointmentCreateInput,
  validateAppointment,
  validateTransition,
  parseRecommendation,
  parseRecommendationCreateInput,
  validateRecommendationTransition,
  type AppointmentCreateInput,
} from "../lib/contracts";
import { auditLog } from "../lib/server/audit";
import {
  bookingIdempotency,
  recommendationIdempotency,
} from "../lib/server/idempotency";
import { clearRateLimits } from "../lib/server/rate-limit";
import { internalError } from "../lib/server/api-guard";
import {
  appointmentStore,
  recommendationStore,
  BOOKING_CAPACITY_PER_SLOT,
} from "../lib/server/stores";
import { POST as bookingsPOST, GET as bookingsGET } from "../app/api/bookings/route";
import {
  PATCH as bookingPATCH,
  GET as bookingGET,
} from "../app/api/bookings/[id]/route";
import { POST as recPOST } from "../app/api/recommendations/route";
import { POST as recApprovePOST } from "../app/api/recommendations/[id]/approve/route";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function validCreateInput(over: Partial<AppointmentCreateInput> = {}): AppointmentCreateInput {
  return {
    truck: { plate: "48213 - A - 6", carrier: "Atlas Freight Maroc" },
    container: { number: "MSKU0000006", type: "40ft-dry" },
    slot: { startUtc: "2026-10-20T08:00:00Z", endUtc: "2026-10-20T08:30:00Z" },
    terminal: "T1",
    gate: "gate-1",
    ...over,
  };
}

function post(
  handler: (r: Request) => Promise<Response>,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return handler(
    new Request("http://localhost/api/x", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function get(
  handler: (r: Request) => Promise<Response>,
  headers: Record<string, string> = {},
): Promise<Response> {
  return handler(new Request("http://localhost/api/x", { headers }));
}

async function createBooking(
  over: Partial<AppointmentCreateInput> = {},
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await post(bookingsPOST, validCreateInput(over), headers);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

function validRecommendationPayload(over: Record<string, unknown> = {}) {
  return {
    payload: {
      type: "reschedule",
      appointmentId: "appt_0123456789ABCDEFGHJKMNPQRS",
      newSlotStartUtc: "2026-10-20T09:00:00Z",
      newSlotEndUtc: "2026-10-20T09:30:00Z",
      reason: "gate congestion at original slot",
    },
    rationale: "Moving the truck one slot later avoids the predicted 08:00 queue peak.",
    ...over,
  };
}

beforeEach(() => {
  appointmentStore.clear();
  recommendationStore.clear();
  bookingIdempotency.clear();
  recommendationIdempotency.clear();
  auditLog.clear();
  clearRateLimits();
});

/* ------------------------------------------------------------------ */
/* contracts                                                           */
/* ------------------------------------------------------------------ */

describe("Phase C contracts", () => {
  it("contract versions are pinned", () => {
    expect(APPOINTMENT_CONTRACT_VERSION).toBe("1.0.0");
    expect(RECOMMENDATION_CONTRACT_VERSION).toBe("1.0.0");
  });

  it("parseAppointment accepts a valid appointment", () => {
    const r = parseAppointment({
      id: "appt_0123456789ABCDEFGHJKMNPQRS",
      status: "confirmed",
      ...validCreateInput(),
      createdAtUtc: "2026-10-17T10:00:00Z",
      updatedAtUtc: "2026-10-17T10:00:00Z",
    });
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.value?.id).toMatch(/^appt_/);
  });

  it("parseAppointment rejects bad container numbers, timestamps and shapes — never throws", () => {
    const bad = [
      [{}, "missing fields"],
      [{ ...validCreateInput(), container: { number: "MSKU0000000", type: "40ft" } }, "bad check digit"],
      [{ ...validCreateInput(), container: { number: "nope", type: "40ft" } }, "bad format"],
      [{ ...validCreateInput(), slot: { startUtc: "2026-10-20 08:00", endUtc: "2026-10-20T08:30:00Z" } }, "non-UTC timestamp"],
      [{ ...validCreateInput(), slot: { startUtc: "2026-10-20T09:00:00Z", endUtc: "2026-10-20T08:30:00Z" } }, "end before start"],
      [{ ...validCreateInput(), id: "nope", status: "requested", createdAtUtc: "2026-10-17T10:00:00Z", updatedAtUtc: "2026-10-17T10:00:00Z" }, "bad id"],
      [{ ...validCreateInput(), id: "appt_0123456789ABCDEFGHJKMNPQRS", status: "teleported", createdAtUtc: "2026-10-17T10:00:00Z", updatedAtUtc: "2026-10-17T10:00:00Z" }, "bad status"],
      ["just a string", "non-object"],
      [null, "null"],
    ] as Array<[unknown, string]>;
    for (const [v, label] of bad) {
      let r;
      expect(() => {
        r = parseAppointment(v);
      }).not.toThrow();
      expect(r!.ok, label).toBe(false);
      expect(r!.issues.length, label).toBeGreaterThan(0);
      for (const issue of r!.issues) {
        expect(issue.path, label).toBeTypeOf("string");
        expect(issue.code, label).toBeTypeOf("string");
        expect(issue.message, label).toBeTypeOf("string");
      }
      expect(r!.value, label).toBeUndefined();
    }
  });

  it("validateAppointment returns typed issues (empty = valid)", () => {
    expect(validateAppointment(null)).not.toEqual([]);
    const good = {
      id: "appt_0123456789ABCDEFGHJKMNPQRS",
      status: "requested",
      ...validCreateInput(),
      createdAtUtc: "2026-10-17T10:00:00Z",
      updatedAtUtc: "2026-10-17T10:00:00Z",
    };
    expect(validateAppointment(good)).toEqual([]);
    const issues = validateAppointment({ ...good, status: "bogus" });
    expect(issues.length).toBeGreaterThan(0);
  });

  it("booking state machine: legal transitions pass, illegal ones fail", () => {
    expect(validateTransition("confirmed", "cancelled")).toEqual([]);
    expect(validateTransition("requested", "confirmed")).toEqual([]);
    expect(validateTransition("checked-in", "no-show")).toEqual([]);
    const illegal = validateTransition("completed", "requested");
    expect(illegal.length).toBeGreaterThan(0);
    expect(illegal[0].message).toMatch(/illegal status transition/);
    expect(validateTransition("cancelled", "confirmed").length).toBeGreaterThan(0);
    expect(validateTransition("approved", "requested").length).toBeGreaterThan(0);
  });

  it("recommendation contract: payload validated per type", () => {
    const good = {
      id: "rec_0123456789ABCDEFGHJKMNPQRS",
      ...validRecommendationPayload(),
      createdAtUtc: "2026-10-17T10:00:00Z",
      status: "proposed",
    };
    expect(parseRecommendation(good).ok).toBe(true);

    // Unknown type fails closed.
    const unknownType = {
      ...good,
      payload: { type: "launch-rockets", appointmentId: "appt_x" },
    };
    expect(parseRecommendation(unknownType).ok).toBe(false);

    // Mismatched payload for a known type fails.
    const mismatched = {
      ...good,
      payload: { type: "reschedule", appointmentId: "appt_0123456789ABCDEFGHJKMNPQRS" },
    };
    const r = parseRecommendation(mismatched);
    expect(r.ok).toBe(false);
    expect(r.issues.length).toBeGreaterThan(0);

    // Decided recommendations require approver metadata.
    const decided = { ...good, status: "approved" };
    const d = parseRecommendation(decided);
    expect(d.ok).toBe(false);
    expect(d.issues.some((i) => i.path === "approvedBy")).toBe(true);
  });

  it("recommendation transitions: proposed→approved ok, approved→rejected rejected", () => {
    expect(validateRecommendationTransition("proposed", "approved")).toEqual([]);
    const bad = validateRecommendationTransition("approved", "rejected");
    expect(bad.length).toBeGreaterThan(0);
    expect(bad[0].message).toMatch(/illegal recommendation transition/);
  });

  it("parseAppointmentCreateInput validates the creation payload", () => {
    expect(parseAppointmentCreateInput(validCreateInput()).ok).toBe(true);
    const bad = parseAppointmentCreateInput({ truck: { plate: 1 } });
    expect(bad.ok).toBe(false);
    expect(bad.issues.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* booking routes: validation, idempotency, capacity                   */
/* ------------------------------------------------------------------ */

describe("POST /api/bookings", () => {
  it("creates a booking with server-assigned id and timestamps", async () => {
    const { status, body } = await createBooking();
    expect(status).toBe(201);
    expect(String(body.id)).toMatch(/^appt_/);
    expect(body.status).toBe("requested");
    expect(String(body.createdAtUtc)).toMatch(/Z$/);
    expect(body).toMatchObject({ terminal: "T1", gate: "gate-1" });
  });

  it("returns structured 400 { error: validation_failed, issues } for malformed bodies", async () => {
    const cases: Array<[unknown, string]> = [
      [{}, "empty object"],
      [{ truck: { plate: "X", carrier: "Y" } }, "missing fields"],
      [validCreateInput({ slot: { startUtc: "tomorrow", endUtc: "2026-10-20T08:30:00Z" } }), "bad timestamp"],
      [validCreateInput({ slot: { startUtc: "2026-10-20 08:00", endUtc: "2026-10-20T08:30:00Z" } }), "non-UTC timestamp"],
      [validCreateInput({ container: { number: "MSKU0000000", type: "40ft-dry" } }), "bad container check digit"],
      [validCreateInput({ container: { number: "HELLO", type: "40ft-dry" } }), "bad container format"],
      ['"just a string"', "JSON string body (not an object)"],    ];
    for (const [payload, label] of cases) {
      const res = await post(bookingsPOST, payload);
      expect(res.status, label).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.error, label).toBe("validation_failed");
      expect(Array.isArray(body.issues), label).toBe(true);
      expect((body.issues as unknown[]).length, label).toBeGreaterThan(0);
    }
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await post(bookingsPOST, "not json{{{");
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).error).toMatch(/Invalid JSON/i);
  });

  it("replays the original response for a repeated Idempotency-Key (one booking, identical body)", async () => {
    const key = "idem-key-123";
    const first = await post(bookingsPOST, validCreateInput(), { "Idempotency-Key": key });
    const second = await post(bookingsPOST, validCreateInput(), { "Idempotency-Key": key });
    expect(first.status).toBe(201);
    expect(second.headers.get("Idempotent-Replayed")).toBe("true");
    const b1 = (await first.json()) as Record<string, unknown>;
    const b2 = (await second.json()) as Record<string, unknown>;
    expect(b1).toEqual(b2);
    expect(appointmentStore.size).toBe(1);
    expect(bookingIdempotency.size).toBe(1);
  });

  it("different idempotency keys create different bookings", async () => {
    await post(bookingsPOST, validCreateInput(), { "Idempotency-Key": "k1" });
    await post(bookingsPOST, validCreateInput({ gate: "gate-2" }), { "Idempotency-Key": "k2" });
    expect(appointmentStore.size).toBe(2);
  });

  it("rejects over-capacity slots with 409 (no silent over-booking)", async () => {
    expect(BOOKING_CAPACITY_PER_SLOT).toBeGreaterThan(0);
    for (let i = 0; i < BOOKING_CAPACITY_PER_SLOT; i++) {
      const res = await post(bookingsPOST, validCreateInput(), {
        "Idempotency-Key": `cap-${i}`,
      });
      expect(res.status).toBe(201);
    }
    const over = await post(bookingsPOST, validCreateInput(), {
      "Idempotency-Key": "cap-over",
    });
    expect(over.status).toBe(409);
    const body = (await over.json()) as Record<string, unknown>;
    expect(String(body.error)).toMatch(/slot_full/);
    expect(appointmentStore.size).toBe(BOOKING_CAPACITY_PER_SLOT);
  });

  it("a different slot bucket still accepts bookings after capacity is hit", async () => {
    for (let i = 0; i < BOOKING_CAPACITY_PER_SLOT; i++) {
      await post(bookingsPOST, validCreateInput(), { "Idempotency-Key": `c2-${i}` });
    }
    const other = await post(bookingsPOST, validCreateInput({
      slot: { startUtc: "2026-10-20T10:00:00Z", endUtc: "2026-10-20T10:30:00Z" },
    }));
    expect(other.status).toBe(201);
  });
});

describe("/api/bookings/[id]", () => {
  it("GET fetches one booking; 404 for unknown id", async () => {
    const { body } = await createBooking();
    const res = await bookingGET(
      new Request("http://localhost/api/bookings/x"),
      { params: Promise.resolve({ id: String(body.id) }) },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, unknown>).id).toBe(body.id);

    const missing = await bookingGET(
      new Request("http://localhost/api/bookings/nope"),
      { params: Promise.resolve({ id: "appt_doesnotexist00000000000001" }) },
    );
    expect(missing.status).toBe(404);
  });

  it("PATCH applies legal transitions and rejects illegal ones", async () => {
    const { body } = await createBooking();
    const id = String(body.id);

    const patch = (payload: unknown) =>
      bookingPATCH(
        new Request("http://localhost/api/bookings/x", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
        { params: Promise.resolve({ id }) },
      );

    const ok = await patch({ status: "confirmed", reason: "carrier accepted" });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as Record<string, unknown>).status).toBe("confirmed");

    const illegal = await patch({ status: "requested" });
    expect(illegal.status).toBe(400);
    const illegalBody = (await illegal.json()) as Record<string, unknown>;
    expect(illegalBody.error).toBe("validation_failed");
    expect(JSON.stringify(illegalBody.issues)).toMatch(/illegal status transition/);

    const unknown = await patch({ status: "teleported" });
    expect(unknown.status).toBe(400);
  });

  it("cancelling a booking is audited and frees capacity", async () => {
    for (let i = 0; i < BOOKING_CAPACITY_PER_SLOT; i++) {
      await post(bookingsPOST, validCreateInput(), { "Idempotency-Key": `free-${i}` });
    }
    const first = appointmentStore.list()[0];
    const res = await bookingPATCH(
      new Request("http://localhost/api/bookings/x", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "cancelled", reason: "carrier withdrew" }),
      }),
      { params: Promise.resolve({ id: first.id }) },
    );
    expect(res.status).toBe(200);

    // Slot freed: a new booking now fits.
    const retry = await post(bookingsPOST, validCreateInput());
    expect(retry.status).toBe(201);

    const events = auditLog.forEntity("appointment", first.id);
    expect(events.some((e) => e.action === "booking.cancelled")).toBe(true);
    const cancelled = events.find((e) => e.action === "booking.cancelled")!;
    expect((cancelled.before as Record<string, unknown>).status).toBe("requested");
    expect((cancelled.after as Record<string, unknown>).status).toBe("cancelled");
  });

  it("GET /api/bookings lists created appointments", async () => {
    await createBooking();
    await createBooking({ gate: "gate-2" });
    const res = await get(bookingsGET);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { appointments: unknown[] };
    expect(body.appointments).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* recommendations: RBAC + audit                                       */
/* ------------------------------------------------------------------ */

describe("recommendations + RBAC", () => {
  async function propose(): Promise<string> {
    const res = await post(recPOST, validRecommendationPayload());
    expect(res.status).toBe(201);
    return String(((await res.json()) as Record<string, unknown>).id);
  }

  function approveReq(id: string, headers: Record<string, string> = {}) {
    return recApprovePOST(
      new Request(`http://localhost/api/recommendations/${id}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ decision: "approve", reason: "dispatcher sign-off" }),
      }),
      { params: Promise.resolve({ id }) },
    );
  }

  it("proposes a recommendation (status=proposed) and records it in the audit log", async () => {
    const id = await propose();
    expect(id).toMatch(/^rec_/);
    const events = auditLog.forEntity("recommendation", id);
    expect(events.some((e) => e.action === "recommendation.proposed")).toBe(true);
  });

  it("denies approval without the approver role (403) and audits the denial", async () => {
    const id = await propose();
    const res = await approveReq(id); // default mock roles: viewer+planner
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("forbidden");
    expect(body.requiredRole).toBe("approver");

    const events = auditLog.forEntity("recommendation", id);
    expect(events.some((e) => e.action === "recommendation.decision-denied")).toBe(true);
    // Still proposed — the denial did not change state.
    expect(recommendationStore.get(id)?.status).toBe("proposed");
  });

  it("approves with the approver role and records before/after in the audit log", async () => {
    const id = await propose();
    const res = await approveReq(id, { "x-demo-role": "approver" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("approved");
    expect(body.approvedBy).toBe("demo-operator");
    expect(String(body.approvedAtUtc)).toMatch(/Z$/);

    const events = auditLog.forEntity("recommendation", id);
    const approved = events.find((e) => e.action === "recommendation.approved")!;
    expect(approved).toBeDefined();
    expect((approved.before as Record<string, unknown>).status).toBe("proposed");
    expect((approved.after as Record<string, unknown>).status).toBe("approved");
  });

  it("rejects a second decision on an already-decided recommendation", async () => {
    const id = await propose();
    await approveReq(id, { "x-demo-role": "approver" });
    const res = await recApprovePOST(
      new Request("http://localhost/api/recommendations/x/approve", {
        method: "POST",
        headers: { "content-type": "application/json", "x-demo-role": "approver" },
        body: JSON.stringify({ decision: "reject" }),
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("validation_failed");
  });

  it("idempotency applies to recommendation creation too", async () => {
    const key = "rec-idem-1";
    const a = await post(recPOST, validRecommendationPayload(), { "Idempotency-Key": key });
    const b = await post(recPOST, validRecommendationPayload(), { "Idempotency-Key": key });
    expect(a.status).toBe(201);
    expect(b.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await a.json()).toEqual(await b.json());
    expect(recommendationStore.size).toBe(1);
  });

  it("rejects malformed recommendation payloads with structured 400", async () => {
    const res = await post(recPOST, {
      payload: { type: "reschedule" },
      rationale: "x",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("validation_failed");
    expect((body.issues as unknown[]).length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* audit trail: append-only                                            */
/* ------------------------------------------------------------------ */

describe("audit trail", () => {
  it("seq is monotonic and events are immutable snapshots", async () => {
    await createBooking();
    await createBooking({ gate: "gate-2" });
    const events = auditLog.list();
    expect(events.length).toBe(2);
    expect(events[0].seq).toBeLessThan(events[1].seq);
    expect(events[0].id).toMatch(/^audit_/);
    expect(events[0].tsUtc).toMatch(/Z$/);

    // Snapshots are frozen — mutation attempts cannot corrupt the log.
    expect(Object.isFrozen(events)).toBe(true);
    const before = auditLog.list()[0].action;
    expect(() => {
      (events[0] as Record<string, unknown>).action = "tampered";
    }).toThrow();
    expect(auditLog.list()[0].action).toBe(before);
  });

  it("exposes no mutation or deletion API (append-only by construction)", () => {
    const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(auditLog));
    expect(proto).toContain("record");
    expect(proto).toContain("list");
    expect(proto).not.toContain("delete");
    expect(proto).not.toContain("update");
    expect(proto).not.toContain("remove");
    // Note: `clear` exists as a documented test/reset hook only.
    expect(proto).toContain("clear");
  });
});

/* ------------------------------------------------------------------ */
/* API hygiene: rate limit, body size, error sanitization               */
/* ------------------------------------------------------------------ */

describe("API hygiene", () => {
  it("rate-limits: 429 after the per-route budget is exhausted", async () => {
    let got429 = false;
    for (let i = 0; i < 70; i++) {
      const res = await get(bookingsGET);
      if (res.status === 429) {
        got429 = true;
        const body = (await res.json()) as Record<string, unknown>;
        expect(body.error).toBe("rate_limited");
        expect(res.headers.get("Retry-After")).toBeTruthy();
        break;
      }
      expect(res.status).toBe(200);
    }
    expect(got429).toBe(true);
  });

  it("rejects bodies larger than 1MB with 413", async () => {
    const big = "x".repeat(1_100_000);
    const res = await post(
      bookingsPOST,
      JSON.stringify({ ...validCreateInput(), note: big }),
    );
    expect(res.status).toBe(413);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("payload_too_large");
    expect(body.maxBytes).toBe(1_000_000);
  });

  it("internalError never leaks internals or stack traces", async () => {
    const res = internalError("test-context", new Error("secret DB password=hunter2\n    at boom (server.js:1:1)"));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toMatch(/hunter2/);
    expect(text).not.toMatch(/at boom/);
    expect((JSON.parse(text) as Record<string, unknown>).error).toBe("Internal server error");
  });

  it("GET docs routes still work through the guard", async () => {
    const { GET: optGET } = await import("../app/api/optimize/route");
    const res = await optGET(new Request("http://localhost/api/optimize"));
    expect(res.status).toBe(200);
  });
});
