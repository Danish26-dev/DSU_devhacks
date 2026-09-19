/**
 * POST /api/v1/verify/licence — x402-protected driving-licence verification.
 *
 * Contract claim: `license_valid` (American spelling on the wire). The route
 * path uses the internal British spelling to match KLAIM's existing naming; the
 * claim reported in the response is always the contract id.
 */
import { createFileRoute } from "@tanstack/react-router";

import { handleVerifyClaim } from "@/lib/klaim/server/verify.server";

export async function handleVerifyLicence(request: Request): Promise<Response> {
  return handleVerifyClaim(request, { claim: "license_valid", path: "/api/v1/verify/licence" });
}

export const Route = createFileRoute("/api/v1/verify/licence")({
  server: { handlers: { POST: ({ request }) => handleVerifyLicence(request) } },
});
