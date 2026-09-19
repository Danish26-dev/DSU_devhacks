/**
 * KLAIM server-side repository.
 *
 * IMPORTANT: this is an in-process store. It is a real backend boundary with a
 * single, narrow interface (`KlaimRepository`) so it can be swapped for a
 * database without touching any route, MCP tool or frontend service. Data does
 * not survive a Worker restart — the API layer reports this through
 * `storage: "ephemeral"` so nothing in the UI can claim durable persistence.
 *
 * Storage policy (deliberate):
 *   - credentials are stored as REFERENCE + issuer info + metadata + the
 *     minimum derived claims required for ZK verification;
 *   - no document bytes, no raw Aadhaar/PAN numbers, no addresses;
 *   - agent access keys are stored only as SHA-256 hashes.
 */

export interface AgentRecord {
  id: string;
  name: string;
  description: string;
  providers: string[];
  tools: string[];
  status: "active" | "paused" | "revoked";
  spending: { dailyLimitUsdc: number; perRequestLimitUsdc: number };
  keyHash: string | null;
  keyPrefix: string | null;
  keyRotatedAt: string | null;
  createdAt: string;
  lastActivityAt: string | null;
}

export interface CredentialRecord {
  id: string;
  subjectDid: string;
  provider: "DigiLocker";
  /** Opaque issuer reference — never a document body. */
  credentialRef: string;
  documentType: string;
  issuer: string;
  issuerVerified: boolean;
  issuerSignatureAlg: string | null;
  status: "verified" | "pending" | "revoked" | "expired";
  issuedAt: string | null;
  expiresAt: string | null;
  addedAt: string;
  lastVerifiedAt: string | null;
  /** Minimum derived claims. Booleans/ranges only — never raw PII. */
  derivedClaims: Record<string, boolean | string>;
  /** true when the record came from the real DigiLocker API. */
  live: boolean;
}

export interface AuditEvent {
  id: string;
  at: string;
  subject: string;
  action: string;
  detail: string;
}

export interface TransactionRecord {
  id: string;
  agentId: string | null;
  /** KLAIM API verification request id (REQ-<id>) when the call came through the lifecycle. */
  requestId: string | null;
  claim: string;
  amountUsdc: number;
  asset: "USDC";
  network: string;
  facilitator: string;
  /** Lora Testnet explorer URL, only when a real txId exists. */
  explorerUrl?: string | null;
  /** null until a real settlement returns one. Never fabricated. */
  txId: string | null;
  status: "requires_payment" | "settled" | "failed";
  createdAt: string;
}

const now = () => new Date().toISOString();
const rid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

export async function hashKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function mintAccessKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = [...bytes]
    .map((b) => b.toString(36))
    .join("")
    .slice(0, 32);
  return `klm_${body}`;
}

export function maskKey(key: string): string {
  return `${key.slice(0, 8)}${"•".repeat(8)}`;
}

interface Db {
  agents: Map<string, AgentRecord>;
  credentials: Map<string, CredentialRecord>;
  audit: AuditEvent[];
  transactions: TransactionRecord[];
}

const globalRef = globalThis as typeof globalThis & { __klaimDb?: Db };

function db(): Db {
  if (!globalRef.__klaimDb) {
    globalRef.__klaimDb = {
      agents: new Map(),
      credentials: new Map(),
      audit: [],
      transactions: [],
    };
    seedDemoHuman(globalRef.__klaimDb);
  }
  return globalRef.__klaimDb;
}

/**
 * ONE deterministic demo human, used to exercise the architecture end to end.
 * It is synthetic — clearly labelled "Demo Credential" and never presented as
 * real DigiLocker data (`live: false`, issuer "KLAIM Demo Issuer").
 */
export const DEMO_HUMAN_DID = "did:identipi:demo-user-001";

function seedDemoHuman(store: Db) {
  // One synthetic identity credential proving all three demo claims. Derived
  // claims are booleans only — no DOB, licence number, or document bytes. Note
  // the internal spelling `licence_valid`; the claims boundary maps it to the
  // contract's `license_valid`.
  const credential: CredentialRecord = {
    id: "cred_demo_identity_001",
    subjectDid: DEMO_HUMAN_DID,
    provider: "DigiLocker",
    credentialRef: "demo:identity-credential:001",
    documentType: "Demo Credential — Identity & Driving Licence",
    issuer: "KLAIM Demo Issuer (synthetic)",
    issuerVerified: false,
    issuerSignatureAlg: null,
    status: "verified",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    addedAt: "2026-01-01T00:00:00.000Z",
    lastVerifiedAt: "2026-01-01T00:00:00.000Z",
    derivedClaims: {
      identity_verified: true,
      age_over_18: true,
      licence_valid: true,
      // Private raw values used by the Midnight circuits to COMPUTE each claim
      // (rather than trusting a stored boolean). Never disclosed in any result.
      birth_year: "1998", // age_over_18
      licence_expiry_year: "2030", // license_valid (not expired)
      identity_attestation: "1", // identity_verified (matches issuer marker)
    },
    live: false,
  };
  store.credentials.set(credential.id, credential);
}

export const repository = {
  storage: "ephemeral" as const,

  /* ------------------------------------------------------------- agents */
  listAgents(): AgentRecord[] {
    return [...db().agents.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  getAgent(id: string): AgentRecord | undefined {
    return db().agents.get(id);
  },
  async createAgent(input: {
    name: string;
    description: string;
    providers: string[];
    tools: string[];
    spending: { dailyLimitUsdc: number; perRequestLimitUsdc: number };
  }): Promise<{ agent: AgentRecord; accessKey: string }> {
    const key = mintAccessKey();
    const agent: AgentRecord = {
      id: `agent_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      name: input.name,
      description: input.description,
      providers: input.providers,
      tools: input.tools,
      status: "active",
      spending: input.spending,
      keyHash: await hashKey(key),
      keyPrefix: key.slice(0, 8),
      keyRotatedAt: now(),
      createdAt: now(),
      lastActivityAt: null,
    };
    db().agents.set(agent.id, agent);
    this.audit(agent.id, "agent.created", `Agent "${agent.name}" created`);
    return { agent, accessKey: key };
  },
  async rotateAgentKey(id: string): Promise<{ agent: AgentRecord; accessKey: string } | null> {
    const agent = db().agents.get(id);
    if (!agent) return null;
    const key = mintAccessKey();
    agent.keyHash = await hashKey(key);
    agent.keyPrefix = key.slice(0, 8);
    agent.keyRotatedAt = now();
    agent.status = agent.status === "revoked" ? "active" : agent.status;
    this.audit(agent.id, "agent.key_rotated", "Access key rotated — previous key invalidated");
    return { agent, accessKey: key };
  },
  revokeAgentKey(id: string): AgentRecord | null {
    const agent = db().agents.get(id);
    if (!agent) return null;
    agent.keyHash = null;
    agent.keyPrefix = null;
    agent.status = "revoked";
    this.audit(agent.id, "agent.key_revoked", "Access key revoked — MCP calls will be rejected");
    return agent;
  },
  deleteAgent(id: string): boolean {
    const agent = db().agents.get(id);
    if (!agent) return false;
    db().agents.delete(id);
    this.audit(id, "agent.deleted", `Agent "${agent.name}" deleted`);
    return true;
  },
  async authenticateAgent(
    agentId: string | null,
    accessKey: string | null,
  ): Promise<AgentRecord | null> {
    if (!agentId || !accessKey) return null;
    const agent = db().agents.get(agentId);
    if (!agent || !agent.keyHash || agent.status === "revoked") return null;
    const hash = await hashKey(accessKey);
    if (hash !== agent.keyHash) return null;
    agent.lastActivityAt = now();
    return agent;
  },

  /* -------------------------------------------------------- credentials */
  listCredentials(subjectDid?: string): CredentialRecord[] {
    const all = [...db().credentials.values()];
    return (subjectDid ? all.filter((c) => c.subjectDid === subjectDid) : all).sort((a, b) =>
      b.addedAt.localeCompare(a.addedAt),
    );
  },
  getCredential(id: string): CredentialRecord | undefined {
    return db().credentials.get(id);
  },
  putCredential(record: Omit<CredentialRecord, "id">): CredentialRecord {
    const credential: CredentialRecord = { ...record, id: rid("cred") };
    db().credentials.set(credential.id, credential);
    this.audit(
      credential.subjectDid,
      "credential.added",
      `${credential.documentType} reference attached to DID`,
    );
    return credential;
  },
  deleteCredential(id: string): CredentialRecord | null {
    const credential = db().credentials.get(id);
    if (!credential) return null;
    db().credentials.delete(id);
    this.audit(
      credential.subjectDid,
      "credential.deleted",
      `${credential.documentType} removed from KLAIM. Cached claims invalidated; no future proofs can be derived. The credential itself remains with DigiLocker / the issuer.`,
    );
    return credential;
  },

  /* --------------------------------------------------- audit + payments */
  audit(subject: string, action: string, detail: string): AuditEvent {
    const event: AuditEvent = { id: rid("evt"), at: now(), subject, action, detail };
    db().audit.unshift(event);
    db().audit.splice(300);
    return event;
  },
  listAudit(subject?: string): AuditEvent[] {
    return db().audit.filter((e) => !subject || e.subject === subject);
  },
  recordTransaction(tx: Omit<TransactionRecord, "id" | "createdAt">): TransactionRecord {
    const record: TransactionRecord = { ...tx, id: rid("tx"), createdAt: now() };
    db().transactions.unshift(record);
    db().transactions.splice(200);
    return record;
  },
  listTransactions(): TransactionRecord[] {
    return db().transactions;
  },
  /** Transactions correlated to a KLAIM API verification request, newest first. */
  listTransactionsByRequest(requestId: string): TransactionRecord[] {
    return db().transactions.filter((t) => t.requestId === requestId);
  },
};

export type KlaimRepository = typeof repository;
