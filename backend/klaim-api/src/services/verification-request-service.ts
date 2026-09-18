/**
 * VerificationRequestService — the central verification lifecycle orchestrator
 * and source of truth for verification state.
 *
 * Depends on abstractions only:
 *   - VerificationRepository   (persistence; in-memory now, Firestore later)
 *   - PaymentAdapter           (settlement; mock now, services/protocol later)
 *   - VerificationAdapter      (verify+proof; mock now, Idina/ZKP later)
 *
 * Every status change goes through the state machine, which enforces legal
 * transitions and the invariant NO SETTLEMENT → NO VERIFICATION. The service
 * contains no HTTP concepts.
 */
import type {
  ClaimType,
  ConsentRecord,
  VerificationDecision,
  VerificationRequest,
  VerificationResult,
} from "@klaim/types";
import { nowIso } from "@klaim/utils";

import type { PaymentAdapter } from "../adapters/payment-adapter";
import type { VerificationAdapter } from "../adapters/verification-adapter";
import { createVerificationRequest } from "../domain/verification-request";
import { transition } from "../domain/verification-state-machine";
import type { VerificationRepository } from "../repositories/verification-repository";

/** Stable domain error codes surfaced to the HTTP layer. */
export type ServiceErrorCode =
  | "NOT_FOUND"
  | "INVALID_STATE_TRANSITION"
  | "SETTLEMENT_REQUIRED"
  | "CONSENT_NOT_PENDING";

export class ServiceError extends Error {
  constructor(readonly code: ServiceErrorCode, message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface VerificationRequestServiceDeps {
  repository: VerificationRepository;
  paymentAdapter: PaymentAdapter;
  verificationAdapter: VerificationAdapter;
  /** Per-verification price in USDC. Defaults to 0.01. */
  priceUsdc?: number;
}

export class VerificationRequestService {
  private readonly repo: VerificationRepository;
  private readonly payment: PaymentAdapter;
  private readonly verification: VerificationAdapter;
  private readonly priceUsdc: number;

  constructor(deps: VerificationRequestServiceDeps) {
    this.repo = deps.repository;
    this.payment = deps.paymentAdapter;
    this.verification = deps.verificationAdapter;
    this.priceUsdc = deps.priceUsdc ?? 0.01;
  }

  /** Create a request. Server generates the id; ends in PENDING_CONSENT. */
  async create(input: {
    verifierId: string;
    userDid: string;
    claims: ClaimType[];
  }): Promise<VerificationRequest> {
    // Domain constructor returns a request already advanced to PENDING_CONSENT
    // (CREATED is the transient starting point). Persist and return.
    const request = createVerificationRequest(input);
    return this.repo.create(request);
  }

  async get(requestId: string): Promise<VerificationRequest | null> {
    return this.repo.getById(requestId);
  }

  /** List requests, optionally filtered by subject DID and/or status. */
  async list(query?: { userDid?: string; status?: VerificationRequest["status"] }): Promise<VerificationRequest[]> {
    return this.repo.list(query);
  }

  private async load(requestId: string): Promise<VerificationRequest> {
    const found = await this.repo.getById(requestId);
    if (!found) throw new ServiceError("NOT_FOUND", `Verification request ${requestId} not found`);
    return found;
  }

  /**
   * Apply a consent decision.
   *   ALLOW: PENDING_CONSENT → CONSENT_GRANTED → PAYMENT_REQUIRED
   *   DENY:  PENDING_CONSENT → DENIED
   * Rejected unless the request is currently PENDING_CONSENT.
   */
  async applyConsent(
    requestId: string,
    decision: VerificationDecision,
  ): Promise<VerificationRequest> {
    const request = await this.load(requestId);
    if (request.status !== "PENDING_CONSENT") {
      throw new ServiceError(
        "CONSENT_NOT_PENDING",
        `Consent can only be applied while PENDING_CONSENT (current: ${request.status})`,
      );
    }

    const consent: ConsentRecord = { decision, at: nowIso() };

    if (decision === "DENY") {
      const denied = transition({ ...request, consent }, "DENIED", nowIso());
      return this.persist(denied);
    }

    // ALLOW: advance through CONSENT_GRANTED to PAYMENT_REQUIRED.
    const granted = transition({ ...request, consent }, "CONSENT_GRANTED", nowIso());
    const awaitingPayment = transition(granted, "PAYMENT_REQUIRED", nowIso());
    return this.persist(awaitingPayment);
  }

  /**
   * MOCK/DEV settlement transition: PAYMENT_REQUIRED → PAYMENT_SETTLED (or
   * PAYMENT_FAILED). Delegates to the PaymentAdapter. The real protocol service
   * replaces the adapter without changing this method.
   */
  async settlePayment(requestId: string): Promise<VerificationRequest> {
    const request = await this.load(requestId);
    if (request.status !== "PAYMENT_REQUIRED") {
      throw new ServiceError(
        "INVALID_STATE_TRANSITION",
        `Settlement requires PAYMENT_REQUIRED (current: ${request.status})`,
      );
    }

    const payment = await this.payment.settle({
      requestId: request.requestId,
      amountUsdc: request.payment.amount ?? this.priceUsdc,
    });

    if (payment.status !== "SETTLED") {
      const failed = transition({ ...request, payment }, "PAYMENT_FAILED", nowIso());
      return this.persist({
        ...failed,
        failure: { status: "PAYMENT_FAILED", reason: "Settlement was not confirmed" },
      });
    }

    // Record the settled payment on the request BEFORE the settlement-gated
    // transition, so the state machine sees payment.status === "SETTLED".
    const settled = transition({ ...request, payment }, "PAYMENT_SETTLED", nowIso());
    return this.persist(settled);
  }

  /**
   * MOCK/DEV verification: PAYMENT_SETTLED → VERIFYING → (PROOF_GENERATED →
   * VERIFIED | CREDENTIAL_INVALID | VERIFICATION_FAILED).
   *
   * The settlement invariant is enforced by the state machine: entering
   * VERIFYING throws unless payment.status === "SETTLED".
   */
  async runVerification(requestId: string): Promise<VerificationRequest> {
    const request = await this.load(requestId);

    // transition() throws SettlementRequiredError if payment is not settled —
    // this is the NO SETTLEMENT → NO VERIFICATION guarantee.
    const verifying = transition(request, "VERIFYING", nowIso());
    await this.persist(verifying);

    const outcome = await this.verification.verify({
      requestId: verifying.requestId,
      userDid: verifying.userDid,
      claims: verifying.claims,
    });

    if (outcome.kind === "credential_invalid") {
      const failed = transition(verifying, "CREDENTIAL_INVALID", nowIso());
      return this.persist({
        ...failed,
        failure: { status: "CREDENTIAL_INVALID", reason: outcome.reason },
      });
    }
    if (outcome.kind === "verification_failed") {
      const failed = transition(verifying, "VERIFICATION_FAILED", nowIso());
      return this.persist({
        ...failed,
        failure: { status: "VERIFICATION_FAILED", reason: outcome.reason },
      });
    }

    // proven: VERIFYING → PROOF_GENERATED → VERIFIED
    const withProof = transition(
      { ...verifying, proof: outcome.proof, claimResults: outcome.claimResults },
      "PROOF_GENERATED",
      nowIso(),
    );
    await this.persist(withProof);

    const verified = transition(withProof, "VERIFIED", nowIso());
    const saved = await this.persist(verified);

    await this.repo.saveResult(saved.requestId, this.toResult(saved));
    return saved;
  }

  /** Fetch the stored result, or derive it from the request if verified. */
  async getResult(requestId: string): Promise<VerificationResult | null> {
    const stored = await this.repo.getResult(requestId);
    if (stored) return stored;
    const request = await this.repo.getById(requestId);
    if (!request) return null;
    return this.toResult(request);
  }

  private toResult(request: VerificationRequest): VerificationResult {
    return {
      requestId: request.requestId,
      status: request.status,
      claims: request.claimResults,
      proof: request.proof,
      payment: request.payment,
    };
  }

  /** Persist a full request snapshot via the repository patch API. */
  private async persist(request: VerificationRequest): Promise<VerificationRequest> {
    const updated = await this.repo.update(request.requestId, {
      status: request.status,
      consent: request.consent,
      payment: request.payment,
      proof: request.proof,
      claimResults: request.claimResults,
      failure: request.failure,
      updatedAt: request.updatedAt,
    });
    if (!updated) {
      throw new ServiceError("NOT_FOUND", `Verification request ${request.requestId} vanished`);
    }
    return updated;
  }
}
