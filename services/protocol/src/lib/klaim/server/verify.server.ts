/**
 * Shared verification handler — the x402-gated core behind every verify route.
 *
 * Order is load-bearing and must never change:
 *
 *   auth → 402 (official x402 SDK) → payment → GoPlausible → Algorand
 *   settlement → provider agent → credential check → ZK verification → 200
 *
 * The protected verification result NEVER executes before settlement confirms.
 * This is the KLAIM invariant: NO CONFIRMED SETTLEMENT → NO VERIFYING.
 *
 * `requestId` (KLAIM API's REQ-<id>) is threaded through so the settlement
 * transaction, audit trail and response are all correlated to the KLAIM API's
 * verification request. It is optional: direct/demo callers may omit it.
 */
import { z } from "zod";

import { isContractClaim, type ContractClaim, CLAIM_LABELS } from "./claims";
import { providerAgentService } from "./provider-agent.server";
import { repository } from "./store.server";
import { requirePayment, verificationPriceUsdc } from "./x402.server";

const bodySchema = z.object({
  did: z.string().min(6).max(200),
  requestId: z.string().min(1).max(120).optional(),
});

export interface VerifyOptions {
  /** Contract claim to verify. */
  claim: ContractClaim;
  /** Resource path used by the x402 route config (must match the mounted route). */
  path: string;
}

export async function handleVerifyClaim(
  request: Request,
  options: VerifyOptions,
): Promise<Response> {
  const { claim, path } = options;

  // ---- auth ----------------------------------------------------------------
  const agentId = request.headers.get("X-KLAIM-Agent-Id");
  const authorization = request.headers.get("Authorization");
  const key = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : null;
  const agent = await repository.authenticateAgent(agentId, key);
  if (!agent) {
    return Response.json(
      { error: "unauthorized", message: "Invalid or missing KLAIM agent credential" },
      { status: 401 },
    );
  }

  // A permitted-tools list, when present, must include this claim's tool. An
  // empty list means "all tools permitted" (matches the MCP registry filter).
  // Claim validity is guaranteed by the caller passing a ContractClaim.
  if (!isContractClaim(claim)) {
    return Response.json(
      { error: "unsupported_claim", message: `Unknown claim: ${claim}` },
      { status: 400 },
    );
  }

  let body: unknown;
  let parsed: z.infer<typeof bodySchema>;
  try {
    body = await request.json();
    parsed = bodySchema.parse(body);
  } catch {
    return Response.json(
      { error: "invalid_request", message: "Body must be { did: string, requestId?: string }" },
      { status: 400 },
    );
  }
  const requestId = parsed.requestId ?? null;

  const price = verificationPriceUsdc();
  if (price > agent.spending.perRequestLimitUsdc) {
    return Response.json(
      {
        error: "spend_limit_exceeded",
        message: "Per-request spending limit is lower than the price",
        requestId,
      },
      { status: 403 },
    );
  }

  // ---- x402 boundary -------------------------------------------------------
  const gate = await requirePayment({ request, path, body, amountUsdc: price });

  if (gate.type !== "paid") {
    repository.recordTransaction({
      agentId: agent.id,
      requestId,
      claim,
      amountUsdc: price,
      asset: "USDC",
      network: "algorand:testnet",
      facilitator: "GoPlausible",
      txId: null,
      status: "requires_payment",
    });
    return gate.response;
  }

  const settlement = await gate.settle();
  if (!settlement.ok) {
    repository.recordTransaction({
      agentId: agent.id,
      requestId,
      claim,
      amountUsdc: price,
      asset: "USDC",
      network: "algorand:testnet",
      facilitator: "GoPlausible",
      txId: null,
      status: "failed",
    });
    return settlement.response;
  }
  const receipt = settlement.receipt;

  // ---- paid: provider agent may now run ------------------------------------
  const result = await providerAgentService.verifyClaim(parsed.did, claim);

  const tx = repository.recordTransaction({
    agentId: agent.id,
    requestId,
    claim,
    amountUsdc: receipt.amount,
    asset: "USDC",
    network: receipt.network,
    facilitator: receipt.facilitator,
    txId: receipt.txId,
    explorerUrl: receipt.explorerUrl,
    status: "settled",
  });

  repository.audit(
    parsed.did,
    result.verified ? "verification.completed" : "verification.declined",
    `Agent ${agent.id} requested ${CLAIM_LABELS[claim]} → ${result.verified} (runtime=${result.runtime}, tx=${receipt.txId}${requestId ? `, request=${requestId}` : ""})`,
  );

  return Response.json({
    ...(requestId ? { requestId } : {}),
    verified: result.verified,
    claim,
    ...(result.reason ? { reason: result.reason } : {}),
    proof: result.proof
      ? {
          verified: result.proof.verified,
          engine: result.proof.engine,
          id: result.proof.id,
          notDisclosed: result.proof.notDisclosed,
        }
      : { verified: false, engine: "local" },
    providerAgent: { runtime: result.runtime, steps: result.steps },
    payment: {
      status: receipt.status,
      network: receipt.network,
      asset: receipt.asset,
      amount: receipt.amount,
      facilitator: receipt.facilitator,
      txId: receipt.txId,
      explorerUrl: receipt.explorerUrl,
      timestamp: receipt.timestamp,
      recordId: tx.id,
    },
  });
}
