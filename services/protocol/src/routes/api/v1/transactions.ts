/**
 * GET /api/v1/transactions — settlement receipts recorded by this server.
 * Only payment metadata: no PII, no keys, no credential content.
 */
import { createFileRoute } from "@tanstack/react-router";

import { repository } from "@/lib/klaim/server/store.server";
import { loraTransactionUrl } from "@/lib/klaim/server/x402.server";

export const Route = createFileRoute("/api/v1/transactions")({
  server: {
    handlers: {
      GET: () =>
        Response.json({
          transactions: repository.listTransactions().map((t) => ({
            ...t,
            explorerUrl: t.txId ? (t.explorerUrl ?? loraTransactionUrl(t.txId)) : null,
          })),
        }),
    },
  },
});
