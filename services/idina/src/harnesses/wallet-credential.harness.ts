/**
 * HARNESS 1 — Wallet / Credential.
 *
 * Inspects the authorized wallet context and returns credential METADATA +
 * claim availability. It never returns raw PII (no name, DOB, Aadhaar, PAN,
 * address, license number, or document images) — only references, issuer,
 * status, and which requested claims each credential can support.
 *
 * For the hackathon this is backed by ONE deterministic DEMO CREDENTIAL fixture
 * for did:identipi:demo-user-001. It is explicitly a demo credential — NOT a
 * DigiLocker / government-issued credential. Any other DID returns no usable
 * credentials.
 */
import type { ClaimType } from "@klaim/types";

import type {
  CredentialMeta,
  GetUserCredentialsInput,
  GetUserCredentialsOutput,
  WalletCredentialHarness,
} from "./types.ts";

export const DEMO_DID = "did:identipi:demo-user-001";

/**
 * DEMO CREDENTIAL fixture. PII-free by construction: only refs, type, issuer,
 * status and the boolean-capable claims. The actual private values (DOB, etc.)
 * live behind the ZKP service, never here and never near the LLM.
 */
const DEMO_CREDENTIALS: CredentialMeta[] = [
  {
    credentialRef: "cred-identity-001",
    type: "IdentityCredential",
    issuer: "KLAIM Demo Issuer (synthetic)",
    status: "VALID",
    availableClaims: ["identity_verified", "age_over_18"],
  },
  {
    credentialRef: "cred-license-001",
    type: "DriverLicenseCredential",
    issuer: "KLAIM Demo Issuer (synthetic)",
    status: "VALID",
    availableClaims: ["license_valid"],
  },
];

export class DemoWalletCredentialHarness implements WalletCredentialHarness {
  getUserCredentials(input: GetUserCredentialsInput): Promise<GetUserCredentialsOutput> {
    const credentials = input.userDid === DEMO_DID ? DEMO_CREDENTIALS.map((c) => ({ ...c })) : [];

    const covered = new Set<ClaimType>();
    for (const c of credentials) {
      if (c.status === "VALID") for (const cl of c.availableClaims) covered.add(cl);
    }
    const allClaimsCovered =
      input.requestedClaims.length > 0 && input.requestedClaims.every((cl) => covered.has(cl));

    return Promise.resolve({
      requestId: input.requestId,
      credentials,
      allClaimsCovered,
    });
  }
}
