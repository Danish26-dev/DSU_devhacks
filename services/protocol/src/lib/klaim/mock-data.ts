import type { AgentEvent, AgentProvider, AgentTool, ClaimOption, Credential, KlaimUser, VerificationRecord, VerifierAgent } from "./types";

export const DEMO_DID = "did:identipi:demo-7x82";

export const demoUser: KlaimUser = {
  name: "Danish",
  role: "human",
  email: "danish@klaim.demo",
  did: DEMO_DID,
  status: "active",
  createdAt: "Aug 2026",
  demo: true,
};

export const demoVerifier: KlaimUser = {
  name: "Verifier",
  role: "verifier",
  email: "ops@verifier.demo",
  did: "did:identipi:verifier-4c19",
  status: "active",
  createdAt: "Aug 2026",
  demo: true,
};

export const seedCredentials: Credential[] = [
  {
    id: "cred_dl_001",
    provider: "DigiLocker",
    documentType: "Driving Licence",
    issuer: "Government Issuer",
    status: "verified",
    attachedTo: DEMO_DID,
    attachedAt: "Aug 12, 2026",
    source: "seed",
    claims: [
      { label: "Identity" },
      { label: "Date of Birth", maskedValue: "•• / •• / 2004" },
      { label: "Licence validity", maskedValue: "Valid" },
    ],
  },
  {
    id: "cred_id_002",
    provider: "DigiLocker",
    documentType: "Identity Credential",
    issuer: "Government Issuer",
    status: "verified",
    attachedTo: DEMO_DID,
    attachedAt: "Aug 12, 2026",
    source: "seed",
    claims: [
      { label: "Identity" },
      { label: "Date of Birth", maskedValue: "•• / •• / 2004" },
      { label: "Document reference", maskedValue: "•••• •••• 4821" },
    ],
  },
  {
    id: "cred_addr_003",
    provider: "DigiLocker",
    documentType: "Address Proof",
    issuer: "Government Issuer",
    status: "verified",
    attachedTo: DEMO_DID,
    attachedAt: "Aug 15, 2026",
    source: "seed",
    claims: [{ label: "Residency" }, { label: "State", maskedValue: "••••••••" }],
  },
];

export const claimOptions: ClaimOption[] = [
  {
    id: "age_over_18",
    label: "Age > 18",
    description: "Proves the human is over 18 without disclosing date of birth.",
    priceUsdc: 0.01,
    enabled: true,
  },
  {
    id: "licence_valid",
    label: "Valid Driving Licence",
    description: "Coming soon — licence validity proof.",
    priceUsdc: 0.02,
    enabled: false,
  },
  {
    id: "residency",
    label: "Residency",
    description: "Coming soon — region of residence proof.",
    priceUsdc: 0.02,
    enabled: false,
  },
  {
    id: "student_status",
    label: "Student Status",
    description: "Coming soon — enrolment proof.",
    priceUsdc: 0.02,
    enabled: false,
  },
];

export const seedVerifications: VerificationRecord[] = [
  {
    id: "vrf_1042",
    claimId: "age_over_18",
    claimLabel: "Age > 18",
    subjectDid: DEMO_DID,
    requestedBy: "Claude Agent",
    status: "verified",
    amountUsdc: 0.01,
    network: "Algorand Testnet",
    transaction: {
      id: "DEMO-TX-7F2A91C4",
      kind: "demo",
      amountUsdc: 0.01,
      network: "Algorand Testnet",
      createdAt: "Aug 22, 2026",
    },
    createdAt: "Aug 22, 2026",
    notDisclosed: ["Date of Birth", "Aadhaar", "Document image"],
  },
  {
    id: "vrf_1041",
    claimId: "licence_valid",
    claimLabel: "Driving Licence",
    subjectDid: DEMO_DID,
    requestedBy: "GPT Agent",
    status: "verified",
    amountUsdc: 0.02,
    network: "Algorand Testnet",
    transaction: {
      id: "DEMO-TX-1B93D0AE",
      kind: "demo",
      amountUsdc: 0.02,
      network: "Algorand Testnet",
      createdAt: "Aug 20, 2026",
    },
    createdAt: "Aug 20, 2026",
    notDisclosed: ["Licence number", "Document image"],
  },
];

/** The credential returned by the mocked DigiLocker / QR flows. */
export const digilockerDemoCredential: Omit<Credential, "id" | "attachedTo" | "source"> = {
  provider: "DigiLocker",
  documentType: "Driving Licence",
  issuer: "Government Issuer",
  status: "verified",
  attachedAt: "Aug 22, 2026",
  claims: [
    { label: "Date of Birth", maskedValue: "•• / •• / 2004" },
    { label: "Licence Validity", maskedValue: "Valid" },
    { label: "Identity" },
  ],
};

/* --------------------------------------------------------------- agents */



export const AGENT_TOOLS: AgentTool[] = [
  {
    id: "verify_human_age",
    name: "verify_human_age",
    description:
      "Verify whether a human satisfies the age > 18 requirement without exposing their date of birth.",
    claimId: "age_over_18",
    priceUsdc: 0.01,
  },
  {
    id: "verify_driving_licence",
    name: "verify_driving_licence",
    description:
      "Verify that a human holds a valid driving licence without exposing the licence number or document.",
    claimId: "licence_valid",
    priceUsdc: 0.02,
  },
  {
    id: "verify_residency",
    name: "verify_residency",
    description:
      "Verify that a human resides in a given country or region without exposing their full address.",
    claimId: "residency",
    priceUsdc: 0.02,
  },
];

export const PROVIDER_LABELS: Record<AgentProvider, string> = {
  claude: "Claude",
  openai: "GPT / OpenAI",
  strands: "Strands",
  custom: "Custom MCP Client",
};

const demoTimeline = (base: string): AgentEvent[] => [
  { id: `${base}_1`, at: "14:32:08", actor: "agent", message: "Agent requested", detail: "Age > 18", simulated: true },
  { id: `${base}_2`, at: "14:32:09", actor: "klaim", message: "KLAIM", detail: "402 Payment Required", tone: "warn", simulated: true },
  { id: `${base}_3`, at: "14:32:10", actor: "x402", message: "x402", detail: "Payment authorized", simulated: true },
  { id: `${base}_4`, at: "14:32:11", actor: "algorand", message: "Algorand", detail: "Settlement confirmed (simulated)", simulated: true },
  { id: `${base}_5`, at: "14:32:12", actor: "klaim", message: "KLAIM", detail: "Verification started", simulated: true },
  { id: `${base}_6`, at: "14:32:12", actor: "zk", message: "ZK", detail: "Proof verified", tone: "ok", simulated: true },
  { id: `${base}_7`, at: "14:32:12", actor: "agent", message: "Verification result received", detail: "✓ Age > 18", tone: "ok", simulated: true },
];

export const demoAgents: VerifierAgent[] = [
  {
    id: "agent_klaim_demo_001",
    name: "Customer Onboarding Agent",
    description: "Checks that new signups are adults before granting account access.",
    providers: ["claude", "openai"],
    status: "active",
    mcpStatus: "connected",
    tools: ["verify_human_age"],
    spending: { dailyLimitUsdc: 5, perRequestLimitUsdc: 0.05 },
    spendTodayUsdc: 0.24,
    lastActivity: "2 minutes ago",
    createdAt: "Aug 12, 2026",
    accessKeyMasked: "klm_demo_••••••••",
    demo: true,
    events: demoTimeline("evt_a1"),
  },
  {
    id: "agent_klaim_demo_002",
    name: "Marketplace Trust Agent",
    description: "Requests residency and licence claims before high-value listings go live.",
    providers: ["strands"],
    status: "paused",
    mcpStatus: "not_connected",
    tools: ["verify_human_age", "verify_residency"],
    spending: { dailyLimitUsdc: 2, perRequestLimitUsdc: 0.05 },
    spendTodayUsdc: 0,
    lastActivity: "3 days ago",
    createdAt: "Aug 08, 2026",
    accessKeyMasked: "klm_demo_••••••••",
    demo: true,
    events: [],
  },
];
