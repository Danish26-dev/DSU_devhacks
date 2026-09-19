/**
 * GET /api/payments/:requestId/status — settlement truth for a KLAIM request.
 *
 * The KLAIM API calls this to learn whether payment for a verification request
 * has actually settled on Algorand before it transitions the request to
 * PAYMENT_SETTLED. It reports only what the transaction ledger holds — it never
 * fabricates a txId or a settled status.
 *
 * Response:
 *   { requestId, paymentStatus: "SETTLED" | "PENDING" | "FAILED" | "NONE",
 *     network, asset, txId, explorerUrl, amount, timestamp }
 */
import { createFileRoute } from "@tanstack/react-router";

import { repository } from "@/lib/klaim/server/store.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-KLAIM-Agent-Id",
};

export async function handlePaymentStatus(request: Request, requestId: string): Promise<Response> {
  const agentId = request.headers.get("X-KLAIM-Agent-Id");
  const authorization = request.headers.get("Authorization");
  const key = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : null;
  const agent = await repository.authenticateAgent(agentId, key);
  if (!agent) {
    return Response.json(
      { error: "unauthorized", message: "Invalid or missing KLAIM agent credential" },
      { status: 401, headers: CORS },
    );
  }

  const txs = repository.listTransactionsByRequest(requestId);
  if (txs.length === 0) {
    return Response.json(
      { requestId, paymentStatus: "NONE", message: "No payment recorded for this request" },
      { headers: CORS },
    );
  }

  // Prefer a settled record; otherwise report the newest record's state.
  // txs is non-empty here (guarded above), so a fallback is always defined.
  const settled = txs.find((t) => t.status === "settled");
  const chosen = settled ?? txs[0]!;

  const paymentStatus =
    chosen.status === "settled" ? "SETTLED" : chosen.status === "failed" ? "FAILED" : "PENDING";

  return Response.json(
    {
      requestId,
      paymentStatus,
      network: chosen.network,
      asset: chosen.asset,
      amount: chosen.amountUsdc,
      txId: chosen.txId,
      explorerUrl: chosen.explorerUrl ?? null,
      facilitator: chosen.facilitator,
      timestamp: chosen.createdAt,
    },
    { headers: CORS },
  );
}

export const Route = createFileRoute("/api/payments/$requestId/status")({
  server: {
    handlers: {
      GET: ({ request, params }) => handlePaymentStatus(request, params.requestId),
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
    },
  },
});
