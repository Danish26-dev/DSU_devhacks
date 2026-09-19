/**
 * Claims boundary — the single source of truth for claim identifiers.
 *
 * Danish's KLAIM API contract locks the public claim IDs as:
 *
 *   identity_verified · age_over_18 · license_valid   (American spelling)
 *
 * KLAIM's internal credential store historically uses `licence_valid`
 * (British spelling). Rather than rename working internals, we translate at
 * this one boundary. Every route/MCP tool that faces the KLAIM API MUST use
 * the contract IDs; everything below the provider agent may use internal IDs.
 *
 * If a future claim is added, add it here first — nothing else should hardcode
 * a claim string.
 */

/** Public claim identifiers exactly as the KLAIM API contract defines them. */
export const CONTRACT_CLAIMS = ["identity_verified", "age_over_18", "license_valid"] as const;
export type ContractClaim = (typeof CONTRACT_CLAIMS)[number];

/** Internal derived-claim keys as stored on credentials in store.server.ts. */
export type InternalClaim = "identity_verified" | "age_over_18" | "licence_valid";

/**
 * Contract → internal. Only `license_valid` differs (spelling); the rest are
 * identity mappings kept explicit so the boundary is obvious and total.
 */
const CONTRACT_TO_INTERNAL: Record<ContractClaim, InternalClaim> = {
  identity_verified: "identity_verified",
  age_over_18: "age_over_18",
  license_valid: "licence_valid",
};

const INTERNAL_TO_CONTRACT: Record<InternalClaim, ContractClaim> = {
  identity_verified: "identity_verified",
  age_over_18: "age_over_18",
  licence_valid: "license_valid",
};

export function isContractClaim(value: unknown): value is ContractClaim {
  return typeof value === "string" && (CONTRACT_CLAIMS as readonly string[]).includes(value);
}

/** Normalize any inbound claim (accepts either spelling) to the contract ID. */
export function toContractClaim(claim: string): ContractClaim | null {
  if (isContractClaim(claim)) return claim;
  if (claim === "licence_valid") return "license_valid";
  return null;
}

/** Map a contract claim to the internal derived-claim key used on credentials. */
export function toInternalClaim(claim: ContractClaim): InternalClaim {
  return CONTRACT_TO_INTERNAL[claim];
}

/** Map an internal claim back to the public contract ID. */
export function toContractClaimFromInternal(claim: InternalClaim): ContractClaim {
  return INTERNAL_TO_CONTRACT[claim];
}

/** Human-readable labels for logs/audit — never user-facing PII. */
export const CLAIM_LABELS: Record<ContractClaim, string> = {
  identity_verified: "Identity verified",
  age_over_18: "Age over 18",
  license_valid: "Driving licence valid",
};
