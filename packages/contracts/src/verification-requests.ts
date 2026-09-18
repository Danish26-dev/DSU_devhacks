/**
 * API-level contracts for the KLAIM V2 verification-request endpoints.
 *
 * These describe the request/response shapes of backend/klaim-api. They mirror
 * docs/API_CONTRACT.md. Phase 1 defines the contracts only — the endpoints
 * themselves are implemented in a later phase.
 *
 * Validation approach: lightweight, dependency-free runtime guards for the
 * inbound bodies. (A future phase may swap these for zod schemas shared with the
 * backend; the exported TypeScript shapes stay stable regardless.)
 */
import type {
  ClaimType,
  VerificationDecision,
  VerificationRequestStatus,
  VerificationResult,
} from "@klaim/types";
import { CLAIM_TYPES } from "@klaim/types";

/* ----------------------------- POST /api/verification-requests ----------- */

export interface CreateVerificationRequestBody {
  verifierId: string;
  userDid: string;
  claims: ClaimType[];
}

export interface CreateVerificationRequestResponse {
  requestId: string;
  status: VerificationRequestStatus; // "PENDING_CONSENT" immediately after creation
}

/* ------------------------------ GET /api/verification-requests/:id -------- */

export interface GetVerificationRequestResponse {
  requestId: string;
  status: VerificationRequestStatus;
  verifierId: string;
  userDid: string;
  claims: ClaimType[];
  consent: { decision: VerificationDecision | null; at: string | null };
  payment: { status: "REQUIRED" | "SETTLED" | "FAILED"; txId: string | null };
  createdAt: string;
  updatedAt: string;
}

/* ---------------------- POST /api/verification-requests/:id/consent ------- */

export interface ConsentBody {
  decision: VerificationDecision;
}

export interface ConsentResponse {
  requestId: string;
  status: VerificationRequestStatus; // "CONSENT_GRANTED" or "DENIED"
}

/* --------------------- GET /api/verification-requests/:id/result ---------- */

export type GetVerificationResultResponse = VerificationResult;

/* --------------------------------------------------------- validators ----- */

/** Narrow an unknown value to a valid create-request body, or return an error string. */
export function parseCreateVerificationRequest(
  input: unknown,
): { ok: true; value: CreateVerificationRequestBody } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = input as Record<string, unknown>;

  if (typeof b["verifierId"] !== "string" || b["verifierId"].length === 0) {
    return { ok: false, error: "verifierId must be a non-empty string" };
  }
  if (typeof b["userDid"] !== "string" || b["userDid"].length < 6) {
    return { ok: false, error: "userDid must be a DID string" };
  }
  if (!Array.isArray(b["claims"]) || b["claims"].length === 0) {
    return { ok: false, error: "claims must be a non-empty array" };
  }
  for (const c of b["claims"]) {
    if (!CLAIM_TYPES.includes(c as ClaimType)) {
      return { ok: false, error: `Unsupported claim: ${String(c)}` };
    }
  }

  return {
    ok: true,
    value: {
      verifierId: b["verifierId"],
      userDid: b["userDid"],
      claims: b["claims"] as ClaimType[],
    },
  };
}

/** Narrow an unknown value to a valid consent body, or return an error string. */
export function parseConsentBody(
  input: unknown,
): { ok: true; value: ConsentBody } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const decision = (input as Record<string, unknown>)["decision"];
  if (decision !== "ALLOW" && decision !== "DENY") {
    return { ok: false, error: 'decision must be "ALLOW" or "DENY"' };
  }
  return { ok: true, value: { decision: decision as VerificationDecision } };
}
