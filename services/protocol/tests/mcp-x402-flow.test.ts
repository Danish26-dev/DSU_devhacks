/**
 * Integration test: MCP → verify_human_age → KLAIM API → 402 → payment
 * → GoPlausible → Algorand Testnet → provider agent → result.
 *
 * Requires a running dev server (KLAIM_BASE_URL, default http://localhost:8080)
 * and a provisioned agent key. Payment-dependent assertions are skipped —
 * loudly — when the Testnet payer configuration is absent, so the suite never
 * "passes" against a fabricated transaction.
 */
import { describe, expect, it } from "vitest";

const BASE_URL = process.env["KLAIM_BASE_URL"] ?? "http://localhost:8080";
const AGENT_ID = process.env["KLAIM_AGENT_ID"] ?? "";
const AGENT_KEY = process.env["KLAIM_AGENT_KEY"] ?? "";
const DID = process.env["KLAIM_DEMO_DID"] ?? "did:identipi:demo-user-001";
const PAYER_READY = Boolean(process.env["PAYER_PRIVATE_KEY"] && process.env["PAYER_WALLET_ADDRESS"]);

const authHeaders = {
  "Content-Type": "application/json",
  "X-KLAIM-Agent-Id": AGENT_ID,
  Authorization: `Bearer ${AGENT_KEY}`,
};

async function rpc(method: string, params: unknown, headers: Record<string, string> = authHeaders) {
  const res = await fetch(`${BASE_URL}/api/public/mcp`, {
    method: "POST",
    headers: { ...headers, Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

describe("MCP → x402 → provider agent", () => {
  it("rejects unauthenticated MCP calls", async () => {
    const res = await rpc("tools/list", {}, { "Content-Type": "application/json" });
    expect(res.status).toBe(401);
  });

  it("exposes the verify_human_age tool", async () => {
    const res = await rpc("tools/list", {});
    expect(res.status).toBe(200);
    const tools = ((res.json?.["result"] as { tools?: { name: string }[] } | undefined)?.tools ?? []).map((t) => t.name);
    expect(tools).toContain("verify_human_age");
  });

  it("returns 402 for verification without payment", async () => {
    const res = await fetch(`${BASE_URL}/api/v1/verify/age`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ did: DID }),
    });
    expect([402, 503]).toContain(res.status);
    if (res.status === 503) {
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe("X402_NOT_CONFIGURED");
      return;
    }
    // x402 v2 returns requirements in the PAYMENT-REQUIRED header (base64 JSON).
    const header = res.headers.get("payment-required");
    expect(header).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(header!, "base64").toString()) as { accepts: { network: string }[] };
    expect(decoded.accepts?.[0]?.network).toMatch(/^algorand:/);
  });

  it.skipIf(!PAYER_READY)("settles a real payment and returns a real transaction id", async () => {
    const { runPaidVerification } = await import("./helpers/paid-verification");
    const result = await runPaidVerification({ baseUrl: BASE_URL, headers: authHeaders, did: DID });

    expect(result.status).toBe(200);
    expect(result.body.verified).toBe(true);
    expect(result.body.payment?.status).toBe("settled");

    const txId = result.body.payment?.txId ?? "";
    expect(txId).not.toBe("");
    expect(txId).not.toMatch(/mock|demo|placeholder|test/i);

    const onChain = await fetch(`https://testnet-idx.algonode.cloud/v2/transactions/${txId}`);
    expect(onChain.status).toBe(200);
  }, 120_000);
});
