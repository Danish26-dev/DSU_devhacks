/**
 * ProtocolPaymentAdapter mapping + CORS behavior.
 *
 * The adapter is exercised against a stubbed global fetch so no network is hit.
 */
import { afterEach, describe, expect, it } from "bun:test";

import { ProtocolPaymentAdapter } from "../src/adapters/protocol-payment-adapter";
import { makeApp, testConfig, VALID_CREATE } from "./helpers";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(body: unknown, ok = true) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status: ok ? 200 : 402,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("ProtocolPaymentAdapter", () => {
  const adapter = new ProtocolPaymentAdapter({ baseUrl: "http://protocol.test", token: "t" });

  it("maps SETTLED + txId → SETTLED PaymentState", async () => {
    stubFetch({
      requestId: "REQ-1",
      status: "SETTLED",
      txId: "JIPIICFVGY2FRNRJLT47HY4DTIHS5O3ZVBKVGHMQIIHMOFKGLIAQ",
      network: "algorand:testnet",
      asset: "USDC",
      amount: 0.01,
      explorerUrl: "https://lora.algokit.io/testnet/transaction/JIPI",
      timestamp: "2026-09-18T12:48:02.082Z",
    });
    const state = await adapter.settle({ requestId: "REQ-1", amountUsdc: 0.01 });
    expect(state.status).toBe("SETTLED");
    expect(state.txId).toBe("JIPIICFVGY2FRNRJLT47HY4DTIHS5O3ZVBKVGHMQIIHMOFKGLIAQ");
    expect(state.explorerUrl).toContain("lora");
  });

  it("maps FAILED (no txId) → FAILED", async () => {
    stubFetch({ requestId: "REQ-1", status: "FAILED", txId: null, reason: "settlement_not_confirmed" }, false);
    const state = await adapter.settle({ requestId: "REQ-1", amountUsdc: 0.01 });
    expect(state.status).toBe("FAILED");
    expect(state.txId).toBeNull();
  });

  it("maps X402_NOT_CONFIGURED / malformed → FAILED (never fabricates txId)", async () => {
    stubFetch({ error: "X402_NOT_CONFIGURED" }, false);
    const state = await adapter.settle({ requestId: "REQ-1", amountUsdc: 0.01 });
    expect(state.status).toBe("FAILED");
    expect(state.txId).toBeNull();
  });

  it("treats a network error as FAILED", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const state = await adapter.settle({ requestId: "REQ-1", amountUsdc: 0.01 });
    expect(state.status).toBe("FAILED");
    expect(state.txId).toBeNull();
  });
});

describe("CORS", () => {
  const origin = "https://quickdrop-atnwarjo4q-el.a.run.app";

  it("reflects an allowlisted origin and answers preflight", async () => {
    const handle = makeApp(testConfig({ allowedOrigins: [origin] }));
    const preflight = await handle(
      new Request("http://localhost/api/verification-requests", {
        method: "OPTIONS",
        headers: { Origin: origin },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(origin);

    const post = await handle(
      new Request("http://localhost/api/verification-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(VALID_CREATE),
      }),
    );
    expect(post.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  });

  it("does NOT reflect a non-allowlisted origin (never wildcard)", async () => {
    const handle = makeApp(testConfig({ allowedOrigins: [origin] }));
    const res = await handle(
      new Request("http://localhost/health", { method: "GET", headers: { Origin: "https://evil.example" } }),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
