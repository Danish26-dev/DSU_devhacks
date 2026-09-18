/**
 * Orchestrator core — the deterministic verification sequence, shared by BOTH
 * IDINA_MODE=agent and IDINA_MODE=deterministic. The agent mode lets Gemini
 * decide WHICH harness to call; this module is the source of truth for the
 * PREREQUISITE GATES so the LLM can never skip a step or fabricate a result.
 *
 * Order (each gate blocks the next):
 *   consent granted  →  credentials valid  →  payment SETTLED  →  proof generated  →  VERIFIED
 *
 * NON-NEGOTIABLE: NO SETTLEMENT → NO VERIFICATION. Proof generation is never
 * attempted unless the payment harness reports a real SETTLED txId.
 */
import type { ClaimType, VerificationDecision } from "@klaim/types";

import type { Harnesses } from "./harnesses/types.ts";
import { log } from "./logger.ts";

export type OrchestrationStatus =
  | "COMPLETED"
  | "DENIED"
  | "CREDENTIAL_INVALID"
  | "PAYMENT_FAILED"
  | "VERIFICATION_FAILED";

export interface OrchestrationInput {
  requestId: string;
  userDid: string;
  claims: ClaimType[];
  /** Resolved consent decision (read from KLAIM API by the caller). */
  consent: VerificationDecision | null;
  amountUsdc?: number;
}

export interface OrchestrationStep {
  harness: "consent" | "wallet" | "payment" | "zkp";
  ok: boolean;
  detail: string;
}

export interface OrchestrationResult {
  requestId: string;
  status: OrchestrationStatus;
  claims: Partial<Record<ClaimType, boolean>>;
  proofId: string | null;
  txId: string | null;
  reason?: string;
  steps: OrchestrationStep[];
}

/**
 * Run the gated sequence with the three harnesses. Pure w.r.t. state — returns
 * a structured result; the HTTP layer / KLAIM API records authoritative state.
 */
export async function orchestrate(
  input: OrchestrationInput,
  harnesses: Harnesses,
): Promise<OrchestrationResult> {
  const steps: OrchestrationStep[] = [];
  const started = Date.now();
  const base = { requestId: input.requestId } as const;

  const fail = (status: OrchestrationStatus, reason: string): OrchestrationResult => {
    log.warn("orchestration.blocked", { ...base, status, reason, ms: Date.now() - started });
    return { requestId: input.requestId, status, claims: {}, proofId: null, txId: null, reason, steps };
  };

  // GATE 0 — consent. Idina never proceeds without CONSENT_GRANTED.
  const consentOk = input.consent === "ALLOW";
  steps.push({ harness: "consent", ok: consentOk, detail: `consent=${input.consent ?? "PENDING"}` });
  log.info("harness.consent", { ...base, decision: input.consent ?? "PENDING" });
  if (!consentOk) return fail("DENIED", "consent_not_granted");

  // GATE 1 — wallet / credential harness.
  const creds = await harnesses.wallet.getUserCredentials({
    requestId: input.requestId,
    userDid: input.userDid,
    requestedClaims: input.claims,
  });
  steps.push({
    harness: "wallet",
    ok: creds.allClaimsCovered,
    detail: `${creds.credentials.length} credential(s), allClaimsCovered=${creds.allClaimsCovered}`,
  });
  log.info("harness.wallet", { ...base, credentials: creds.credentials.length, covered: creds.allClaimsCovered });
  if (!creds.allClaimsCovered) return fail("CREDENTIAL_INVALID", "claims_not_covered_by_valid_credentials");
  const credentialRefs = creds.credentials.filter((c) => c.status === "VALID").map((c) => c.credentialRef);

  // GATE 2 — payment settlement. NO SETTLEMENT → NO VERIFICATION.
  const payment = await harnesses.payment.verifyPaymentSettlement({
    requestId: input.requestId,
    ...(input.amountUsdc !== undefined ? { amountUsdc: input.amountUsdc } : {}),
  });
  const settled = payment.status === "SETTLED" && Boolean(payment.txId);
  steps.push({ harness: "payment", ok: settled, detail: `payment=${payment.status} tx=${payment.txId ? "yes" : "no"}` });
  log.info("harness.payment", { ...base, status: payment.status, settled });
  if (!settled) return fail("PAYMENT_FAILED", "settlement_not_confirmed");

  // GATE 3 — proof generation (only reachable AFTER settlement).
  const proof = await harnesses.zkp.generateVerificationProof({
    requestId: input.requestId,
    credentialRefs,
    claims: input.claims,
    did: input.userDid,
  });
  const proven = proof.status === "PROOF_GENERATED" && Boolean(proof.proofId);
  steps.push({ harness: "zkp", ok: proven, detail: `proof=${proof.status} engine=${proof.engine ?? "none"}` });
  log.info("harness.zkp", { ...base, status: proof.status, engine: proof.engine ?? "none" });
  if (!proven) return fail("VERIFICATION_FAILED", "proof_generation_failed");

  log.info("orchestration.completed", { ...base, proofId: proof.proofId, ms: Date.now() - started });
  return {
    requestId: input.requestId,
    status: "COMPLETED",
    claims: proof.claims,
    proofId: proof.proofId,
    txId: payment.txId,
    steps,
  };
}
