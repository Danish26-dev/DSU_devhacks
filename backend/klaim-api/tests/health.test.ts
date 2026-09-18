/**
 * Phase 1 foundation test: the backend app responds to GET /health.
 *
 * Exercises the app handler directly (no network) so it is fast and hermetic.
 */
import { describe, expect, it } from "bun:test";

import { MockPaymentAdapter } from "../src/adapters/payment-adapter";
import { MockVerificationAdapter } from "../src/adapters/verification-adapter";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { InMemoryVerificationRepository } from "../src/repositories/in-memory-verification-repository";

function makeApp() {
  return createApp({
    config: loadConfig(),
    repository: new InMemoryVerificationRepository(),
    paymentAdapter: new MockPaymentAdapter(),
    verificationAdapter: new MockVerificationAdapter(),
  });
}

describe("GET /health", () => {
  it("returns 200 with the service descriptor", async () => {
    const handle = makeApp();
    const res = await handle(new Request("http://localhost/health", { method: "GET" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("klaim-api");
  });

  it("also answers /api/health", async () => {
    const handle = makeApp();
    const res = await handle(new Request("http://localhost/api/health", { method: "GET" }));
    expect(res.status).toBe(200);
  });

  it("returns 404 for unknown routes", async () => {
    const handle = makeApp();
    const res = await handle(new Request("http://localhost/nope", { method: "GET" }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("not_found");
  });
});
