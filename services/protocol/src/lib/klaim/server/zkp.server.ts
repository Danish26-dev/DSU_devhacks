/**
 * zkpService — the single abstraction behind every proof KLAIM produces.
 *
 * The verifier never receives DOB, Aadhaar, PAN, address or a document. The
 * private claim stays inside this service; only a boolean/qualified result and
 * a proof descriptor leave it.
 *
 * Engines:
 *   local    — deterministic claim evaluation over derived claims. Honest
 *              default; proofs are labelled engine="local" so no UI can call
 *              them zero-knowledge proofs.
 *   midnight — real ZK circuit, used as soon as MIDNIGHT_PROVER_URL is set.
 */
import { toContractClaim, toInternalClaim } from "./claims";
import { env, zkConfigured } from "./env.server";
import type { CredentialRecord } from "./store.server";

export interface ProofResult {
  verified: boolean;
  claim: string;
  proof: {
    id: string;
    engine: "local" | "midnight";
    /** Non-disclosed inputs — listed so the UI can show what stayed private. */
    notDisclosed: string[];
  };
}



const NOT_DISCLOSED = [
  "date_of_birth",
  "aadhaar_number",
  "pan_number",
  "address",
  "document_image",
];

export const zkpService = {
  engine(): "local" | "midnight" {
    return zkConfigured() ? "midnight" : "local";
  },

  async prove(claim: string, credential: CredentialRecord): Promise<ProofResult> {
    // Accept either the contract spelling or the internal key. The credential
    // store keys derived claims with the internal spelling, so normalize before
    // looking the private claim up.
    const contract = toContractClaim(claim);
    const lookupKey = contract ? toInternalClaim(contract) : claim;
    const privateClaim = credential.derivedClaims[lookupKey];
    const holds = privateClaim === true || privateClaim === "true";

    // Real Midnight ZK: when MIDNIGHT_PROVER_URL is set, delegate to the
    // standalone klaim-zkp Node service, which runs the compiled Compact
    // circuits (Node-only, so they live outside this Cloudflare-bundled service).
    // All three contract claims have real circuits. The PRIVATE per-claim value
    // (birth year / licence expiry / identity attestation) is read from the
    // credential and sent only to our own trusted ZK service over the internal
    // token — never to a verifier, never disclosed in the result.
    const MIDNIGHT_CLAIMS = ["age_over_18", "license_valid", "identity_verified"];
    if (zkConfigured() && contract && MIDNIGHT_CLAIMS.includes(contract)) {
      const claimInputs: Record<string, unknown> = {};
      if (contract === "age_over_18") {
        const v = Number(credential.derivedClaims["birth_year"]);
        if (Number.isFinite(v)) claimInputs["birthYear"] = v;
      } else if (contract === "license_valid") {
        const v = Number(credential.derivedClaims["licence_expiry_year"]);
        if (Number.isFinite(v)) claimInputs["expiryYear"] = v;
      } else if (contract === "identity_verified") {
        const v = Number(credential.derivedClaims["identity_attestation"]);
        if (Number.isFinite(v)) {
          claimInputs["attestation"] = v;
          claimInputs["expectedMarker"] = 1;
        }
      }

      const token = env("INTERNAL_SERVICE_TOKEN");
      const res = await fetch(`${env("MIDNIGHT_PROVER_URL")}/prove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ claim: contract, credentialRef: credential.credentialRef, ...claimInputs }),
      });
      if (!res.ok) throw new Error(`Midnight prover failed (${res.status})`);
      const json = (await res.json()) as { verified: boolean; proofId: string };
      return {
        verified: json.verified,
        claim,
        proof: { id: json.proofId, engine: "midnight", notDisclosed: NOT_DISCLOSED },
      };
    }

    return {
      verified: holds,
      claim,
      proof: {
        id: `proof_local_${crypto.randomUUID().slice(0, 8)}`,
        engine: "local",
        notDisclosed: NOT_DISCLOSED,
      },
    };
  },
};
