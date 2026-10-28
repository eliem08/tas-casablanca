/**
 * tests/phase-d-idempotency.test.ts
 *
 * Phase D — idempotency property tests at the HTTP route level.
 *
 * Properties:
 *   I1  POST /api/bookings with the same Idempotency-Key twice ->
 *       byte-identical response body, and exactly ONE booking created.
 *   I2  Different keys -> distinct bookings.
 *   I3  Same for POST /api/recommendations.
 *   I4  Replay returns the ORIGINAL 201 status with Idempotent-Replayed.
 *
 * Stores are in-memory (lib/server/stores.ts) and reset between tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { POST as bookingsPOST } from "../app/api/bookings/route";
import { POST as recommendationsPOST } from "../app/api/recommendations/route";
import {
  appointmentStore,
  recommendationStore,
} from "../lib/server/stores";
import {
  bookingIdempotency,
  recommendationIdempotency,
} from "../lib/server/idempotency";

/** ISO 6346-valid container number (check digit verified). */
const CONTAINER_NO = "TCLU1234568";

function bookingPayload(slotHour: number) {
  const start = `2026-10-20T${String(slotHour).padStart(2, "0")}:00:00Z`;
  const end = `2026-10-20T${String(slotHour).padStart(2, "0")}:30:00Z`;
  return {
    truck: { plate: "48213 - A - 6", carrier: "Atlas Freight Maroc" },
    container: { number: CONTAINER_NO, type: "dry" },
    slot: { startUtc: start, endUtc: end },
    terminal: "T1",
    gate: "G1",
  };
}

function recommendationPayload() {
  return {
    payload: {
      type: "notify-carrier",
      carrier: "Atlas Freight Maroc",
      message: "Shift your 08:00 slot to 08:30 to avoid the queue peak.",
    },
    rationale: "Queue model predicts a 25-minute wait at 08:00 on gate G1.",
  };
}

function postWithKey(
  handler: (r: Request) => Promise<Response>,
  url: string,
  body: unknown,
  key: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key !== null) headers["idempotency-key"] = key;
  return handler(
    new Request(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  appointmentStore.clear();
  recommendationStore.clear();
  bookingIdempotency.clear();
  recommendationIdempotency.clear();
});

describe("I1/I4: booking idempotency-key replay", () => {
  it("same key twice -> identical body, one booking, replay header", async () => {
    const key = "phase-d-key-001";
    const r1 = await postWithKey(bookingsPOST, "http://localhost/api/bookings", bookingPayload(8), key);
    expect(r1.status).toBe(201);
    const b1 = await r1.json();

    const r2 = await postWithKey(bookingsPOST, "http://localhost/api/bookings", bookingPayload(9), key);
    expect(r2.status).toBe(201);
    expect(r2.headers.get("Idempotent-Replayed")).toBe("true");
    const b2 = await r2.json();

    // Byte-identical replay — even though the second body asked for 09:00.
    expect(b2).toEqual(b1);
    // Exactly one booking exists in the store.
    expect(appointmentStore.size).toBe(1);
    expect(appointmentStore.get(b1.id)?.slot.startUtc).toBe(
      "2026-10-20T08:00:00Z",
    );
  });

  it("replay is stable across three sequential submissions", async () => {
    const key = "phase-d-key-003";
    const bodies: unknown[] = [];
    for (const h of [8, 9, 10]) {
      const r = await postWithKey(
        bookingsPOST,
        "http://localhost/api/bookings",
        bookingPayload(h),
        key,
      );
      bodies.push(await r.json());
    }
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(appointmentStore.size).toBe(1);
  });
});

describe("I2: distinct keys -> distinct bookings", () => {
  it("different keys create separate bookings", async () => {
    const r1 = await postWithKey(bookingsPOST, "http://localhost/api/bookings", bookingPayload(8), "key-A");
    const r2 = await postWithKey(bookingsPOST, "http://localhost/api/bookings", bookingPayload(9), "key-B");
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.id).not.toBe(b2.id);
    expect(appointmentStore.size).toBe(2);
  });

  it("no key -> no idempotency record, each POST creates", async () => {
    for (const h of [8, 9]) {
      const r = await postWithKey(bookingsPOST, "http://localhost/api/bookings", bookingPayload(h), null);
      expect(r.status).toBe(201);
    }
    expect(appointmentStore.size).toBe(2);
    expect(bookingIdempotency.size).toBe(0);
  });
});

describe("I3: recommendation idempotency-key replay", () => {
  it("same key twice -> identical body, one recommendation", async () => {
    const key = "phase-d-rec-001";
    const r1 = await postWithKey(
      recommendationsPOST,
      "http://localhost/api/recommendations",
      recommendationPayload(),
      key,
    );
    expect(r1.status).toBe(201);
    const b1 = await r1.json();

    const r2 = await postWithKey(
      recommendationsPOST,
      "http://localhost/api/recommendations",
      { ...recommendationPayload(), rationale: "different rationale" },
      key,
    );
    expect(r2.status).toBe(201);
    expect(r2.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await r2.json()).toEqual(b1);
    expect(recommendationStore.size).toBe(1);
  });
});
