/**
 * KLAIM service layer — MOCK IMPLEMENTATION (hackathon MVP).
 *
 * Every function here is a simulation running entirely in the browser.
 * Nothing in this file is cryptographically secure, and no real network,
 * ledger or issuer is contacted. Each service is intentionally a thin,
 * async, promise-based interface so it can later be replaced with:
 *
 *   authService        -> real session/auth backend
 *   didService         -> real DID registry
 *   credentialService  -> real DigiLocker OAuth + VC storage
 *   zkpService         -> real Midnight ZK circuit
 *   x402Service        -> real x402 + USDC settlement on Algorand Testnet
 *   mcpService         -> real KLAIM MCP server
 */
import {
  AGENT_TOOLS,
  DEMO_DID,
  demoAgents,
  demoUser,
  demoVerifier,
  digilockerDemoCredential,
  seedCredentials,
  seedVerifications,
} from "./mock-data";
import { getPublicMcpUrl } from "./mcp-url";
import type {
  AgentEvent,
  AgentProvider,
  AgentSpendingControls,
  AgentToolId,
  ClaimId,
  Credential,
  KlaimRole,
  KlaimUser,
  SettlementInfo,
  Transaction,
  VerificationRecord,
  VerifierAgent,
} from "./types";

export const IS_MOCK_BACKEND = true;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const uid = (prefix: string) =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

/* ------------------------------------------------------------------ auth */

export const authService = {
  async loginWithDemoAccount(role: KlaimRole = "human"): Promise<KlaimUser> {
    await wait(450);
    return role === "verifier" ? { ...demoVerifier } : { ...demoUser };
  },
  async loginWithPassword(email: string, _password: string, role: KlaimRole = "human"): Promise<KlaimUser> {
    // DEMO ONLY: credentials are not checked. Replace with a real auth call.
    const base = role === "verifier" ? demoVerifier : demoUser;
    await wait(650);
    return { ...base, email: email || base.email };
  },
  async logout(): Promise<void> {
    await wait(120);
  },
};

/* ------------------------------------------------------------------- did */

export const didService = {
  async getDid(): Promise<string> {
    await wait(80);
    return DEMO_DID;
  },
  async createDid(): Promise<string> {
    await wait(400);
    return DEMO_DID;
  },
};

/* ----------------------------------------------------------- credentials */

export const credentialService = {
  async list(): Promise<Credential[]> {
    await wait(120);
    return seedCredentials.map((c) => ({ ...c }));
  },
  /** Simulated DigiLocker authorization + issuer authenticity check. */
  async verifyWithDigiLocker(source: "connect" | "scan"): Promise<Omit<Credential, "id" | "attachedTo">> {
    await wait(1400);
    return { ...digilockerDemoCredential, source };
  },
  /** Attaches a credential *reference* to the DID. No document is stored. */
  async attachToDid(
    credential: Omit<Credential, "id" | "attachedTo">,
    did: string,
  ): Promise<Credential> {
    await wait(900);
    return { ...credential, id: uid("cred"), attachedTo: did };
  },
};

/* ------------------------------------------------------------------- zkp */

export const zkpService = {
  /** Simulated proof generation. NOT a real ZK circuit. */
  async generateProof(claimId: ClaimId): Promise<{ proofId: string; statement: string; valid: boolean }> {
    await wait(1600);
    return { proofId: uid("proof"), statement: claimId, valid: true };
  },
};

/* ------------------------------------------------------------------ x402 */

export interface X402PaymentRequirement {
  paymentId: string;
  amountUsdc: number;
  network: "Algorand Testnet";
  asset: "USDC";
  /** true until the real x402 facilitator is wired up */
  simulated: boolean;
}

export type X402PaymentStatus = "required" | "pending" | "settled" | "failed";

export const x402Service = {
  /** Returns the payment requirement an agent must satisfy (HTTP 402 equivalent). */
  async requestVerification(input: { claimId: ClaimId; subjectDid: string; amountUsdc: number }) {
    await wait(500);
    const requirement: X402PaymentRequirement = {
      paymentId: uid("pay"),
      amountUsdc: input.amountUsdc,
      network: "Algorand Testnet",
      asset: "USDC",
      simulated: IS_MOCK_BACKEND,
    };
    return requirement;
  },
  /** Polled by the UI. The real implementation watches the Algorand Testnet. */
  async getPaymentStatus(_paymentId: string): Promise<X402PaymentStatus> {
    await wait(1500);
    return "settled";
  },
  /** Demo placeholder until real settlement returns an on-chain txid. */
  async getTransaction(paymentId: string, amountUsdc: number): Promise<Transaction> {
    await wait(300);
    return {
      id: `DEMO-TX-${paymentId.slice(-8).toUpperCase()}`,
      kind: "demo",
      amountUsdc,
      network: "Algorand Testnet",
      createdAt: "Aug 22, 2026",
    };
  },
};

/* ----------------------------------------------------------------- agents */

export interface CreateAgentInput {
  name: string;
  description: string;
  providers: AgentProvider[];
  tools: AgentToolId[];
  spending: AgentSpendingControls;
}

/**
 * Agent registry. MOCK — replace with the KLAIM backend:
 *   list/create/get  -> REST or RPC against the agent service
 *   rotateAccessKey  -> backend-issued key, only ever shown masked here
 *
 * The access key is an API credential for the KLAIM MCP server. It is NOT a
 * blockchain private key, seed phrase or signing secret — those never reach
 * the frontend under any circumstance.
 */
export const agentService = {
  async list(): Promise<VerifierAgent[]> {
    await wait(150);
    return demoAgents.map((a) => ({ ...a }));
  },
  async create(input: CreateAgentInput): Promise<VerifierAgent> {
    await wait(900);
    return {
      id: `agent_klaim_demo_${Math.floor(100 + Math.random() * 900)}`,
      name: input.name,
      description: input.description,
      providers: input.providers,
      status: "active",
      mcpStatus: "not_connected",
      tools: input.tools,
      spending: input.spending,
      spendTodayUsdc: 0,
      lastActivity: "Never",
      createdAt: "Aug 22, 2026",
      accessKeyMasked: "klm_demo_••••••••",
      demo: IS_MOCK_BACKEND,
      events: [],
    };
  },
  tools() {
    return AGENT_TOOLS.map((t) => ({ ...t }));
  },
};

/* -------------------------------------------------------------------- mcp */

export interface McpConnection {
  endpoint: string;
  agentId: string;
  authScheme: "KLAIM Agent Access Key";
  /** true until the real KLAIM MCP server is reachable */
  demo: boolean;
  tools: AgentToolId[];
}

export const mcpService = {
  get endpoint() {
    return getPublicMcpUrl();
  },
  /** Connection descriptor rendered by the MCP panel. */
  getConnection(agent: { id: string; tools: AgentToolId[] }): McpConnection {
    return {
      endpoint: getPublicMcpUrl(),
      agentId: agent.id,
      authScheme: "KLAIM Agent Access Key",
      demo: IS_MOCK_BACKEND,
      tools: agent.tools,
    };
  },
  /** Client config block. Provider-agnostic MCP JSON, replaceable when live. */
  buildConfig(agent: { id: string }): string {
    return JSON.stringify(
      {
        mcpServers: {
          klaim: {
            type: "http",
            url: getPublicMcpUrl(),
            headers: {
              "X-KLAIM-Agent-Id": agent.id,
              Authorization: "Bearer <KLAIM_AGENT_ACCESS_KEY>",
            },
          },
        },
      },
      null,
      2,
    );
  },
  async getStatus(): Promise<{ connected: boolean; tools: string[]; endpoint: string }> {
    await wait(120);
    return { connected: false, tools: AGENT_TOOLS.map((t) => t.name), endpoint: getPublicMcpUrl() };
  },
  /**
   * Simulated agent run. The real implementation subscribes to backend events
   * emitted by the MCP server, x402 facilitator and verification service.
   */
  simulateRun(toolId: AgentToolId, claimLabel: string): AgentEvent[] {
    const stamp = (offset: number) => {
      const d = new Date(Date.now() + offset * 1000);
      return d.toTimeString().slice(0, 8);
    };
    const base = `evt_${Math.random().toString(36).slice(2, 8)}`;
    return [
      { id: `${base}_1`, at: stamp(0), actor: "agent", message: "Agent requested", detail: `${claimLabel} · ${toolId}`, simulated: true },
      { id: `${base}_2`, at: stamp(1), actor: "klaim", message: "KLAIM", detail: "402 Payment Required", tone: "warn", simulated: true },
      { id: `${base}_3`, at: stamp(2), actor: "x402", message: "x402", detail: "Payment authorized", simulated: true },
      { id: `${base}_4`, at: stamp(3), actor: "algorand", message: "Algorand", detail: "Settlement confirmed (simulated)", simulated: true },
      { id: `${base}_5`, at: stamp(4), actor: "klaim", message: "KLAIM", detail: "Verification started", simulated: true },
      { id: `${base}_6`, at: stamp(4), actor: "zk", message: "ZK", detail: "Proof verified", tone: "ok", simulated: true },
      { id: `${base}_7`, at: stamp(4), actor: "agent", message: "Verification result received", detail: `✓ ${claimLabel}`, tone: "ok", simulated: true },
    ];
  },
};

/* ----------------------------------------------------------- verification */

/**
 * Settlement descriptor the real backend is expected to return alongside a
 * verification. `transactionId` stays null while simulated — the UI must never
 * invent one.
 */
export function toSettlement(tx: Transaction): SettlementInfo {
  return {
    transactionId: tx.kind === "settled" ? tx.id : null,
    network: "algorand:testnet",
    asset: "USDC",
    amount: tx.amountUsdc,
    facilitator: "GoPlausible",
    settlementStatus: tx.kind === "settled" ? "settled" : "simulated",
  };
}

export const verificationService = {
  async listActivity(): Promise<VerificationRecord[]> {
    await wait(120);
    return seedVerifications.map((v) => ({ ...v }));
  },
  buildRecord(input: {
    claimId: ClaimId;
    claimLabel: string;
    subjectDid: string;
    requestedBy: string;
    transaction: Transaction;
    amountUsdc: number;
  }): VerificationRecord {
    return {
      id: uid("vrf"),
      claimId: input.claimId,
      claimLabel: input.claimLabel,
      subjectDid: input.subjectDid,
      requestedBy: input.requestedBy,
      status: "verified",
      amountUsdc: input.amountUsdc,
      network: "Algorand Testnet",
      transaction: input.transaction,
      createdAt: "Aug 22, 2026",
      notDisclosed: ["Date of Birth", "Aadhaar", "Document image"],
    };
  },
};
