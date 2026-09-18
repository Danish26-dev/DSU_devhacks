/**
 * The three controlled harnesses — Idina's ONLY capabilities.
 *
 * Design principle: the agent DECIDES which harness to call; the harness
 * EXECUTES a deterministic, authorized operation. The LLM never manipulates
 * credentials, payments, proofs, or verification state directly, and never
 * receives raw PII (harnesses return metadata / booleans / references only).
 */
import type { ClaimType } from "@klaim/types";

/* --------------------------- Harness 1: wallet / credential --------------- */

export interface CredentialMeta {
  credentialRef: string;
  type: string;
  issuer: string;
  status: "VALID" | "EXPIRED" | "REVOKED" | "UNKNOWN";
  /** Which requested claims this credential can support. No raw PII. */
  availableClaims: ClaimType[];
}

export interface GetUserCredentialsInput {
  requestId: string;
  userDid: string;
  requestedClaims: ClaimType[];
}

export interface GetUserCredentialsOutput {
  requestId: string;
  credentials: CredentialMeta[];
  /** Convenience: are all requestedClaims covered by at least one VALID credential? */
  allClaimsCovered: boolean;
}

export interface WalletCredentialHarness {
  getUserCredentials(input: GetUserCredentialsInput): Promise<GetUserCredentialsOutput>;
}

/* ------------------------------ Harness 2: payment ------------------------ */

export interface VerifyPaymentInput {
  requestId: string;
  amountUsdc?: number;
}

export interface VerifyPaymentOutput {
  requestId: string;
  status: "SETTLED" | "FAILED" | "REQUIRED";
  txId: string | null;
  network: string | null;
  asset: "USDC" | null;
  amount: number | null;
  explorerUrl: string | null;
}

export interface PaymentHarness {
  verifyPaymentSettlement(input: VerifyPaymentInput): Promise<VerifyPaymentOutput>;
}

/* -------------------------------- Harness 3: zkp -------------------------- */

export interface GenerateProofInput {
  requestId: string;
  credentialRefs: string[];
  claims: ClaimType[];
  /** Subject DID — the ZKP service resolves credentials by DID. */
  did: string;
}

export interface GenerateProofOutput {
  requestId: string;
  status: "PROOF_GENERATED" | "FAILED";
  proofId: string | null;
  claims: Partial<Record<ClaimType, boolean>>;
  engine: "local" | "midnight" | null;
}

export interface ZkpHarness {
  generateVerificationProof(input: GenerateProofInput): Promise<GenerateProofOutput>;
}

/* -------------------------------- bundle ---------------------------------- */

export interface Harnesses {
  wallet: WalletCredentialHarness;
  payment: PaymentHarness;
  zkp: ZkpHarness;
}
