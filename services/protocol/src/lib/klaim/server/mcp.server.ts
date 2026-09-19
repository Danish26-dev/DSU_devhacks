/**
 * KLAIM MCP server — real Model Context Protocol implementation.
 *
 * Transport: MCP Streamable HTTP (JSON-RPC 2.0 over POST), spec revision
 * 2025-06-18. Mounted by src/routes/api/public/mcp.ts.
 *
 * Architecture boundary (deliberate): the MCP server contains NO x402 logic,
 * no payment code and no ZK code. Each tool is a thin caller of the KLAIM
 * Verification API, which owns the x402 middleware:
 *
 *   Claude / agent → KLAIM MCP server → KLAIM Verification API
 *                    → x402 middleware → GoPlausible → Algorand Testnet
 *                    → verification / ZK layer → MCP result → Claude
 *
 * Authentication: every request must carry the verifier's agent credential
 * (`X-KLAIM-Agent-Id` + `Authorization: Bearer klm_...`). That key is a KLAIM
 * API credential only — never a wallet key, seed phrase or signing secret.
 */
import { repository, type AgentRecord } from "./store.server";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Endpoint on the KLAIM Verification API this tool calls. */
  endpoint: string;
}

/**
 * Tool registry — add future tools (verify_driving_licence, verify_residency,
 * verify_credential) here; nothing else in the transport needs to change.
 */
export const MCP_TOOLS: McpTool[] = [
  {
    name: "verify_human_age",
    title: "Verify human age",
    description:
      "Ask KLAIM whether the human behind a DID is over 18. Returns only a boolean claim result — never date of birth, Aadhaar, PAN, address or any document. Each call is billed per request through x402 on Algorand.",
    endpoint: "/api/v1/verify/age",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Subject DID, e.g. did:identipi:demo-7x82" },
        requestId: {
          type: "string",
          description: "Optional KLAIM verification request id (REQ-...) to correlate the result.",
        },
      },
      required: ["did"],
      additionalProperties: false,
    },
  },
  {
    name: "verify_driving_licence",
    title: "Verify driving licence",
    description:
      "Ask KLAIM whether the human behind a DID holds a valid driving licence. Returns only the boolean claim (license_valid) — never the licence number or any document. Billed per request through x402 on Algorand.",
    endpoint: "/api/v1/verify/licence",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Subject DID, e.g. did:identipi:demo-7x82" },
        requestId: {
          type: "string",
          description: "Optional KLAIM verification request id (REQ-...) to correlate the result.",
        },
      },
      required: ["did"],
      additionalProperties: false,
    },
  },
  {
    name: "verify_identity",
    title: "Verify identity",
    description:
      "Ask KLAIM whether the human behind a DID has a verified identity. Returns only the boolean claim (identity_verified) — never Aadhaar, PAN, address or any document. Billed per request through x402 on Algorand.",
    endpoint: "/api/v1/verify/identity",
    inputSchema: {
      type: "object",
      properties: {
        did: { type: "string", description: "Subject DID, e.g. did:identipi:demo-7x82" },
        requestId: {
          type: "string",
          description: "Optional KLAIM verification request id (REQ-...) to correlate the result.",
        },
      },
      required: ["did"],
      additionalProperties: false,
    },
  },
  {
    name: "get_verification_status",
    title: "Get verification status",
    description:
      "Read the current settlement/verification status for a KLAIM verification request by its requestId. Read-only and free — does not trigger a payment or a new verification.",
    endpoint: "/api/payments/$requestId/status",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", description: "KLAIM verification request id, e.g. REQ-123" },
      },
      required: ["requestId"],
      additionalProperties: false,
    },
  },
];

/** Tools that trigger a paid x402 verification (vs. read-only status). */
export const PAID_TOOLS = new Set([
  "verify_human_age",
  "verify_driving_licence",
  "verify_identity",
]);

export interface McpAuthResult {
  agent: AgentRecord | null;
  error?: string;
}

export async function authenticateMcpRequest(request: Request): Promise<McpAuthResult> {
  const agentId = request.headers.get("X-KLAIM-Agent-Id");
  const authorization = request.headers.get("Authorization");
  const key = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : null;
  if (!agentId || !key) {
    return {
      agent: null,
      error: "Missing X-KLAIM-Agent-Id or Authorization bearer agent access key",
    };
  }
  const agent = await repository.authenticateAgent(agentId, key);
  if (!agent) return { agent: null, error: "Invalid or revoked KLAIM agent credential" };
  return { agent };
}

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function result(id: string | number | null | undefined, value: unknown) {
  return { jsonrpc: "2.0" as const, id: id ?? null, result: value };
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } };
}

/**
 * Handles a single JSON-RPC message. `callTool` is injected so the transport
 * route owns the HTTP call into the Verification API (keeping this module free
 * of payment/verification concerns).
 */
export async function handleRpc(
  message: JsonRpcRequest,
  ctx: {
    agent: AgentRecord;
    callTool: (
      tool: McpTool,
      args: Record<string, unknown>,
    ) => Promise<{ content: string; isError: boolean; structured?: unknown }>;
  },
): Promise<object | null> {
  switch (message.method) {
    case "initialize":
      return result(message.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "klaim", title: "KLAIM", version: "1.0.0" },
        instructions:
          "KLAIM verifies humans for AI agents without disclosing their identity documents. Call verify_human_age with the subject's DID; the result is a single boolean claim. Verification is paid per request via x402 on Algorand.",
      });

    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return result(message.id, {});

    case "tools/list":
      return result(message.id, {
        tools: MCP_TOOLS.filter(
          (t) => ctx.agent.tools.length === 0 || ctx.agent.tools.includes(t.name),
        ).map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
        })),
      });

    case "tools/call": {
      const name = (message.params?.["name"] as string) ?? "";
      const args = (message.params?.["arguments"] as Record<string, unknown>) ?? {};
      const tool = MCP_TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(message.id, -32602, `Unknown tool: ${name}`);
      if (ctx.agent.tools.length > 0 && !ctx.agent.tools.includes(tool.name)) {
        return rpcError(message.id, -32602, `Agent is not permitted to call ${tool.name}`);
      }
      const outcome = await ctx.callTool(tool, args);
      return result(message.id, {
        content: [{ type: "text", text: outcome.content }],
        ...(outcome.structured ? { structuredContent: outcome.structured } : {}),
        isError: outcome.isError,
      });
    }

    default:
      return rpcError(message.id, -32601, `Method not found: ${message.method}`);
  }
}
