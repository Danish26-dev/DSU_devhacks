/**
 * POST /api/payments/settle — the payment adapter endpoint the KLAIM API calls.
 *
 * Matches Danish's PAYMENT_ADAPTER_CONTRACT. The KLAIM API's ProtocolPaymentAdapter
 * POSTs here at PAYMENT_REQUIRED; this service performs the REAL x402 settlement
 * server-side (the payer wallet + signing live here, never in the KLAIM API) and
 * returns the settlement result the adapter maps into PaymentState.
 *
 *   Request  (Authorization: Bearer <INTERNAL_SERVICE_TOKEN>):
 *     { requestId, amountUsdc?, asset?, network? }
 *
 *   Response (SETTLED):
 *     { requestId, status: "SETTLED", txId, network, asset, amount, explorerUrl, timestamp }
 *   Response (FAILED):
 *     { requestId, status: "FAILED", txId: null, reason }
 *   Response (503):
 *     { requestId, status: "X402_NOT_CONFIGURED" | "PAYER_NOT_CONFIGURED", ... }
 *
 * Idempotent on requestId: if a settled transaction already exists for the
 * requestId, the same txId is returned and NO second payment is made.
 *
 * Invariant: a SETTLED status is only ever returned after GoPlausible confirms
 * a real Algorand Testnet transaction. Nothing here fabricates a txId.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { isInternalServiceRequest } from "@/lib/klaim/server/env.server";
import { repository } from "@/lib/klaim/server/store.server";
import {
  missingPayerEnv,
  payerConfigured,
  signPaymentFromResponse,
} from "@/lib/klaim/server/x402-client.server";
import {
  ALGORAND_TESTNET_NETWORK,
  loraTransactionUrl,
  verificationPriceUsdc,
  x402Configured,
} from "@/lib/klaim/server/x402.server";
import { handleCharge } from "./charge";

const bodySchema = z.object({
  requestId: z.string().min(1).max(120),
  amountUsdc: z.number().positive().max(1000).optional(),
  asset: z.string().max(16).optional(),
  network: z.string().max(120).optional(),
});

function settledResponse(
  requestId: string,
  tx: {
    amountUsdc: number;
    network: string;
    txId: string | null;
    explorerUrl?: string | null;
    createdAt: string;
  },
): Response {
  return Response.json({
    requestId,
    status: "SETTLED",
    txId: tx.txId,
    network: tx.network,
    asset: "USDC",
    amount: tx.amountUsdc,
    explorerUrl: tx.explorerUrl ?? (tx.txId ? loraTransactionUrl(tx.txId) : null),
    timestamp: tx.createdAt,
  });
}

export async function handleSettle(request: Request): Promise<Response> {
  if (!isInternalServiceRequest(request)) {
    return Response.json(
      { error: "unauthorized", message: "Missing or invalid internal service token" },
      { status: 401 },
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return Response.json(
      {
        error: "invalid_request",
        message: "Body must be { requestId, amountUsdc?, asset?, network? }",
      },
      { status: 400 },
    );
  }
  const { requestId } = parsed;
  const amountUsdc = parsed.amountUsdc ?? verificationPriceUsdc();

  // ---- idempotency: never settle the same request twice --------------------
  const existing = repository
    .listTransactionsByRequest(requestId)
    .find((t) => t.status === "settled");
  if (existing && existing.txId) {
    return settledResponse(requestId, existing);
  }

  // ---- configuration gates -------------------------------------------------
  if (!x402Configured()) {
    return Response.json(
      {
        requestId,
        status: "X402_NOT_CONFIGURED",
        txId: null,
        message: "Provider wallet not configured — cannot settle. No payment made.",
      },
      { status: 503 },
    );
  }
  if (!payerConfigured()) {
    return Response.json(
      {
        requestId,
        status: "PAYER_NOT_CONFIGURED",
        txId: null,
        message: `Payer wallet not configured server-side. Missing: ${missingPayerEnv().join(", ")}`,
      },
      { status: 503 },
    );
  }

  // ---- drive the real server-side x402 settlement --------------------------
  // Step 1: unpaid call to the payment-only route → expect a 402 with requirements.
  const authHeader = request.headers.get("Authorization") ?? "";
  const chargeUrl = new URL("/api/payments/charge", request.url).toString();
  const chargeBody = JSON.stringify({ requestId, amountUsdc });

  const unpaid = await handleCharge(
    new Request(chargeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: chargeBody,
    }),
  );

  if (unpaid.status === 200) {
    // Should not happen (route is always protected), but treat as settled if it did.
    const json = (await unpaid.json()) as Record<string, unknown>;
    return Response.json({
      requestId,
      status: "SETTLED",
      txId: json["txId"] ?? null,
      network: json["network"] ?? ALGORAND_TESTNET_NETWORK,
      asset: "USDC",
      amount: json["amount"] ?? amountUsdc,
      explorerUrl: json["explorerUrl"] ?? null,
      timestamp: json["timestamp"] ?? new Date().toISOString(),
    });
  }

  if (unpaid.status !== 402) {
    const json = (await unpaid.json().catch(() => ({}))) as Record<string, unknown>;
    return Response.json(
      {
        requestId,
        status: "FAILED",
        txId: null,
        reason: String(json["message"] ?? json["error"] ?? `Unexpected status ${unpaid.status}`),
      },
      { status: 502 },
    );
  }

  // Step 2: sign the payment from the 402 challenge (payer key stays server-side).
  let paymentHeaders: Record<string, string>;
  try {
    paymentHeaders = await signPaymentFromResponse(unpaid);
  } catch (err) {
    return Response.json(
      {
        requestId,
        status: "FAILED",
        txId: null,
        reason: `Payment signing failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 },
    );
  }

  // Step 3: retry with X-PAYMENT attached → GoPlausible settles → real txId.
  const paidRes = await handleCharge(
    new Request(chargeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader, ...paymentHeaders },
      body: chargeBody,
    }),
  );
  const paidJson = (await paidRes.json().catch(() => ({}))) as Record<string, unknown>;

  if (paidRes.status !== 200 || !paidJson["txId"]) {
    return Response.json(
      {
        requestId,
        status: "FAILED",
        txId: null,
        reason: String(paidJson["message"] ?? paidJson["error"] ?? "Settlement not confirmed"),
      },
      { status: 402 },
    );
  }

  return Response.json({
    requestId,
    status: "SETTLED",
    txId: paidJson["txId"],
    network: paidJson["network"] ?? ALGORAND_TESTNET_NETWORK,
    asset: "USDC",
    amount: paidJson["amount"] ?? amountUsdc,
    explorerUrl: paidJson["explorerUrl"] ?? null,
    timestamp: paidJson["timestamp"] ?? new Date().toISOString(),
  });
}

export const Route = createFileRoute("/api/payments/settle")({
  server: { handlers: { POST: ({ request }) => handleSettle(request) } },
});
