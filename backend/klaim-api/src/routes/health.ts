/**
 * GET /health — liveness/readiness probe.
 *
 * Phase 1 scope: proves the V2 backend starts independently. Returns a simple
 * JSON body. No verification-request endpoints are implemented in this phase.
 */
export function handleHealth(): Response {
  return Response.json({ status: "ok", service: "klaim-api" });
}
