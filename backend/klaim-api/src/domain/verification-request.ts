/**
 * Domain model for a verification request.
 *
 * This is the backend's own representation of the source-of-truth entity. It is
 * kept separate from HTTP handlers and from the shared wire contracts: the HTTP
 * layer maps between @klaim/contracts shapes and this domain model.
 *
 * Phase 1 defines the shape and a constructor only. The state-machine
 * transition logic (CREATED → … → VERIFIED) is implemented in a later phase.
 */
import type {
  ClaimType,
  ConsentRecord,
  PaymentState,
  VerificationRequest,
  VerificationRequestStatus,
} from "@klaim/types";
import { newRequestId, nowIso } from "@klaim/utils";

/** The persisted domain entity. Mirrors @klaim/types VerificationRequest. */
export type VerificationRequestEntity = VerificationRequest;

const initialConsent: ConsentRecord = { decision: null, at: null };

const initialPayment: PaymentState = {
  status: "REQUIRED",
  txId: null,
  network: null,
  asset: null,
  amount: null,
  explorerUrl: null,
  timestamp: null,
};

/**
 * Build a new verification request in its initial state.
 *
 * A freshly created request is `PENDING_CONSENT` (per docs/API_CONTRACT.md:
 * creation moves CREATED → PENDING_CONSENT). We record CREATED as the transient
 * starting point and immediately advance to PENDING_CONSENT here so the entity
 * is always returned in a consistent, quotable state.
 */
export function createVerificationRequest(input: {
  verifierId: string;
  userDid: string;
  claims: ClaimType[];
}): VerificationRequestEntity {
  const at = nowIso();
  const status: VerificationRequestStatus = "PENDING_CONSENT";
  return {
    requestId: newRequestId(),
    verifierId: input.verifierId,
    userDid: input.userDid,
    claims: [...input.claims],
    status,
    consent: { ...initialConsent },
    payment: { ...initialPayment },
    proof: null,
    claimResults: {},
    failure: null,
    createdAt: at,
    updatedAt: at,
  };
}
