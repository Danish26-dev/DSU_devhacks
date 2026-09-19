/**
 * KLAIM ZKP Service — proof generation boundary.
 *
 *   POST /api/zkp/generate
 *   Authorization: Bearer klm_...        (KLAIM agent access key)
 *   X-KLAIM-Agent-Id: agent_...
 *
 * Contract (agreed with KLAIM API / Danish):
 *
 *   Request:  { requestId, claim, credentialRef?, did? }
 *   Response: { requestId, verified, claim, proofId, engine }
 *
 * This is a thin wrapper over the existing zkpService. It NEVER settles a
 * payment and NEVER returns DOB/Aadhaar/PAN/address/document data. The KLAIM
 * API is responsible for ensuring PAYMENT_SETTLED before calling this endpoint;
 * proof generation on its own is not a paid action and produces no txId.
 *
 * Honesty: when MIDNIGHT_PROVER_URL is unset the proof is labelled
 * engine="local" and must not be presented as a real Midnight ZK proof.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { toContractClaim } from "@/lib/klaim/server/claims";
import { isInternalServiceRequest } from "@/lib/klaim/server/env.server";
import { repository } from "@/lib/klaim/server/store.server";
import { zkpService } from "@/lib/klaim/server/zkp.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KLAIM-Agent-Id",
};

// Accepts BOTH shapes:
//   Batch (Idina / KLAIM API, per SERVICE_CONTRACTS.md §3):
//     { requestId, claims: string[], credentialRefs?: string[], did? }
//   Single (MCP / external agent, back-compat):
//     { requestId?, claim, credentialRef?, did? }
const bodySchema = z
  .object({
    requestId: z.string().min(1).max(120).optional(),
    claim: z.string().min(3).max(64).optional(),
    claims: z.array(z.string().min(3).max(64)).min(1).max(16).optional(),
    credentialRef: z.string().min(1).max(200).optional(),
    credentialRefs: z.array(z.string().min(1).max(200)).max(16).optional(),
    did: z.string().min(6).max(200).optional(),
  })
  .refine((b) => Boolean(b.claim) || Boolean(b.claims?.length), {
    message: "Provide `claim` (single) or `claims` (batch)",
  });

export async function handleZkpGenerate(request: Request): Promise<Response> {
  // Two accepted callers:
  //   1. Trusted backends (Idina / KLAIM API) via the internal service token —
  //      server-to-server, same secret as /api/payments/settle.
  //   2. External agents via a KLAIM agent key (X-KLAIM-Agent-Id + klm_... bearer).
  // Either is sufficient; internal token is checked first (cheaper).
  const internal = isInternalServiceRequest(request);
  if (!internal) {
    const agentId = request.headers.get("X-KLAIM-Agent-Id");
    const authorization = request.headers.get("Authorization");
    const key = authorization?.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : null;
    const agent = await repository.authenticateAgent(agentId, key);
    if (!agent) {
      return Response.json(
        {
          error: "unauthorized",
          message: "Provide the internal service token or a valid KLAIM agent credential",
        },
        { status: 401, headers: CORS },
      );
    }
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json(
      {
        error: "invalid_request",
        message: "Body must be { requestId?, claim, ... } or { requestId, claims: [...], ... }",
      },
      { status: 400, headers: CORS },
    );
  }

  const isBatch = Boolean(parsed.claims?.length);
  const rawClaims = isBatch ? parsed.claims! : [parsed.claim!];

  // Normalize every claim at the boundary (accepts either spelling).
  const contractClaims = rawClaims.map((c) => toContractClaim(c));
  const unknownIdx = contractClaims.findIndex((c) => c === null);
  if (unknownIdx !== -1) {
    return Response.json(
      {
        error: "unsupported_claim",
        message: `Unknown claim: ${rawClaims[unknownIdx]}`,
        requestId: parsed.requestId ?? null,
      },
      { status: 400, headers: CORS },
    );
  }

  // Resolve a credential for a given claim. Order:
  //   1. explicit credentialRef (by ref or id), if it matches;
  //   2. fall back to the DID's first verified credential.
  // The fallback is what makes the wire forgiving: callers (e.g. Idina) may
  // send fixture credentialRefs this store doesn't know AND a valid DID — we
  // still resolve via the DID rather than 404. No document bytes are touched.
  const resolveCredential = (ref?: string) => {
    if (ref) {
      const byRef = repository
        .listCredentials()
        .find((c) => c.credentialRef === ref || c.id === ref);
      if (byRef) return byRef;
    }
    if (parsed.did) {
      return repository.listCredentials(parsed.did).find((c) => c.status === "verified");
    }
    return undefined;
  };

  const caller = internal ? "internal-service" : "agent";

  // ---- batch response (Idina / KLAIM API) ----------------------------------
  if (isBatch) {
    const claimsResult: Record<string, boolean> = {};
    const proofIds: string[] = [];
    let engine: "local" | "midnight" = "local";

    for (let i = 0; i < contractClaims.length; i++) {
      const claim = contractClaims[i]!;
      const credential = resolveCredential(parsed.credentialRefs?.[i]);
      if (!credential) {
        return Response.json(
          {
            error: "credential_not_found",
            message: `No credential resolves for claim ${claim}`,
            requestId: parsed.requestId ?? null,
          },
          { status: 404, headers: CORS },
        );
      }
      const proof = await zkpService.prove(claim, credential);
      claimsResult[claim] = proof.verified;
      proofIds.push(proof.proof.id);
      engine = proof.proof.engine;
      if (parsed.requestId) {
        repository.audit(
          credential.subjectDid,
          "zkp.generated",
          `${caller} proof ${claim} (request=${parsed.requestId}, engine=${proof.proof.engine}, verified=${proof.verified})`,
        );
      }
    }

    return Response.json(
      {
        requestId: parsed.requestId ?? null,
        status: "PROOF_GENERATED",
        // A single aggregate proofId plus the per-claim ids for traceability.
        proofId: proofIds[0]!,
        proofIds,
        claims: claimsResult,
        engine,
        notDisclosed: [
          "date_of_birth",
          "aadhaar_number",
          "pan_number",
          "address",
          "document_image",
        ],
      },
      { headers: CORS },
    );
  }

  // ---- single-claim response (MCP / agent, back-compat) --------------------
  const claim = contractClaims[0]!;
  const credential = resolveCredential(parsed.credentialRef);
  if (!credential) {
    return Response.json(
      {
        error: "credential_not_found",
        message: "No credential resolves for the given credentialRef/did",
        requestId: parsed.requestId ?? null,
      },
      { status: 404, headers: CORS },
    );
  }

  const proof = await zkpService.prove(claim, credential);
  if (parsed.requestId) {
    repository.audit(
      credential.subjectDid,
      "zkp.generated",
      `${caller} generated proof for ${claim} (request=${parsed.requestId}, engine=${proof.proof.engine}, verified=${proof.verified})`,
    );
  }

  return Response.json(
    {
      requestId: parsed.requestId ?? null,
      verified: proof.verified,
      claim,
      proofId: proof.proof.id,
      engine: proof.proof.engine,
      notDisclosed: proof.proof.notDisclosed,
    },
    { headers: CORS },
  );
}

export const Route = createFileRoute("/api/zkp/generate")({
  server: {
    handlers: {
      POST: ({ request }) => handleZkpGenerate(request),
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
