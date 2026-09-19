/**
 * Local MCP Test Client — a real MCP client speaking JSON-RPC to KLAIM.
 *
 * This is NOT Claude or GPT: it is a local harness that exercises the same
 * transport a real assistant would use.
 *
 *   bun run scripts/test-mcp.ts
 */
const BASE_URL = process.env["KLAIM_BASE_URL"] ?? "http://localhost:8080";
const AGENT_ID = process.env["KLAIM_AGENT_ID"];
const AGENT_KEY = process.env["KLAIM_AGENT_KEY"];
const DID = process.env["KLAIM_DEMO_DID"] ?? "did:identipi:demo-user-001";

if (!AGENT_ID || !AGENT_KEY) {
  console.error("Missing KLAIM_AGENT_ID / KLAIM_AGENT_KEY — provision an agent key in the Verifier console.");
  process.exit(1);
}

async function rpc(method: string, params: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}/api/public/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "X-KLAIM-Agent-Id": AGENT_ID!,
      Authorization: `Bearer ${AGENT_KEY!}`,
      ...extra,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main() {
  console.log("Local MCP Test Client → KLAIM\n-----------------------------\n");

  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "klaim-local-test-client", version: "1.0.0" } });
  console.log(`initialize → ${init.status}`);

  const tools = await rpc("tools/list", {});
  const names = (tools.json as { result?: { tools?: { name: string }[] } })?.result?.tools?.map((t) => t.name) ?? [];
  console.log(`tools/list → ${names.join(", ") || "none"}\n`);

  const call = await rpc("tools/call", { name: "verify_human_age", arguments: { did: DID } });
  console.log("tools/call verify_human_age →");
  console.log(JSON.stringify(call.json, null, 2));
  console.log(
    "\nA 402 here is the expected, correct behaviour without payment. Run `npm run test:x402` to complete a real Testnet settlement.",
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
