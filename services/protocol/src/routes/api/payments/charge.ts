/**
 * POST /api/payments/charge — x402-protected, payment-ONLY (no verification).
 *
 * This is the protected resource the settlement flow pays. It exists so that
 * payment/settlement is cleanly separated from claim verification: the KLAIM
 * API's payment adapter settles here, and verification/ZKP happen through the
 * separate /api/v1/verify/* + /api/zkp/* seams.
 *
 * Order (load-bearing):
 *   402 (official x402 SDK) → X-PAYMENT → GoPlausible → Algorand settlement → 200
 *
 * Nothing here fabricates a txId. When the provider wallet is unconfigured it
 * returns X402_NOT_CONFIGURED and no settlement occurs.
 *
 * Auth: internal service token (the KLAIM API), NOT an agent key — this route
 * is a backend-to-backend settlement primitive, not a public agent endpoint.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { isInternalServiceRequest } from "@/lib/klaim/server/env.server";
import { repository } from "@/lib/klaim/server/store.server";
import { requirePayment, verificationPriceUsdc } from "@/lib/klaim/server/x402.server";

const PATH = "/api/payments/charge";

const bodySchema = z.object({
  requestId: z.string().min(1).max(120),
  amountUsdc: z.number().positive().max(1000).optional(),
});

export async function handleCharge(request: Request): Promise<Response> {
  if (!isInternalServiceRequest(request)) {
    return Response.json(
      { error: "unauthorized", message: "Missing or invalid internal service token" },
      { status: 401 },
    );
  }

  let body: unknown;
  let parsed: z.infer<typeof bodySchema>;
  try {
    body = await request.json();
    parsed = bodySchema.parse(body);
  } catch {
    return Response.json(
      {
        error: "invalid_request",
        message: "Body must be { requestId: string, amountUsdc?: number }",
      },
      { status: 400 },
    );
  }

  const price = parsed.amountUsdc ?? verificationPriceUsdc();

  const gate = await requirePayment({ request, path: PATH, body, amountUsdc: price });

  if (gate.type === "not_configured") {
    repository.recordTransaction({
      agentId: null,
      requestId: parsed.requestId,
      claim: "payment",
      amountUsdc: price,
      asset: "USDC",
      network: "algorand:testnet",
      facilitator: "GoPlausible",
      txId: null,
      status: "requires_payment",
    });
    return gate.response;
  }

  if (gate.type !== "paid") {
    // 402 with payment requirements (payer must attach X-PAYMENT and retry).
    repository.recordTransaction({
      agentId: null,
      requestId: parsed.requestId,
      claim: "payment",
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
      agentId: null,
      requestId: parsed.requestId,
      claim: "payment",
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
  const tx = repository.recordTransaction({
    agentId: null,
    requestId: parsed.requestId,
    claim: "payment",
    amountUsdc: receipt.amount,
    asset: "USDC",
    network: receipt.network,
    facilitator: receipt.facilitator,
    txId: receipt.txId,
    explorerUrl: receipt.explorerUrl,
    status: "settled",
  });

  repository.audit(
    parsed.requestId,
    "payment.settled",
    `Settled ${receipt.amount} USDC for ${parsed.requestId} (tx=${receipt.txId})`,
  );

  return Response.json({
    requestId: parsed.requestId,
    status: "settled",
    network: receipt.network,
    asset: receipt.asset,
    amount: receipt.amount,
    facilitator: receipt.facilitator,
    txId: receipt.txId,
    explorerUrl: receipt.explorerUrl,
    timestamp: receipt.timestamp,
    recordId: tx.id,
  });
}

export const Route = createFileRoute("/api/payments/charge")({
  server: { handlers: { POST: ({ request }) => handleCharge(request) } },
});
