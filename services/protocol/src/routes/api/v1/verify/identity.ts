/**
 * POST /api/v1/verify/identity — x402-protected identity verification.
 *
 * Contract claim: `identity_verified`. Returns only a boolean claim result and
 * proof descriptor — never DOB, Aadhaar, PAN, address or document data.
 */
import { createFileRoute } from "@tanstack/react-router";

import { handleVerifyClaim } from "@/lib/klaim/server/verify.server";

export async function handleVerifyIdentity(request: Request): Promise<Response> {
  return handleVerifyClaim(request, {
    claim: "identity_verified",
    path: "/api/v1/verify/identity",
  });
}

export const Route = createFileRoute("/api/v1/verify/identity")({
  server: { handlers: { POST: ({ request }) => handleVerifyIdentity(request) } },
});
