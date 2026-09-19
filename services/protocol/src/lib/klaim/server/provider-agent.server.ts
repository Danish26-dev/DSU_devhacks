/**
 * providerAgentService — KLAIM's own provider-side verification agent.
 *
 * This is NOT the verifier's Claude/GPT agent. It runs inside KLAIM, behind the
 * x402 payment boundary, and decides whether a claim can be proven for a DID.
 *
 * Tools:
 *   check_did · check_credential · check_claim · generate_zk_proof · verify_zk_proof
 *
 * Runtime:
 *   strands       — real Strands agent (@strands-agents/sdk) driving the tools,
 *                   enabled when a model provider is configured.
 *   deterministic — the same tools executed in a fixed order. Honest default;
 *                   results are labelled so nothing can claim an LLM ran.
 *
 * No raw PII ever leaves this module: only booleans, references and proof
 * descriptors.
 */
import { toInternalClaim, type ContractClaim } from "./claims";
import { env } from "./env.server";
import { repository, type CredentialRecord } from "./store.server";
import { zkpService } from "./zkp.server";

export type ProviderAgentRuntime = "strands" | "deterministic";

export interface ProviderAgentStep {
  tool: string;
  ok: boolean;
  detail: string;
}

export interface ProviderAgentResult {
  claim: string;
  verified: boolean;
  runtime: ProviderAgentRuntime;
  reason?: string;
  proof?: { id: string; engine: "local" | "midnight"; verified: boolean; notDisclosed: string[] };
  steps: ProviderAgentStep[];
}

export function strandsConfigured(): boolean {
  return Boolean(
    env("STRANDS_MODEL_ID") && (env("AWS_ACCESS_KEY_ID") || env("AWS_BEARER_TOKEN_BEDROCK")),
  );
}

/* ------------------------------------------------------------------- tools */

export const providerAgentTools = {
  check_did(did: string) {
    const credentials = repository.listCredentials(did);
    return { exists: credentials.length > 0, credentialCount: credentials.length };
  },
  check_credential(did: string, claim: string): { found: boolean; credential?: CredentialRecord } {
    const credential = repository.listCredentials(did).find((c) => claim in c.derivedClaims);
    return credential ? { found: true, credential } : { found: false };
  },
  check_claim(credential: CredentialRecord, claim: string) {
    const valid =
      credential.status === "verified" &&
      (!credential.expiresAt || new Date(credential.expiresAt) > new Date());
    return { valid, provable: valid && claim in credential.derivedClaims };
  },
  async generate_zk_proof(claim: string, credential: CredentialRecord) {
    return zkpService.prove(claim, credential);
  },
  verify_zk_proof(proof: { verified: boolean; proof: { engine: string } }) {
    return { verified: proof.verified, engine: proof.proof.engine };
  },
};

/* ------------------------------------------------------------------ runner */

async function runDeterministic(did: string, claim: string): Promise<ProviderAgentResult> {
  const steps: ProviderAgentStep[] = [];
  const runtime: ProviderAgentRuntime = "deterministic";

  const didCheck = providerAgentTools.check_did(did);
  steps.push({
    tool: "check_did",
    ok: didCheck.exists,
    detail: didCheck.exists
      ? `DID known to KLAIM (${didCheck.credentialCount} credential references)`
      : "DID unknown",
  });
  if (!didCheck.exists) return { claim, verified: false, runtime, reason: "unknown_did", steps };

  const credCheck = providerAgentTools.check_credential(did, claim);
  steps.push({
    tool: "check_credential",
    ok: credCheck.found,
    detail: credCheck.found
      ? `${credCheck.credential!.documentType} reference available`
      : "No credential supports this claim",
  });
  if (!credCheck.found)
    return { claim, verified: false, runtime, reason: "no_usable_credential", steps };

  const credential = credCheck.credential!;
  const claimCheck = providerAgentTools.check_claim(credential, claim);
  steps.push({
    tool: "check_claim",
    ok: claimCheck.provable,
    detail: claimCheck.provable
      ? "Credential valid and claim is provable"
      : "Credential invalid, revoked or expired",
  });
  if (!claimCheck.provable)
    return { claim, verified: false, runtime, reason: "credential_not_valid", steps };

  const proof = await providerAgentTools.generate_zk_proof(claim, credential);
  steps.push({
    tool: "generate_zk_proof",
    ok: true,
    detail: `Proof generated (engine=${proof.proof.engine})`,
  });

  const verification = providerAgentTools.verify_zk_proof(proof);
  steps.push({
    tool: "verify_zk_proof",
    ok: verification.verified,
    detail: `Proof ${verification.verified ? "verified" : "rejected"} (engine=${verification.engine})`,
  });

  return {
    claim,
    verified: verification.verified,
    runtime,
    proof: {
      id: proof.proof.id,
      engine: proof.proof.engine,
      verified: verification.verified,
      notDisclosed: proof.proof.notDisclosed,
    },
    steps,
  };
}

export const providerAgentService = {
  runtime(): ProviderAgentRuntime {
    return strandsConfigured() ? "strands" : "deterministic";
  },

  tools: ["check_did", "check_credential", "check_claim", "generate_zk_proof", "verify_zk_proof"],

  /**
   * Verify any contract claim (identity_verified · age_over_18 · license_valid)
   * for a DID. Executes behind the x402 boundary only. The `claim` argument is
   * a CONTRACT claim id; it is mapped to the internal derived-claim key before
   * touching the credential store, and the returned result reports the contract
   * claim so nothing downstream sees the internal spelling.
   */
  async verifyClaim(did: string, claim: ContractClaim): Promise<ProviderAgentResult> {
    const internalClaim = toInternalClaim(claim);

    const run = async (): Promise<ProviderAgentResult> => {
      const facts = await runDeterministic(did, internalClaim);
      // Report the contract claim id outward regardless of the internal key.
      return { ...facts, claim };
    };

    if (!strandsConfigured()) return run();

    try {
      const { Agent, BedrockModel, tool } = await import("@strands-agents/sdk");
      const facts = await run();

      const agent = new Agent({
        model: new BedrockModel({ modelId: env("STRANDS_MODEL_ID")! }),
        systemPrompt:
          "You are KLAIM's provider verification agent. Decide whether the requested claim can be proven from the credential facts you are given. Never reveal date of birth, Aadhaar, PAN, address or documents. Answer with the claim result only.",
        tools: [
          tool({
            name: "get_verification_facts",
            description:
              "Structured, PII-free result of KLAIM's credential and proof pipeline for this DID.",
            // The tool exposes only booleans and references.
            callback: async () => JSON.stringify({ ...facts, steps: facts.steps }),
          }),
        ],
      });

      await agent.invoke(
        `Can the claim ${claim} be proven for ${did}? Use get_verification_facts.`,
      );
      return { ...facts, runtime: "strands" };
    } catch {
      // A model/runtime failure must never upgrade or fabricate a result.
      return run();
    }
  },

  /**
   * Back-compat wrapper for the original age-only entrypoint. Existing routes
   * and the demo keep working unchanged.
   */
  async verifyAgeOver18(did: string): Promise<ProviderAgentResult> {
    return this.verifyClaim(did, "age_over_18");
  },
};
