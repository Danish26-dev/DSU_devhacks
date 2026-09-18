/**
 * Verification request state machine.
 *
 * The single authority on which status transitions are legal. Route handlers
 * and the lifecycle service MUST go through here — no ad-hoc status mutation.
 *
 * Canonical happy path (docs/STATE_MACHINE.md, docs/ARCHITECTURE.md §4):
 *
 *   CREATED → PENDING_CONSENT → CONSENT_GRANTED → PAYMENT_REQUIRED
 *   → PAYMENT_SETTLED → VERIFYING → PROOF_GENERATED → VERIFIED
 *
 * Failure branches:
 *   PENDING_CONSENT   → DENIED
 *   PAYMENT_REQUIRED  → PAYMENT_FAILED
 *   VERIFYING         → CREDENTIAL_INVALID
 *   VERIFYING         → VERIFICATION_FAILED
 *
 * INVARIANT (non-negotiable): NO SETTLEMENT → NO VERIFICATION.
 * A request may only enter VERIFYING/PROOF_GENERATED/VERIFIED when its payment
 * is SETTLED. This is enforced both structurally (the transition table only
 * allows VERIFYING from PAYMENT_SETTLED) and defensively via `assertSettled`.
 */
import type {
  PaymentState,
  VerificationRequest,
  VerificationRequestStatus,
} from "@klaim/types";

/** Adjacency table of allowed transitions. Absence = forbidden. */
const TRANSITIONS: Record<VerificationRequestStatus, readonly VerificationRequestStatus[]> = {
  CREATED: ["PENDING_CONSENT"],
  PENDING_CONSENT: ["CONSENT_GRANTED", "DENIED"],
  CONSENT_GRANTED: ["PAYMENT_REQUIRED"],
  PAYMENT_REQUIRED: ["PAYMENT_SETTLED", "PAYMENT_FAILED"],
  PAYMENT_SETTLED: ["VERIFYING"],
  VERIFYING: ["PROOF_GENERATED", "CREDENTIAL_INVALID", "VERIFICATION_FAILED"],
  PROOF_GENERATED: ["VERIFIED"],
  // terminal states — no outgoing transitions
  VERIFIED: [],
  DENIED: [],
  PAYMENT_FAILED: [],
  CREDENTIAL_INVALID: [],
  VERIFICATION_FAILED: [],
};

/** Statuses that require payment.status === "SETTLED" to be entered. */
const REQUIRES_SETTLEMENT: readonly VerificationRequestStatus[] = [
  "VERIFYING",
  "PROOF_GENERATED",
  "VERIFIED",
];

export function isTerminal(status: VerificationRequestStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function allowedNext(status: VerificationRequestStatus): readonly VerificationRequestStatus[] {
  return TRANSITIONS[status];
}

/** Pure check: is `from → to` a structurally legal transition? */
export function canTransition(
  from: VerificationRequestStatus,
  to: VerificationRequestStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Error thrown for an illegal transition. Carries a stable code. */
export class InvalidStateTransitionError extends Error {
  readonly code = "INVALID_STATE_TRANSITION" as const;
  constructor(
    readonly from: VerificationRequestStatus,
    readonly to: VerificationRequestStatus,
    message?: string,
  ) {
    super(message ?? `Request cannot transition from ${from} to ${to}`);
    this.name = "InvalidStateTransitionError";
  }
}

/** Error thrown when the settlement invariant would be violated. */
export class SettlementRequiredError extends Error {
  readonly code = "SETTLEMENT_REQUIRED" as const;
  constructor(readonly to: VerificationRequestStatus) {
    super(`Cannot enter ${to} without a settled payment (NO SETTLEMENT → NO VERIFICATION)`);
    this.name = "SettlementRequiredError";
  }
}

/**
 * Validate a proposed transition against BOTH the transition table and the
 * settlement invariant. Throws on violation; returns void when legal.
 */
export function assertTransition(
  from: VerificationRequestStatus,
  to: VerificationRequestStatus,
  payment: PaymentState,
): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
  if (REQUIRES_SETTLEMENT.includes(to) && payment.status !== "SETTLED") {
    // Defensive second gate. The table already blocks reaching these states
    // without passing through PAYMENT_SETTLED, but we never trust that alone.
    throw new SettlementRequiredError(to);
  }
}

/**
 * Produce a new request object with the status advanced. Pure — does not persist.
 * Validates the transition (throws on violation) and stamps updatedAt.
 */
export function transition(
  request: VerificationRequest,
  to: VerificationRequestStatus,
  updatedAt: string,
): VerificationRequest {
  assertTransition(request.status, to, request.payment);
  return { ...request, status: to, updatedAt };
}
