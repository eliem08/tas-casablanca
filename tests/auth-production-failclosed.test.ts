/**
 * Regression: the demo auth provider trusted the client-controlled
 * `x-demo-role` header unconditionally, so a production build would let any
 * caller send `x-demo-role: admin` and approve recommendations.
 * Production must fail closed unless ENABLE_DEMO_AUTH=true is set explicitly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST as recPOST } from "../app/api/recommendations/route";
import { POST as recApprovePOST } from "../app/api/recommendations/[id]/approve/route";
import { authProvider, demoAuthEnabled } from "../lib/server/auth";
import { clearRateLimits } from "../lib/server/rate-limit";
import { recommendationStore } from "../lib/server/stores";

function validRecommendationPayload() {
  return {
    payload: {
      type: "reschedule",
      appointmentId: "appt_0123456789ABCDEFGHJKMNPQRS",
      newSlotStartUtc: "2026-10-20T09:00:00Z",
      newSlotEndUtc: "2026-10-20T09:30:00Z",
      reason: "gate congestion at original slot",
    },
    rationale: "Moving the truck one slot later avoids the predicted 08:00 queue peak.",
  };
}

async function proposeAndApprove(role: string) {
  const created = await recPOST(
    new Request("http://localhost/api/recommendations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validRecommendationPayload()),
    }),
  );
  expect(created.status).toBe(201);
  const id = String(((await created.json()) as Record<string, unknown>).id);
  const res = await recApprovePOST(
    new Request(`http://localhost/api/recommendations/${id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-role": role },
      body: JSON.stringify({ decision: "approve", reason: "spoofed" }),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { id, status: res.status };
}

describe("demo auth fails closed in production", () => {
  beforeEach(() => clearRateLimits());
  afterEach(() => vi.unstubAllEnvs());

  it("outside production the demo header still works (dev/test flows)", async () => {
    expect(demoAuthEnabled()).toBe(true);
    
    const { status } = await proposeAndApprove("approver");
    expect(status).toBe(200);
  });

  it("in production a spoofed x-demo-role: admin cannot approve", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEMO_AUTH", "");
    expect(demoAuthEnabled()).toBe(false);
    
    const ctx = await authProvider.getAuthContext(
      new Request("http://localhost/", { headers: { "x-demo-role": "admin" } }),
    );
    expect(ctx.roles).toEqual([]);
    const { id, status } = await proposeAndApprove("admin");
    expect(status).toBe(403);
    expect(recommendationStore.get(id)?.status).toBe("proposed");
  });

  it("production with explicit ENABLE_DEMO_AUTH=true re-enables the demo (opt-in only)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEMO_AUTH", "true");
    expect(demoAuthEnabled()).toBe(true);
    
  });
});
