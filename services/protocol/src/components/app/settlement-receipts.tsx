/**
 * Real x402 settlement receipts recorded by the KLAIM server.
 * Transaction ids come from Algorand Testnet settlements only — never mocked.
 */
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { KeyValue, Panel, PanelHeader, PrivacyNote, StatusPill } from "@/components/app/primitives";

interface TxRecord {
  id: string;
  claim: string;
  amountUsdc: number;
  asset: string;
  network: string;
  facilitator: string;
  txId: string | null;
  explorerUrl: string | null;
  status: "requires_payment" | "settled" | "failed";
  createdAt: string;
}

export function SettlementReceipts() {
  const [rows, setRows] = useState<TxRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/transactions")
      .then((r) => r.json() as Promise<{ transactions: TxRecord[] }>)
      .then((d) => setRows(d.transactions))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <Panel accent>
      <PanelHeader title="x402 settlement receipts" hint="Algorand Testnet" />
      <div className="px-5 py-2">
        {error ? <p className="py-3 text-sm text-destructive">{error}</p> : null}
        {!rows && !error ? <p className="py-3 text-sm text-muted-foreground">Loading…</p> : null}
        {rows?.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            No settlements yet. Every paid verification recorded by this server appears here with its real transaction
            id.
          </p>
        ) : null}
        {rows?.map((t) => (
          <KeyValue
            key={t.id}
            label={`${t.claim} · ${new Date(t.createdAt).toLocaleString()}`}
            value={
              <span className="flex flex-col items-end gap-1 text-right">
                <StatusPill tone={t.status === "settled" ? "ok" : t.status === "failed" ? "warn" : "muted"}>
                  {t.status === "settled" ? "x402 settled" : t.status === "failed" ? "Payment failed" : "Unpaid"}
                </StatusPill>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {t.network} · {t.amountUsdc} {t.asset} · {t.facilitator}
                </span>
                {t.txId && t.explorerUrl ? (
                  <a
                    href={t.explorerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 break-all font-mono text-[10px] text-primary hover:underline"
                  >
                    TX: {t.txId}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                ) : (
                  <span className="font-mono text-[10px] text-muted-foreground">No transaction id — nothing settled</span>
                )}
              </span>
            }
          />
        ))}
      </div>
      <div className="p-5 pt-3">
        <PrivacyNote>
          Receipts hold payment metadata only. KLAIM never fabricates a transaction id: an entry without one means the
          payment never settled.
        </PrivacyNote>
      </div>
    </Panel>
  );
}
