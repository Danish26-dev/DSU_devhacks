# services/mcp

The KLAIM MCP (Model Context Protocol) server is **not a separate deployable
service** — it is served by the protocol app as part of the same Cloud Run
deployment (one combined service = one deployable unit, matching how it runs
in production).

## Where the MCP endpoint lives

- **Source:** `services/protocol/src/routes/api/public/mcp.ts`
  (transport + tool routing) and
  `services/protocol/src/lib/klaim/server/mcp.server.ts`
  (tool registry + JSON-RPC handling).
- **Live endpoint:** `POST {PROTOCOL_SERVICE_URL}/api/public/mcp`
  (Streamable HTTP, JSON-RPC 2.0, spec 2025-06-18).

## Tools exposed

- `verify_human_age`
- `verify_driving_licence`
- `verify_identity`
- `get_verification_status`

## Auth

Each MCP call carries the verifier's KLAIM agent credential
(`X-KLAIM-Agent-Id` + `Authorization: Bearer klm_...`). The MCP layer contains
no payment or ZK logic — it is a thin interface that calls the same
verification API, which owns the x402 boundary and delegates proofs to the ZK
service (`services/zkp`).

This folder intentionally documents where MCP lives rather than duplicating it
as a second service, so the repo layout matches the real single deployment.
