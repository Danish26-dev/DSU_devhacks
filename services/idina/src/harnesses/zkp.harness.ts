/**
 * HARNESS 3 — ZKP proof generation.
 *
 * A REAL HTTP client to the KLAIM ZKP service (docs/SERVICE_CONTRACTS.md §3).
 * The LLM never generates a proof; this harness calls the ZKP service, which
 * owns the proof engine (local deterministic today; Midnight boundary later).
 * Only claim identifiers + credential references cross this boundary — never
 * document content.
 *
 * The protocol ZKP endpoint (POST /api/zkp/generate) accepts a BATCH request:
 *   { requestId, claims: ClaimType[], credentialRefs?: string[], did: string }
 * and resolves the subject's credentials by DID on its side. It returns
 *   { status: "PROOF_GENERATED", proofId, claims: {claim: boolean}, engine }.
 *
 * If the ZKP service is not configured/reachable, or the response is not a
 * genuine PROOF_GENERATED with a proofId, returns FAILED — the agent cannot
 * claim a proof exists.
 */
import type { ClaimType } from "@klaim/types";

import type { GenerateProofInput, GenerateProofOutput, ZkpHarness } from "./types.ts";

const TIMEOUT_MS = 30_000;

interface ZkpResponse {
  requestId?: string;
  status?: string;
  proofId?: string | null;
  proofIds?: string[] | null;
  claims?: Partial<Record<ClaimType, boolean>>;
  engine?: "local" | "midnight" | null;
}

export class ServiceZkpHarness implements ZkpHarness {
  private readonly baseUrl: string | undefined;
  private readonly token: string | undefined;

  constructor(baseUrl: string | undefined, token: string | undefined) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async generateVerificationProof(input: GenerateProofInput): Promise<GenerateProofOutput> {
    const failed = (): GenerateProofOutput => ({
      requestId: input.requestId,
      status: "FAILED",
      proofId: null,
      claims: {},
      engine: null,
    });

    if (!this.baseUrl) return failed();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let json: ZkpResponse;
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/zkp/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        // Resolve by DID only. The protocol ZKP resolver tries credentialRefs
        // FIRST and 404s if they don't match its store; Idina's wallet fixture
        // refs are not known to the protocol store, so we send `did` alone and
        // let the ZKP service resolve the subject's credentials by DID.
        body: JSON.stringify({
          requestId: input.requestId,
          claims: input.claims,
          did: input.did,
        }),
        signal: controller.signal,
      });
      if (!res.ok) return failed();
      json = (await res.json().catch(() => ({}))) as ZkpResponse;
    } catch {
      return failed();
    } finally {
      clearTimeout(timer);
    }

    if (json.status !== "PROOF_GENERATED" || !json.proofId) return failed();

    return {
      requestId: input.requestId,
      status: "PROOF_GENERATED",
      proofId: json.proofId,
      claims: json.claims ?? {},
      engine: json.engine ?? null,
    };
  }
}
