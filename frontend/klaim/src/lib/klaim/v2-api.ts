/**
 * KLAIM V2 API client — talks to backend/klaim-api over HTTP.
 *
 * This is the NEW V2 data path (distinct from the legacy browser client in
 * api.ts, which targeted the old monolith's /api/v1 routes). It uses the shared
 * @klaim/contracts + @klaim/types so the frontend never redefines domain shapes.
 *
 * The consent / verification-request experience uses this client.
 */
import type {
  ConsentResponse,
  CreateVerificationRequestBody,
  CreateVerificationRequestResponse,
  GetVerificationRequestResponse,
} from "@klaim/contracts";
import type {
  ClaimType,
  PaymentState,
  ProofResult,
  VerificationDecision,
  VerificationRequestStatus,
} from "@klaim/types";

const API_URL: string =
  (import.meta.env.VITE_KLAIM_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:8080";

/**
 * Shape returned by GET /result. Before VERIFIED the backend returns
 * `{ requestId, status, result: null }`; once VERIFIED it returns the full
 * VerificationResult (claims + proof + payment). We model both so the UI can
 * read the real proofId / engine / txId — never fabricated.
 */
export interface VerificationResultResponse {
  requestId: string;
  status: VerificationRequestStatus;
  claims?: Partial<Record<ClaimType, boolean>>;
  proof?: ProofResult | null;
  payment?: PaymentState;
  /** Legacy flat field some responses include alongside `proof`. */
  proofId?: string | null;
  result?: null;
}

export class V2ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "V2ApiError";
  }
}
export class V2ApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "V2ApiUnavailableError";
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new V2ApiUnavailableError(`KLAIM API is not reachable at ${API_URL}`);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (body["error"] ?? {}) as { code?: string; message?: string };
    throw new V2ApiError(res.status, err.code ?? "error", err.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const klaimV2 = {
  apiUrl: API_URL,

  createRequest(input: CreateVerificationRequestBody) {
    return req<CreateVerificationRequestResponse>("/api/verification-requests", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  getRequest(requestId: string) {
    return req<GetVerificationRequestResponse>(`/api/verification-requests/${encodeURIComponent(requestId)}`);
  },
  /**
   * List verification requests for a subject DID, optionally filtered by status.
   * The wallet uses this to discover requests awaiting its consent (created by
   * a verifier such as QuickDrop).
   */
  async listRequests(userDid: string, status?: VerificationRequestStatus) {
    const params = new URLSearchParams({ userDid });
    if (status) params.set("status", status);
    const body = await req<{ requests: GetVerificationRequestResponse[] }>(
      `/api/verification-requests?${params.toString()}`,
    );
    return body.requests ?? [];
  },
  consent(requestId: string, decision: VerificationDecision) {
    return req<ConsentResponse>(`/api/verification-requests/${encodeURIComponent(requestId)}/consent`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
  },
  getResult(requestId: string) {
    return req<VerificationResultResponse>(`/api/verification-requests/${encodeURIComponent(requestId)}/result`);
  },

  /** DEV/DEMO only: mock settle + verify (backend gated by KLAIM_DEV_ADAPTERS). */
  devSettle(requestId: string) {
    return req<{ requestId: string; status: VerificationRequestStatus }>(
      `/api/dev/verification-requests/${encodeURIComponent(requestId)}/settle`,
      { method: "POST" },
    );
  },
  devVerify(requestId: string) {
    return req<{ requestId: string; status: VerificationRequestStatus }>(
      `/api/dev/verification-requests/${encodeURIComponent(requestId)}/verify`,
      { method: "POST" },
    );
  },
};
