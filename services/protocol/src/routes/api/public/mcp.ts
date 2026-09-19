/**
 * KLAIM MCP endpoint (Streamable HTTP, JSON-RPC 2.0).
 *
 *   POST https://<app>/api/public/mcp
 *   X-KLAIM-Agent-Id: agent_...
 *   Authorization: Bearer klm_...
 *
 * Lives under /api/public/* so external MCP clients (Claude, Cursor, custom
 * agents) can reach it without site auth; the handler authenticates
 * every caller with the verifier's KLAIM agent access key.
 */
import { createFileRoute } from "@tanstack/react-router";

import {
  MCP_PROTOCOL_VERSION,
  PAID_TOOLS,
  authenticateMcpRequest,
  handleRpc,
  type JsonRpcRequest,
  type McpTool,
} from "@/lib/klaim/server/mcp.server";
import { handleVerifyAge } from "../v1/verify/age";
import { handleVerifyLicence } from "../v1/verify/licence";
import { handleVerifyIdentity } from "../v1/verify/identity";
import { handlePaymentStatus } from "../payments/$requestId.status";
import {
  payerConfigured,
  missingPayerEnv,
  signPaymentFromResponse,
} from "@/lib/klaim/server/x402-client.server";

/** Route a paid verification tool to its in-process handler by endpoint. */
function verificationHandlerFor(endpoint: string): (request: Request) => Promise<Response> {
  switch (endpoint) {
    case "/api/v1/verify/age":
      return handleVerifyAge;
    case "/api/v1/verify/licence":
      return handleVerifyLicence;
    case "/api/v1/verify/identity":
      return handleVerifyIdentity;
    default:
      throw new Error(`No verification handler for endpoint ${endpoint}`);
  }
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-KLAIM-Agent-Id, X-PAYMENT, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version",
};

/**
 * Honest, human-readable description of how the proof was produced, read from
 * the actual verification response. Only claims "Midnight zero-knowledge proof"
 * when the engine genuinely is "midnight"; otherwise labels it a local
 * abstraction. Never overclaims.
 */
function proofPhrase(json: Record<string, unknown>): string {
  const proof = json["proof"] as { engine?: string; id?: string } | undefined;
  const engine = proof?.engine;
  const id = proof?.id ? ` (${proof.id})` : "";
  if (engine === "midnight") {
    return `Verified with a real Midnight zero-knowledge circuit${id} — the private value never left the prover.`;
  }
  if (engine === "local") {
    return `Verified with KLAIM's local proof abstraction${id} (not a Midnight ZK proof).`;
  }
  return "";
}

async function POST({ request }: { request: Request }): Promise<Response> {
  const { agent, error } = await authenticateMcpRequest(request);
  if (!agent) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: error ?? "Unauthorized" } },
      { status: 401, headers: CORS },
    );
  }

  let payload: JsonRpcRequest | JsonRpcRequest[];
  try {
    payload = (await request.json()) as JsonRpcRequest | JsonRpcRequest[];
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: CORS },
    );
  }

  // The MCP layer forwards to the x402-protected Verification API.
  // If a 402 is returned and payer config exists, it signs and retries server-side.
  const callTool = async (tool: McpTool, args: Record<string, unknown>) => {
    console.log(`[KLAIM MCP] ${tool.name} requested`);

    const baseHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "X-KLAIM-Agent-Id": request.headers.get("X-KLAIM-Agent-Id") ?? "",
      Authorization: request.headers.get("Authorization") ?? "",
    };

    // ---- read-only status tool (free, no x402) ------------------------------
    if (!PAID_TOOLS.has(tool.name)) {
      const requestId = String(args["requestId"] ?? "");
      if (!requestId) {
        return {
          isError: true,
          content: "get_verification_status requires a requestId.",
          structured: { error: "MISSING_REQUEST_ID" },
        };
      }
      const statusRequest = new Request(new URL(tool.endpoint, request.url).toString(), {
        method: "GET",
        headers: baseHeaders,
      });
      const statusRes = await handlePaymentStatus(statusRequest, requestId);
      const statusJson = (await statusRes.json()) as Record<string, unknown>;
      if (!statusRes.ok) {
        return {
          isError: true,
          content: `Could not read status: ${String(statusJson["message"] ?? statusJson["error"])}`,
          structured: statusJson,
        };
      }
      return {
        isError: false,
        content: `Request ${requestId}: payment ${String(statusJson["paymentStatus"])}.`,
        structured: statusJson,
      };
    }

    // ---- paid verification tools (x402-gated) -------------------------------
    const verificationHandler = verificationHandlerFor(tool.endpoint);

    // If the incoming MCP request already carries X-PAYMENT (external wallet), forward it
    if (request.headers.get("X-PAYMENT")) {
      baseHeaders["X-PAYMENT"] = request.headers.get("X-PAYMENT")!;
    }

    const apiRequest = new Request(new URL(tool.endpoint, request.url).toString(), {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify(args),
    });

    console.log("[KLAIM x402] Requesting payment requirements");
    const res = await verificationHandler(apiRequest);

    // If not 402, return directly (200 success or other error)
    if (res.status !== 402) {
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        return {
          isError: true,
          content: `KLAIM verification failed: ${String(json["message"] ?? json["error"])}`,
          structured: json,
        };
      }
      console.log("[KLAIM MCP] Returning verification result");
      return {
        isError: false,
        content: `${json["claim"]} = ${String(json["verified"])}. ${proofPhrase(json)} No date of birth, Aadhaar, PAN, address or document was disclosed.`,
        structured: json,
      };
    }

    // 402 received — attempt server-side payment if payer is configured
    console.log("[KLAIM x402] 402 received");

    if (!payerConfigured()) {
      console.log("[KLAIM x402] Payer not configured — cannot complete payment");
      return {
        isError: true,
        content: `Payment required but payer wallet is not configured server-side. Missing: ${missingPayerEnv().join(", ")}. Configure PAYER_WALLET_ADDRESS and PAYER_PRIVATE_KEY to enable automatic payment.`,
        structured: { error: "PAYER_NOT_CONFIGURED", missing: missingPayerEnv() },
      };
    }

    // Sign payment using the same mechanism as scripts/test-x402.ts
    let paymentHeaders: Record<string, string>;
    try {
      paymentHeaders = await signPaymentFromResponse(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[KLAIM x402] Payment signing failed:", msg);
      return {
        isError: true,
        content: `Payment signing failed: ${msg}`,
        structured: { error: "PAYMENT_SIGNING_FAILED", message: msg },
      };
    }

    // Retry with payment attached
    console.log("[KLAIM x402] X-PAYMENT attached, retrying");
    const paidRequest = new Request(new URL(tool.endpoint, request.url).toString(), {
      method: "POST",
      headers: { ...baseHeaders, ...paymentHeaders },
      body: JSON.stringify(args),
    });

    const paidRes = await verificationHandler(paidRequest);
    const paidJson = (await paidRes.json()) as Record<string, unknown>;

    if (paidRes.status !== 200) {
      const msg = String(paidJson["message"] ?? paidJson["error"] ?? "Settlement failed");
      console.error("[KLAIM x402] Settlement/verification failed:", msg);
      return {
        isError: true,
        content: `Payment submitted but verification failed: ${msg}`,
        structured: paidJson,
      };
    }

    // Success — real payment settled, verification complete
    const payment = paidJson["payment"] as { txId?: string; explorerUrl?: string } | undefined;
    console.log(`[KLAIM x402] Settlement successful`);
    console.log(`[KLAIM x402] Algorand TX: ${payment?.txId ?? "unknown"}`);
    console.log("[KLAIM MCP] Returning verification result");

    return {
      isError: false,
      content: `${paidJson["claim"]} = ${String(paidJson["verified"])}. ${proofPhrase(paidJson)} No date of birth, Aadhaar, PAN, address or document was disclosed. Payment settled on Algorand Testnet: ${payment?.explorerUrl ?? payment?.txId ?? ""}`,
      structured: paidJson,
    };
  };

  const messages = Array.isArray(payload) ? payload : [payload];
  const responses = (
    await Promise.all(messages.map((m) => handleRpc(m, { agent, callTool })))
  ).filter(Boolean);

  if (responses.length === 0) return new Response(null, { status: 202, headers: CORS });

  return Response.json(Array.isArray(payload) ? responses : responses[0], {
    headers: { ...CORS, "MCP-Protocol-Version": MCP_PROTOCOL_VERSION },
  });
}

export const Route = createFileRoute("/api/public/mcp")({
  server: {
    handlers: {
      POST,
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () =>
        Response.json(
          { error: "method_not_allowed", message: "KLAIM MCP uses JSON-RPC over POST." },
          { status: 405, headers: CORS },
        ),
    },
  },
});
