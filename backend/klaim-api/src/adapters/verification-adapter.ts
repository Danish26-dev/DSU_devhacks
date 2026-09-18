/**
 * VerificationAdapter — the seam the future services/idina (credential
 * orchestration) and services/zkp (proof generation) plug into. The lifecycle
 * service depends on THIS interface only.
 *
 * Phase 2 ships a MOCK/DEVELOPMENT implementation. No real credential checks,
 * no ZKP, no cryptographic proof.
 */
import type { ClaimType, ProofResult } from "@klaim/types";

export interface VerificationInput {
  requestId: string;
  userDid: string;
  claims: ClaimType[];
}

export type VerificationOutcome =
  | {
      kind: "proven";
      claimResults: Partial<Record<ClaimType, boolean>>;
      proof: ProofResult;
    }
  | { kind: "credential_invalid"; reason: string }
  | { kind: "verification_failed"; reason: string };

export interface VerificationAdapter {
  /**
   * Run verification for an already-settled request. Callers MUST ensure payment
   * is settled before invoking this (the state machine enforces it upstream).
   */
  verify(input: VerificationInput): Promise<VerificationOutcome>;
}

/**
 * MOCK / DEVELOPMENT ONLY verification adapter.
 *
 * Resolves every requested claim to `true` and returns an explicitly-labelled
 * mock proof (engine "local", id prefixed `mock-proof-`). It does NOT inspect
 * credentials and does NOT produce a cryptographic proof. Must not ship to
 * production — the real adapter delegates to Idina + the ZKP service.
 */
export class MockVerificationAdapter implements VerificationAdapter {
  constructor(private readonly opts: { outcome?: "proven" | "credential_invalid" | "verification_failed" } = {}) {}

  verify(input: VerificationInput): Promise<VerificationOutcome> {
    const outcome = this.opts.outcome ?? "proven";

    if (outcome === "credential_invalid") {
      return Promise.resolve({ kind: "credential_invalid", reason: "mock: credential not usable" });
    }
    if (outcome === "verification_failed") {
      return Promise.resolve({ kind: "verification_failed", reason: "mock: verification error" });
    }

    const claimResults: Partial<Record<ClaimType, boolean>> = {};
    for (const claim of input.claims) claimResults[claim] = true;

    const proof: ProofResult = {
      proofId: `mock-proof-${input.requestId}`,
      engine: "local",
      notDisclosed: ["date_of_birth", "aadhaar_number", "pan_number", "address", "document_image"],
    };

    return Promise.resolve({ kind: "proven", claimResults, proof });
  }
}
