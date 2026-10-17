import { describe, it, expect } from "vitest";
import { POST as optimizePOST } from "../app/api/optimize/route";
import { POST as replanPOST } from "../app/api/replan/route";
import { generateDayRequests } from "../lib/data";
import {
  optimizeSlots,
  loadBySlot,
  overbookFactorFor,
  findOverloads,
} from "../lib/optimizer";
import { capacityForGate, DAY_START_MIN, DAY_END_MIN, SLOT_MINUTES } from "../lib/types";
import type { BookingRequest, GateId } from "../lib/types";

function post(
  handler: (r: Request) => Promise<Response>,
  body: unknown,
): Promise<Response> {
  return handler(
    new Request("http://localhost/api/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function validRequest(over: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id: "r1",
    company: "Atlas Freight Maroc",
    truckPlate: "48213 - A - 6",
    cargo: "general",
    move: "import",
    containers: 1,
    preferredStart: 480,
    preferredEnd: 600,
    leadTimeHours: 24,
    driverNoShowRate: 0.05,
    createdAt: 1,
    ...over,
  };
}

describe("/api/optimize route (B2/B4)", () => {
  it("rapid sequential calls are consistent, valid, and capacity-safe", async () => {
    const body = { requests: [validRequest({ id: "r1" }), validRequest({ id: "r2", preferredStart: 540, preferredEnd: 660 })] };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => post(optimizePOST, body)),
    );
    const payloads = await Promise.all(results.map((r) => r.json()));
    for (const p of payloads) {
      expect(p.assignments).toHaveLength(2);
      expect(p.summary.overflowSlots).toBe(0);
    }
    // Stateless + fixed seed: every call returns the identical plan.
    // (No shared mutable store exists, so concurrent requests cannot
    // overbook or overwrite each other — see the note in README.)
    for (const p of payloads.slice(1)) {
      expect(p.assignments).toEqual(payloads[0].assignments);
    }
  });

  it("findOverloads uses the real overbook factor end-to-end", async () => {
    // Via the route, overbook:true always doubles capacity (the predictor
    // floors p at 0.02, so the factor is always 2) and MAX_REQUESTS is 500 <
    // 1024 inflated capacity — overload is unreachable through the route.
    // At lib level with >1024 demand the fallback must still be reported
    // against the inflated capacity the optimizer actually used.
    const requests = Array.from({ length: 1100 }, (_, i) =>
      validRequest({ id: `ob-${i}`, preferredStart: 480, preferredEnd: 510 }),
    );
    const factor = overbookFactorFor(requests);
    expect(factor).toBe(2);
    const out = optimizeSlots(requests, { seed: 3, overbook: true });
    expect(out).toHaveLength(1100);
    const overloads = findOverloads(out, factor);
    expect(overloads.length).toBeGreaterThan(0);
    for (const o of overloads) {
      expect(o.load).toBeGreaterThan(o.capacity);
    }
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await optimizePOST(
      new Request("http://localhost/api/optimize", {
        method: "POST",
        body: "not json{{{",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid JSON/i);
  });

  it("rejects bad request payloads with 400 and a clear message", async () => {
    const cases: Array<[string, unknown, RegExp]> = [
      ["missing requests", {}, /requests/],
      ["empty requests", { requests: [] }, /at least one/],
      ["too many", { requests: Array.from({ length: 501 }, (_, i) => validRequest({ id: `x${i}` })) }, /limited to 500/],
      ["bad cargo", { requests: [validRequest({ cargo: "bananas" as never })] }, /cargo must be one of/],
      ["window inverted", { requests: [validRequest({ preferredStart: 600, preferredEnd: 480 })] }, /before preferredEnd/],
      ["bad no-show rate", { requests: [validRequest({ driverNoShowRate: 2 })] }, /driverNoShowRate/],
      ["day out of range", { requests: [validRequest({ day: 9 })] }, /day must be an integer/],
      ["mixed days", { requests: [validRequest({ day: 0 }), validRequest({ id: "r2", day: 1 })] }, /same horizon day/],
      ["bad terminal", { requests: [validRequest({ terminal: "T9" as never })] }, /terminal must be one of/],
    ];
    for (const [label, body, pattern] of cases) {
      const res = await post(optimizePOST, body);
      expect(res.status, label).toBe(400);
      expect((await res.json()).error, label).toMatch(pattern);
    }
  });
});

describe("/api/replan route (B4)", () => {
  function planBody() {
    const requests = generateDayRequests(60, 42);
    const assignments = optimizeSlots(requests, { seed: 42, overbook: false });
    return { requests, assignments };
  }

  it("no-show cancellation removes the truck and frees the slot", async () => {
    const { requests, assignments } = planBody();
    const nowMin = 600;
    const target = assignments.find((a) => a.slotStart >= nowMin)!;
    const res = await post(replanPOST, {
      requests,
      assignments,
      disruptions: [{ requestId: target.requestId, kind: "no-show" }],
      nowMin,
    });
    expect(res.status).toBe(200);
    const p = await res.json();
    expect(p.removedNoShows).toContain(target.requestId);
    expect(
      p.after.find((a: { requestId: string }) => a.requestId === target.requestId),
    ).toBeUndefined();
    // Frozen (pre-nowMin) assignments are byte-identical.
    for (const f of p.frozen) {
      expect(p.after.find((a: { requestId: string }) => a.requestId === f.requestId)).toEqual(f);
    }
  });

  it("late arrival is re-placed at/after now + delay", async () => {
    const { requests, assignments } = planBody();
    const nowMin = 600;
    const target = assignments.find((a) => a.slotStart >= nowMin)!;
    const res = await post(replanPOST, {
      requests,
      assignments,
      disruptions: [{ requestId: target.requestId, kind: "late", lateByMin: 60 }],
      nowMin,
    });
    expect(res.status).toBe(200);
    const p = await res.json();
    expect(p.lateReplaced).toContain(target.requestId);
    const repl = p.after.find(
      (a: { requestId: string }) => a.requestId === target.requestId,
    );
    expect(repl.slotStart).toBeGreaterThanOrEqual(nowMin);
  });

  it("rejects invalid bodies with 400 and a clear message", async () => {
    const { requests, assignments } = planBody();
    const cases: Array<[string, unknown, RegExp]> = [
      ["bad json shape", { requests, assignments }, /disruptions/],
      [
        "bad disruption kind",
        { requests, assignments, disruptions: [{ requestId: "x", kind: "vanished" }], nowMin: 600 },
        /kind 'no-show' \| 'late'/,
      ],
      [
        "negative lateByMin",
        { requests, assignments, disruptions: [{ requestId: "x", kind: "late", lateByMin: -5 }], nowMin: 600 },
        /lateByMin/,
      ],
      [
        "nowMin out of range",
        { requests, assignments, disruptions: [], nowMin: 9999 },
        /nowMin/,
      ],
      [
        "malformed request",
        { requests: [{ id: "r1" }], assignments, disruptions: [], nowMin: 600 },
        /requests\[0\]/,
      ],
      [
        "malformed assignment",
        { requests, assignments: [{ requestId: "r1", gate: 7, slotStart: 480 }], disruptions: [], nowMin: 600 },
        /assignments\[0\].gate/,
      ],
    ];
    for (const [label, body, pattern] of cases) {
      const res = await post(replanPOST, body);
      expect(res.status, label).toBe(400);
      expect((await res.json()).error, label).toMatch(pattern);
    }
  });

  it("replanned day respects capacity on frozen + fresh loads", async () => {
    const { requests, assignments } = planBody();
    const nowMin = 660;
    const future = assignments.filter((a) => a.slotStart >= nowMin).slice(0, 3);
    const res = await post(replanPOST, {
      requests,
      assignments,
      disruptions: future.map((a) => ({ requestId: a.requestId, kind: "no-show" as const })),
      nowMin,
    });
    expect(res.status).toBe(200);
    const p = await res.json();
    const loads = loadBySlot(p.after);
    for (const [key, load] of loads) {
      const gate = Number(key.split(":")[0]) as GateId;
      expect(load, `replan route ${key}`).toBeLessThanOrEqual(capacityForGate(gate));
    }
  });
});
