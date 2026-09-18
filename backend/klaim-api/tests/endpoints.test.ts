/**
 * HTTP endpoint tests: request creation, status, consent, result, the full
 * flow through the dev triggers, request validation, and error codes.
 */
import { describe, expect, it } from "bun:test";

import { makeApp, VALID_CREATE } from "./helpers";

function post(path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
function get(path: string) {
  return new Request(`http://localhost${path}`, { method: "GET" });
}

async function createRequest(handle: (r: Request) => Promise<Response>) {
  const res = await handle(post("/api/verification-requests", VALID_CREATE));
  const body = (await res.json()) as { requestId: string; status: string };
  return { res, body };
}

describe("POST /api/verification-requests", () => {
  it("creates a request → 201 PENDING_CONSENT", async () => {
    const handle = makeApp();
    const { res, body } = await createRequest(handle);
    expect(res.status).toBe(201);
    expect(body.status).toBe("PENDING_CONSENT");
    expect(body.requestId).toMatch(/^REQ-[A-Z0-9]{8}$/);
  });

  it("client cannot set the request id (server generates it)", async () => {
    const handle = makeApp();
    const res = await handle(post("/api/verification-requests", { ...VALID_CREATE, requestId: "REQ-HACKED00" }));
    const body = (await res.json()) as { requestId: string };
    expect(body.requestId).not.toBe("REQ-HACKED00");
  });
});

describe("request validation", () => {
  const handle = makeApp();
  const bad: [string, unknown, number][] = [
    ["missing verifierId", { userDid: "did:identipi:x", claims: ["age_over_18"] }, 400],
    ["missing userDid", { verifierId: "q", claims: ["age_over_18"] }, 400],
    ["empty claims", { verifierId: "q", userDid: "did:identipi:x", claims: [] }, 400],
    ["unsupported claim", { verifierId: "q", userDid: "did:identipi:x", claims: ["passport"] }, 422],
    ["licence_valid (wrong spelling)", { verifierId: "q", userDid: "did:identipi:x", claims: ["licence_valid"] }, 422],
    ["duplicate claims", { verifierId: "q", userDid: "did:identipi:x", claims: ["age_over_18", "age_over_18"] }, 400],
  ];
  for (const [name, body, status] of bad) {
    it(`rejects ${name} → ${status}`, async () => {
      const res = await handle(post("/api/verification-requests", body));
      expect(res.status).toBe(status);
    });
  }
});

describe("GET /api/verification-requests/:id", () => {
  it("returns the canonical status; never leaks credential contents", async () => {
    const handle = makeApp();
    const { body } = await createRequest(handle);
    const res = await handle(get(`/api/verification-requests/${body.requestId}`));
    expect(res.status).toBe(200);
    const status = (await res.json()) as Record<string, unknown>;
    expect(status["status"]).toBe("PENDING_CONSENT");
    expect(status["claims"]).toEqual([...VALID_CREATE.claims]);
    // no raw document / PII fields
    expect(status["document"]).toBeUndefined();
    expect(status["dateOfBirth"]).toBeUndefined();
  });

  it("404 for unknown request", async () => {
    const handle = makeApp();
    const res = await handle(get("/api/verification-requests/REQ-NOPE0000"));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/verification-requests/:id/consent", () => {
  it("ALLOW → PAYMENT_REQUIRED", async () => {
    const handle = makeApp();
    const { body } = await createRequest(handle);
    const res = await handle(post(`/api/verification-requests/${body.requestId}/consent`, { decision: "ALLOW" }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("PAYMENT_REQUIRED");
  });

  it("DENY → DENIED", async () => {
    const handle = makeApp();
    const { body } = await createRequest(handle);
    const res = await handle(post(`/api/verification-requests/${body.requestId}/consent`, { decision: "DENY" }));
    expect(((await res.json()) as { status: string }).status).toBe("DENIED");
  });

  it("invalid decision → 400", async () => {
    const handle = makeApp();
    const { body } = await createRequest(handle);
    const res = await handle(post(`/api/verification-requests/${body.requestId}/consent`, { decision: "MAYBE" }));
    expect(res.status).toBe(400);
  });

  it("consent when not PENDING_CONSENT → 409", async () => {
    const handle = makeApp();
    const { body } = await createRequest(handle);
    await handle(post(`/api/verification-requests/${body.requestId}/consent`, { decision: "ALLOW" }));
    const res = await handle(post(`/api/verification-requests/${body.requestId}/consent`, { decision: "ALLOW" }));
    expect(res.status).toBe(409);
  });
});

describe("full flow via dev triggers", () => {
  it("create → consent → settle → verify → VERIFIED, then GET result", async () => {
    const handle = makeApp(); // testConfig has devAdapters=true
    const { body } = await createRequest(handle);
    const id = body.requestId;

    await handle(post(`/api/verification-requests/${id}/consent`, { decision: "ALLOW" }));

    const settle = await handle(post(`/api/dev/verification-requests/${id}/settle`));
    expect(((await settle.json()) as { status: string }).status).toBe("PAYMENT_SETTLED");

    const verify = await handle(post(`/api/dev/verification-requests/${id}/verify`));
    expect(((await verify.json()) as { status: string }).status).toBe("VERIFIED");

    const resultRes = await handle(get(`/api/verification-requests/${id}/result`));
    expect(resultRes.status).toBe(200);
    const result = (await resultRes.json()) as { status: string; claims: Record<string, boolean>; proofId: string };
    expect(result.status).toBe("VERIFIED");
    expect(result.claims).toEqual({ identity_verified: true, age_over_18: true, license_valid: true });
    expect(result.proofId).toMatch(/^mock-proof-/);
  });

  it("CRITICAL: verify before settle is blocked (409) and request stays PAYMENT_REQUIRED", async () => {
    const handle = makeApp();
    const { body } = await createRequest(handle);
    const id = body.requestId;
    await handle(post(`/api/verification-requests/${id}/consent`, { decision: "ALLOW" }));

    // skip settle, go straight to verify
    const verify = await handle(post(`/api/dev/verification-requests/${id}/verify`));
    expect(verify.status).toBe(409);

    const status = await handle(get(`/api/verification-requests/${id}`));
    expect(((await status.json()) as { status: string }).status).toBe("PAYMENT_REQUIRED");
  });
});

describe("GET result before verified", () => {
  it("returns current status with null result", async () => {
    const handle = makeApp();
    const { body } = await createRequest(handle);
    const res = await handle(get(`/api/verification-requests/${body.requestId}/result`));
    expect(res.status).toBe(200);
    const j = (await res.json()) as { status: string; result: unknown };
    expect(j.status).toBe("PENDING_CONSENT");
    expect(j.result).toBeNull();
  });
});

describe("dev endpoints are gated", () => {
  it("404 when devAdapters is disabled", async () => {
    const { testConfig } = await import("./helpers");
    const handle = makeApp(testConfig({ devAdapters: false }));
    const { body } = await createRequest(handle);
    const res = await handle(post(`/api/dev/verification-requests/${body.requestId}/settle`));
    expect(res.status).toBe(404);
  });
});
