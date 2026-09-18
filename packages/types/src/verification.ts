/**
 * Canonical KLAIM V2 verification domain types.
 *
 * These are the single source of truth for the verification lifecycle. Services
 * and applications import these rather than redefining status strings or claim
 * identifiers. No implementation logic lives here — types only.
 *
 * See docs/ARCHITECTURE.md (§4 state machine) and docs/API_CONTRACT.md.
 */

/* --------------------------------------------------------------- claims */

/**
 * The claims KLAIM can verify. V2 spelling is `license_valid` (American).
 * The legacy root app used `licence_valid`; that spelling is confined to
 * legacy code and never used in the V2 contract.
 */
export type ClaimType = "identity_verified" | "age_over_18" | "license_valid";

export const CLAIM_TYPES: readonly ClaimType[] = [
  "identity_verified",
  "age_over_18",
  "license_valid",
] as const;

/* -------------------------------------------------------- state machine */

/**
 * The verification request lifecycle. Happy path:
 *
 *   CREATED → PENDING_CONSENT → CONSENT_GRANTED → PAYMENT_REQUIRED
 *   → PAYMENT_SETTLED → VERIFYING → PROOF_GENERATED → VERIFIED
 *
 * The invariant NO SETTLEMENT → NO VERIFICATION is enforced by the backend at
 * the PAYMENT_SETTLED → VERIFYING transition (implemented in a later phase).
 */
export type VerificationRequestStatus =
  | "CREATED"
  | "PENDING_CONSENT"
  | "CONSENT_GRANTED"
  | "PAYMENT_REQUIRED"
  | "PAYMENT_SETTLED"
  | "VERIFYING"
  | "PROOF_GENERATED"
  | "VERIFIED"
  // failure / terminal states
  | "DENIED"
  | "PAYMENT_FAILED"
  | "CREDENTIAL_INVALID"
  | "VERIFICATION_FAILED";

export const VERIFICATION_REQUEST_STATUSES: readonly VerificationRequestStatus[] = [
  "CREATED",
  "PENDING_CONSENT",
  "CONSENT_GRANTED",
  "PAYMENT_REQUIRED",
  "PAYMENT_SETTLED",
  "VERIFYING",
  "PROOF_GENERATED",
  "VERIFIED",
  "DENIED",
  "PAYMENT_FAILED",
  "CREDENTIAL_INVALID",
  "VERIFICATION_FAILED",
] as const;

/** Terminal failure states — no further transitions are allowed from these. */
export const TERMINAL_FAILURE_STATUSES: readonly VerificationRequestStatus[] = [
  "DENIED",
  "PAYMENT_FAILED",
  "CREDENTIAL_INVALID",
  "VERIFICATION_FAILED",
] as const;

/* ------------------------------------------------------------- consent */

export type VerificationDecision = "ALLOW" | "DENY";

export interface ConsentRecord {
  decision: VerificationDecision | null;
  /** ISO-8601 timestamp of the decision, or null while pending. */
  at: string | null;
}

/* ------------------------------------------------------------- payment */

export type PaymentStatus = "REQUIRED" | "SETTLED" | "FAILED";

export interface PaymentState {
  status: PaymentStatus;
  /** Real Algorand Testnet transaction id. null until a settlement occurs — never fabricated. */
  txId: string | null;
  network: string | null;
  asset: "USDC" | null;
  amount: number | null;
  explorerUrl: string | null;
  timestamp: string | null;
}

/* --------------------------------------------------------------- proof */

/** Proof engine identifier. `local` is deterministic; `midnight` is a real ZK circuit. */
export type ProofEngine = "local" | "midnight";

export interface ProofResult {
  proofId: string;
  engine: ProofEngine;
  /** Inputs deliberately not disclosed to the verifier (privacy surface). */
  notDisclosed: string[];
}

/* --------------------------------------------------------------- claim */

/** A single requested claim and its resolved boolean result (null until resolved). */
export interface VerificationClaim {
  type: ClaimType;
  result: boolean | null;
}

/* ------------------------------------------------------------- request */

export interface VerificationRequest {
  requestId: string;
  verifierId: string;
  userDid: string;
  claims: ClaimType[];
  status: VerificationRequestStatus;
  consent: ConsentRecord;
  payment: PaymentState;
  /** Proof descriptor, populated once PROOF_GENERATED. null before. */
  proof: ProofResult | null;
  /** Resolved claim booleans, populated during verification. */
  claimResults: Partial<Record<ClaimType, boolean>>;
  /** Failure reason, populated only when the request enters a failure state. */
  failure: VerificationFailure | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------- failure */

/** Machine-readable reason attached to a request that entered a failure state. */
export interface VerificationFailure {
  status: Extract<
    VerificationRequestStatus,
    "DENIED" | "PAYMENT_FAILED" | "CREDENTIAL_INVALID" | "VERIFICATION_FAILED"
  >;
  reason: string;
}

/* -------------------------------------------------------------- result */

export interface VerificationResult {
  requestId: string;
  status: VerificationRequestStatus;
  /** Resolved claim booleans, keyed by claim type. */
  claims: Partial<Record<ClaimType, boolean>>;
  proof: ProofResult | null;
  payment: PaymentState;
}

/* --------------------------------------------------------------- error */

export type VerificationErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "spend_limit_exceeded"
  | "payment_required"
  | "payment_failed"
  | "credential_invalid"
  | "verification_failed"
  | "internal_error";

export interface VerificationError {
  error: VerificationErrorCode;
  message: string;
}
