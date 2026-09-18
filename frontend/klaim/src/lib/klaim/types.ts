// Domain types for the KLAIM MVP demo layer.
// These shapes intentionally mirror what a real backend would return so the
// mock services in `services.ts` can be swapped for HTTP/RPC calls later.

export type ClaimId = "age_over_18" | "licence_valid" | "residency" | "student_status";

export type KlaimRole = "human" | "verifier";

export interface KlaimUser {
  name: string;
  /** Determines navigation, dashboard and permitted actions. */
  role: KlaimRole;
  email: string;
  did: string;
  status: "active" | "pending";
  createdAt: string;
  /** true while the app runs on the mocked demo backend */
  demo: boolean;
}

export interface CredentialClaim {
  label: string;
  /** Masked demo value — never a real document value. */
  maskedValue?: string;
}

export interface Credential {
  id: string;
  provider: "DigiLocker";
  documentType: string;
  issuer: string;
  status: "verified" | "pending";
  attachedTo: string | null;
  attachedAt: string;
  claims: CredentialClaim[];
  source: "connect" | "scan" | "seed";
}

export interface ClaimOption {
  id: ClaimId;
  label: string;
  description: string;
  priceUsdc: number;
  enabled: boolean;
}

export type VerificationStepId = "request" | "payment" | "credential" | "proof" | "result";

export type VerificationStepStatus = "idle" | "running" | "done";

export interface Transaction {
  id: string;
  /** demo = placeholder id, settled = real x402 settlement from the backend */
  kind: "demo" | "settled";
  amountUsdc: number;
  network: "Algorand Testnet";
  createdAt: string;
  /** Real Lora explorer URL when kind === "settled". */
  explorerUrl?: string | null;
}

export interface VerificationRecord {
  id: string;
  claimId: ClaimId;
  claimLabel: string;
  subjectDid: string;
  requestedBy: string;
  status: "verified" | "failed";
  amountUsdc: number;
  network: "Algorand Testnet";
  transaction: Transaction;
  createdAt: string;
  notDisclosed: string[];
}

export interface KlaimState {
  user: KlaimUser | null;
  credentials: Credential[];
  verifications: VerificationRecord[];
}

/* --------------------------------------------------------------- agents */

/**
 * AI providers a verifier can point at the KLAIM MCP server.
 * Provider-agnostic by design — KLAIM never assumes a single vendor.
 */
export type AgentProvider = "claude" | "openai" | "strands" | "custom";

export type AgentToolId = "verify_human_age" | "verify_driving_licence" | "verify_residency";

export interface AgentTool {
  id: AgentToolId;
  name: string;
  description: string;
  claimId: ClaimId;
  priceUsdc: number;
}

export interface AgentSpendingControls {
  dailyLimitUsdc: number;
  perRequestLimitUsdc: number;
}

/** One line of the agent event timeline (demo/simulated until backend lands). */
export interface AgentEvent {
  id: string;
  at: string;
  actor: "agent" | "klaim" | "x402" | "algorand" | "zk";
  message: string;
  detail?: string;
  tone?: "ok" | "info" | "warn";
  /** false only once a real backend produced the event */
  simulated: boolean;
}

/**
 * Shape the real backend is expected to return for a settled verification.
 * The UI reads these fields and must never fabricate `txId` once live.
 */
export interface SettlementInfo {
  transactionId: string | null;
  network: "algorand:testnet";
  asset: "USDC";
  amount: number;
  facilitator: "GoPlausible";
  settlementStatus: "pending" | "settled" | "failed" | "simulated";
}

export interface VerifierAgent {
  id: string;
  name: string;
  description: string;
  providers: AgentProvider[];
  status: "active" | "paused";
  mcpStatus: "connected" | "not_connected";
  tools: AgentToolId[];
  spending: AgentSpendingControls;
  spendTodayUsdc: number;
  lastActivity: string;
  createdAt: string;
  /** Masked demo access key. NOT a wallet key, NOT a signing secret. */
  accessKeyMasked: string;
  /** true while KLAIM runs on the mocked demo backend */
  demo: boolean;
  events: AgentEvent[];
}
