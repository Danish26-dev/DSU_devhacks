/**
 * KLAIM Verification API — x402-protected.
 *
 *   POST /api/v1/verify/age
 *   Authorization: Bearer klm_...        (KLAIM agent access key)
 *   X-KLAIM-Agent-Id: agent_...
 *   X-PAYMENT: <x402 payment payload>    (absent on the first call)
 *
 * Order is load-bearing:
 *
 *   402 (official x402 SDK) → payment → GoPlausible → Algorand settlement
 *   → Strands provider agent → credential check → ZK verification → 200
 *
 * The protected verification result NEVER executes before settlement confirms.
 */
import { createFileRoute } from "@tanstack/react-router";

import { handleVerifyClaim } from "@/lib/klaim/server/verify.server";

/**
 * POST /api/v1/verify/age — the original age-only entrypoint. Kept stable for
 * the existing demo and MCP tool. Delegates to the shared, claim-generic
 * handler with claim=age_over_18.
 */
export async function handleVerifyAge(request: Request): Promise<Response> {
  return handleVerifyClaim(request, { claim: "age_over_18", path: "/api/v1/verify/age" });
}

export const Route = createFileRoute("/api/v1/verify/age")({
  server: { handlers: { POST: ({ request }) => handleVerifyAge(request) } },
});
