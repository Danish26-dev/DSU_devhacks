/**
 * KLAIM API client for QuickDrop.
 *
 * QuickDrop is a VERIFIER: it creates a verification request against the live
 * KLAIM API and tracks its status. It never receives the user's documents —
 * only the verified claim answers. Consent is granted by the user in their own
 * KLAIM identity wallet (a separate app); QuickDrop cannot drive that. The two
 * apps meet through the shared KLAIM API and the same requestId.
 *
 * Base URL comes from VITE_KLAIM_API_URL (baked at build time). If it's unset,
 * DEMO_MODE is on and the client also self-drives the dev settle/verify
 * endpoints so QuickDrop can complete a full flow on its own for a demo.
 */

const RAW_API = (import.meta.env.VITE_KLAIM_API_URL as string | undefined)?.replace(/\/$/, "");
export const API_URL = RAW_API ?? "https://klaim-api-atnwarjo4q-el.a.run.app";
/** When the API URL wasn't explicitly configured, run in self-driving demo mode. */
export const DEMO_MODE = !RAW_API;

export type ClaimType = "identity_verified" | "age_over_18" | "license_valid";

export type VerificationStatus =
  | "CREATED"
  | "PENDING_CONSENT"
  | "CONSENT_GRANTED"
  | "PAYMENT_REQUIRED"
  | "PAYMENT_SETTLED"
  | "VERIFYING"
  | "PROOF_GENERATED"
  | "VERIFIED"
  | "DENIED"
  | "PAYMENT_FAILED"
  | "CREDENTIAL_INVALID"
  | "VERIFICATION_FAILED";

export const ALL_CLAIMS: ClaimType[] = ["identity_verified", "age_over_18", "license_valid"];

export interface CreateResponse {
  requestId: string;
  status: VerificationStatus;
}

export interface RequestSnapshot {
  requestId: string;
  status: VerificationStatus;
  verifierId: string;
  userDid: string;
  claims: ClaimType[];
  consent: { decision: "ALLOW" | "DENY" | null; at: string | null };
  payment: { status: "REQUIRED" | "SETTLED" | "FAILED"; txId: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface ResultResponse {
  requestId: string;
  status: VerificationStatus;
  claims?: Partial<Record<ClaimType, boolean>>;
  proofId?: string | null;
  proof?: { proofId: string; engine: "local" | "midnight"; notDisclosed: string[] } | null;
  payment?: { status: string; txId: string | null; network?: string | null; amount?: number | null; explorerUrl?: string | null };
  result?: null;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
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
    throw new ApiError(0, `KLAIM API is not reachable at ${API_URL}`);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (body["error"] ?? {}) as { message?: string };
    throw new ApiError(res.status, err.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const klaim = {
  apiUrl: API_URL,
  demoMode: DEMO_MODE,

  createRequest(userDid: string, claims: ClaimType[]) {
    return req<CreateResponse>("/api/verification-requests", {
      method: "POST",
      body: JSON.stringify({ verifierId: "quickdrop", userDid, claims }),
    });
  },
  getRequest(id: string) {
    return req<RequestSnapshot>(`/api/verification-requests/${encodeURIComponent(id)}`);
  },
  getResult(id: string) {
    return req<ResultResponse>(`/api/verification-requests/${encodeURIComponent(id)}/result`);
  },

  /** Verifier-paid settlement: QuickDrop (the verifier) pays for the
   *  verification. Called once the request reaches PAYMENT_REQUIRED (i.e. the
   *  user has consented). Real settlement when the API has the protocol service
   *  configured; mock otherwise. */
  settle(id: string) {
    return req(`/api/dev/verification-requests/${encodeURIComponent(id)}/settle`, { method: "POST" });
  },
  /** Trigger verification/proof generation once payment is settled. */
  verify(id: string) {
    return req(`/api/dev/verification-requests/${encodeURIComponent(id)}/verify`, { method: "POST" });
  },

  /** DEMO self-drive: grant consent too (only when there's no separate wallet).
   *  Used only in DEMO_MODE. */
  async demoConsent(id: string) {
    try {
      await req(`/api/verification-requests/${encodeURIComponent(id)}/consent`, {
        method: "POST",
        body: JSON.stringify({ decision: "ALLOW" }),
      });
    } catch {
      /* best-effort */
    }
  },
};
