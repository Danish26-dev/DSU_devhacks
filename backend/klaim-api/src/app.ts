/**
 * KLAIM API application assembly.
 *
 * A tiny, framework-free request router built on the Web `Request`/`Response`
 * primitives (runs on Bun and any Node/Cloud Run container). Deliberately NOT a
 * copy of the legacy TanStack/Nitro route tree — the V2 backend is meant to be
 * independently understandable.
 *
 * Dependencies flow one way:
 *   routes → services → { repository (interface), adapters (interfaces) }
 * All collaborators are injected so stores/adapters can be swapped (in-memory +
 * mock now; Firestore + protocol/ZKP later) without touching handlers.
 *
 * Phase 2 exposes the verification-request lifecycle:
 *   POST /api/verification-requests
 *   GET  /api/verification-requests/:id
 *   POST /api/verification-requests/:id/consent
 *   GET  /api/verification-requests/:id/result
 * plus GET /health, and (dev only) mock settle/verify triggers.
 */
import type { KlaimApiConfig } from "./config";
import type { PaymentAdapter } from "./adapters/payment-adapter";
import type { VerificationAdapter } from "./adapters/verification-adapter";
import type { VerificationRepository } from "./repositories/verification-repository";
import { VerificationRequestService } from "./services/verification-request-service";
import { handleHealth } from "./routes/health";
import { apiError } from "./routes/errors";
import {
  handleConsent,
  handleCreateRequest,
  handleGetRequest,
  handleGetResult,
  handleListRequests,
} from "./routes/verification-requests";
import { handleDevSettle, handleDevVerify } from "./routes/dev-lifecycle";

export interface AppDeps {
  config: KlaimApiConfig;
  repository: VerificationRepository;
  paymentAdapter: PaymentAdapter;
  verificationAdapter: VerificationAdapter;
}

const REQUESTS_BASE = "/api/verification-requests";

/**
 * Compute CORS headers for a request. The request Origin is reflected ONLY when
 * it is in the configured allowlist — never a wildcard. When the allowlist is
 * empty (local dev with no ALLOWED_ORIGINS), no CORS headers are added and
 * same-origin/non-browser callers work unaffected.
 */
function corsHeaders(request: Request, allowedOrigins: string[]): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(response: Response, headers: Record<string, string>): Response {
  if (Object.keys(headers).length === 0) return response;
  const merged = new Headers(response.headers);
  for (const [k, v] of Object.entries(headers)) merged.set(k, v);
  return new Response(response.body, { status: response.status, headers: merged });
}

/**
 * Build the fetch handler. Returning a handler (rather than starting a server)
 * keeps the app unit-testable: tests call `handle(new Request(...))` directly.
 */
export function createApp(deps: AppDeps): (request: Request) => Promise<Response> {
  const service = new VerificationRequestService({
    repository: deps.repository,
    paymentAdapter: deps.paymentAdapter,
    verificationAdapter: deps.verificationAdapter,
  });

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const cors = corsHeaders(request, deps.config.allowedOrigins);

    // CORS preflight — answer allowlisted origins directly.
    if (method === "OPTIONS") {
      return new Response(null, { status: Object.keys(cors).length ? 204 : 403, headers: cors });
    }

    // Every route response gets CORS headers echoed back (when allowlisted).
    const respond = (r: Response | Promise<Response>) => Promise.resolve(r).then((res) => withCors(res, cors));

    // health
    if (method === "GET" && (path === "/health" || path === "/api/health")) {
      return respond(handleHealth());
    }

    // /api/verification-requests  — POST create, GET list (with query filters)
    if (path === REQUESTS_BASE) {
      if (method === "POST") return respond(handleCreateRequest(request, service));
      if (method === "GET") return respond(handleListRequests(url, service));
      return respond(apiError("METHOD_NOT_ALLOWED", `${method} not allowed on ${path}`));
    }

    // /api/verification-requests/:id[/consent|/result]
    if (path.startsWith(`${REQUESTS_BASE}/`)) {
      const rest = path.slice(REQUESTS_BASE.length + 1);
      const [id, sub] = rest.split("/");
      if (!id) return respond(apiError("NOT_FOUND", "Missing request id"));

      if (!sub) {
        if (method === "GET") return respond(handleGetRequest(id, service));
        return respond(apiError("METHOD_NOT_ALLOWED", `${method} not allowed on ${path}`));
      }
      if (sub === "consent") {
        if (method === "POST") return respond(handleConsent(id, request, service));
        return respond(apiError("METHOD_NOT_ALLOWED", `${method} not allowed on ${path}`));
      }
      if (sub === "result") {
        if (method === "GET") return respond(handleGetResult(id, service));
        return respond(apiError("METHOD_NOT_ALLOWED", `${method} not allowed on ${path}`));
      }
      return respond(apiError("NOT_FOUND", `No route for ${path}`));
    }

    // Lifecycle triggers (settle / verify). Available when dev adapters are on
    // OR when the real protocol/ZKP service is configured — in the latter case
    // these drive REAL settlement + proof (the adapters are swapped in
    // index.ts). They accept no client-injected payment/claim data; they only
    // invoke the server-side adapters, still gated by the state machine and the
    // NO SETTLEMENT → NO VERIFICATION invariant.
    const realAdaptersConfigured = Boolean(
      deps.config.protocolServiceUrl && deps.config.internalServiceToken,
    );
    if ((deps.config.devAdapters || realAdaptersConfigured) && path.startsWith("/api/dev/verification-requests/")) {
      const rest = path.slice("/api/dev/verification-requests/".length);
      const [id, action] = rest.split("/");
      if (id && action === "settle" && method === "POST") return respond(handleDevSettle(id, service));
      if (id && action === "verify" && method === "POST") return respond(handleDevVerify(id, service));
      return respond(apiError("NOT_FOUND", `No lifecycle route for ${method} ${path}`));
    }

    return respond(apiError("NOT_FOUND", `No route for ${method} ${path}`));
  };
}
