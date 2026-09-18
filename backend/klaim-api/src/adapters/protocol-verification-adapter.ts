/**
 * ProtocolVerificationAdapter — the REAL VerificationAdapter.
 *
 * Replaces MockVerificationAdapter by calling the protocol ZKP service
 * (POST {ZKP_SERVICE_URL}/api/zkp/generate) over HTTP. It sends the batch body
 * { requestId, claims, did } and reads the response the same way Idina's
 * (verified) ZKP harness does: success only when status === "PROOF_GENERATED"
 * and a real proofId is present. The protocol ZKP service resolves the
 * subject's credentials by DID and owns the proof engine — this adapter never
 * fabricates a proof.
 *
 * Wired only when ZKP_SERVICE_URL + INTERNAL_SERVICE_TOKEN are both set (see
 * index.ts). Otherwise MockVerificationAdapter remains the default.
 *
 * Only claim identifiers + the subject DID cross this boundary — never document
 * content (privacy surface, per docs/SERVICE_CONTRACTS.md §3).
 */
import type { ClaimType, ProofEngine, ProofResult } from "@klaim/types";

import type {
  VerificationAdapter,
  VerificationInput,
  VerificationOutcome,
} from "./verification-adapter";

const DEFAULT_TIMEOUT_MS = 30_000;

interface ZkpResponse {
  requestId?: string;
  status?: string;
  proofId?: string | null;
  proofIds?: string[] | null;
  claims?: Partial<Record<ClaimType, boolean>>;
  engine?: ProofEngine | null;
  reason?: string;
  error?: string;
}

export interface ProtocolVerificationAdapterOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}

export class ProtocolVerificationAdapter implements VerificationAdapter {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(opts: ProtocolVerificationAdapterOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async verify(input: VerificationInput): Promise<VerificationOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let json: ZkpResponse;
    try {
      const res = await fetch(`${this.baseUrl}/api/zkp/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        // Resolve by DID (drop credential refs): the protocol ZKP resolver
        // matches the subject's credentials from the DID. Same body shape Idina
        // uses successfully against this service.
        body: JSON.stringify({
          requestId: input.requestId,
          claims: input.claims,
          did: input.userDid,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        return { kind: "verification_failed", reason: `ZKP service returned ${res.status}` };
      }
      json = (await res.json().catch(() => ({}))) as ZkpResponse;
    } catch {
      return { kind: "verification_failed", reason: "ZKP service unreachable" };
    } finally {
      clearTimeout(timer);
    }

    if (json.status !== "PROOF_GENERATED" || !json.proofId) {
      return {
        kind: "verification_failed",
        reason: json.reason ?? json.error ?? "Proof was not generated",
      };
    }

    // Prefer the service's claim map; fall back to marking every requested
    // claim true (a PROOF_GENERATED response attests the requested claims).
    const claimResults: Partial<Record<ClaimType, boolean>> = {};
    if (json.claims && Object.keys(json.claims).length > 0) {
      for (const [claim, value] of Object.entries(json.claims)) {
        claimResults[claim as ClaimType] = Boolean(value);
      }
    } else {
      for (const claim of input.claims) claimResults[claim] = true;
    }

    const proof: ProofResult = {
      proofId: json.proofId,
      engine: json.engine ?? "local",
      notDisclosed: ["date_of_birth", "aadhaar_number", "pan_number", "address", "document_image"],
    };

    return { kind: "proven", claimResults, proof };
  }
}
