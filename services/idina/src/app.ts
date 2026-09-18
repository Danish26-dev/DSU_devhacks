/**
 * Idina HTTP app — framework-free, built on Web Request/Response so it runs on
 * Node (via a thin adapter in index.ts) or any container. Endpoints:
 *
 *   GET  /health
 *   POST /orchestrate
 *   GET  /orchestrate/:requestId   (debug/status)
 *
 * Idina is INTERNAL (KLAIM API → Idina, server-to-server). It is not exposed to
 * browsers and needs no CORS. Consent is read from the KLAIM API when
 * KLAIM_API_URL is set; a request body may also carry an explicit consent
 * decision for standalone/demo runs (documented in docs/IDINA.md).
 */
import type { ClaimType, VerificationDecision } from "@klaim/types";

// The canonical claim set (mirrors @klaim/types CLAIM_TYPES). Kept as a local
// runtime constant so Idina does not depend on the shared package's bundler-
// style barrel at runtime (it runs on Node's native TS via strip-types). The
// TYPE ClaimType is still imported from @klaim/types, so any drift is caught by
// the typechecker.
const CLAIM_TYPES: readonly ClaimType[] = ["identity_verified", "age_over_18", "license_valid"];

import { runAgent } from "./agent.ts";
import { KlaimApiClient } from "./clients/klaim-api.client.ts";
import type { IdinaConfig } from "./config.ts";
import type { Harnesses } from "./harnesses/types.ts";
import { log } from "./logger.ts";
import { orchestrate, type OrchestrationResult } from "./orchestrator.ts";

export interface AppDeps {
  config: IdinaConfig;
  harnesses: Harnesses;
  klaimApi: KlaimApiClient;
}

interface OrchestrateBody {
  requestId?: string;
  userDid?: string;
  claims?: unknown;
  consent?: VerificationDecision;
  amountUsdc?: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function toResponseBody(r: OrchestrationResult & { runtime?: string }) {
  return {
    requestId: r.requestId,
    status: r.status,
    claims: r.claims,
    proofId: r.proofId,
    txId: r.txId,
    ...(r.reason ? { reason: r.reason } : {}),
    ...(r.runtime ? { runtime: r.runtime } : {}),
    steps: r.steps,
  };
}

export function createApp(deps: AppDeps): (request: Request) => Promise<Response> {
  // Small in-memory store of the last result per requestId (debug endpoint).
  const results = new Map<string, ReturnType<typeof toResponseBody>>();

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "GET" && (path === "/health" || path === "/")) {
      return json({ status: "ok", service: "idina", mode: deps.config.mode });
    }

    if (method === "POST" && path === "/orchestrate") {
      let body: OrchestrateBody;
      try {
        body = (await request.json()) as OrchestrateBody;
      } catch {
        return json({ error: "invalid_request", message: "Body must be JSON" }, 400);
      }

      if (!body.requestId || !body.userDid) {
        return json({ error: "invalid_request", message: "requestId and userDid are required" }, 400);
      }
      const claims = Array.isArray(body.claims) ? (body.claims as unknown[]) : [];
      if (claims.length === 0 || !claims.every((c) => CLAIM_TYPES.includes(c as ClaimType))) {
        return json({ error: "invalid_request", message: "claims must be a non-empty array of supported claim types" }, 422);
      }

      // Resolve consent: prefer the KLAIM API (system of record); fall back to
      // an explicit body decision for standalone/demo runs.
      let consent: VerificationDecision | null = body.consent ?? null;
      const snapshot = await deps.klaimApi.getRequest(body.requestId);
      if (snapshot) consent = snapshot.consent.decision;

      const input = {
        requestId: body.requestId,
        userDid: body.userDid,
        claims: claims as ClaimType[],
        consent,
        ...(body.amountUsdc !== undefined ? { amountUsdc: body.amountUsdc } : {}),
      };

      const result =
        deps.config.mode === "agent"
          ? await runAgent(input, deps.harnesses, deps.config)
          : { ...(await orchestrate(input, deps.harnesses)), runtime: "deterministic" as const };

      const responseBody = toResponseBody(result);
      results.set(body.requestId, responseBody);
      return json(responseBody, result.status === "COMPLETED" ? 200 : 200);
    }

    if (method === "GET" && path.startsWith("/orchestrate/")) {
      const requestId = decodeURIComponent(path.slice("/orchestrate/".length));
      const found = results.get(requestId);
      if (!found) return json({ error: "not_found", requestId }, 404);
      return json(found);
    }

    log.warn("route.not_found", { method, path });
    return json({ error: "not_found", message: `No route for ${method} ${path}` }, 404);
  };
}
