import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import {
  DemoTag,
  KeyValue,
  PageHeading,
  Panel,
  PanelHeader,
  PrivacyNote,
  StatusPill,
} from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { SettlementReceipts } from "@/components/app/settlement-receipts";
import { useKlaim } from "@/lib/klaim/store";
import type { VerificationRecord } from "@/lib/klaim/types";

interface ServerTx {
  id: string;
  claim: string;
  amountUsdc: number;
  asset: string;
  network: string;
  txId: string | null;
  explorerUrl: string | null;
  status: "requires_payment" | "settled" | "failed";
  createdAt: string;
}

export const Route = createFileRoute("/verifier/payments")({
  head: () => ({
    meta: [
      { title: "Payments — KLAIM Verifier" },
      { name: "description", content: "x402 settlement history for agent-initiated human verifications on Algorand Testnet." },
      { property: "og:title", content: "Payments — KLAIM Verifier" },
      { property: "og:description", content: "Per-verification x402 settlements in USDC on Algorand Testnet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { verifications: demoVerifications } = useKlaim();
  const [realTxs, setRealTxs] = useState<ServerTx[]>([]);

  useEffect(() => {
    fetch("/api/v1/transactions")
      .then((r) => r.json() as Promise<{ transactions: ServerTx[] }>)
      .then((d) => setRealTxs(d.transactions.filter((t) => t.status === "settled" && t.txId)))
      .catch(() => {});
  }, []);

  const realVerifications: VerificationRecord[] = realTxs.map((t) => ({
    id: t.id,
    claimId: "age_over_18" as const,
    claimLabel: t.claim === "age_over_18" ? "Age > 18" : t.claim,
    subjectDid: "did:identipi:demo-user-001",
    requestedBy: "AI Agent (MCP)",
    status: "verified" as const,
    amountUsdc: t.amountUsdc,
    network: "Algorand Testnet" as const,
    transaction: {
      id: t.txId!,
      kind: "settled" as const,
      amountUsdc: t.amountUsdc,
      network: "Algorand Testnet" as const,
      createdAt: new Date(t.createdAt).toLocaleString(),
      explorerUrl: t.explorerUrl,
    },
    createdAt: new Date(t.createdAt).toLocaleString(),
    notDisclosed: ["Date of Birth", "Aadhaar", "PAN", "Address", "Document image"],
  }));

  const allVerifications = [...realVerifications, ...demoVerifications];

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Payments"
        title="Payments"
        subtitle="Every verification your agent requests is settled per use with x402."
      />

      <SettlementReceipts />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel accent>
          <PanelHeader title="Wallet" hint={realTxs.length > 0 ? "Live" : "Demo"} />
          <div className="space-y-3 p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center border border-border bg-background text-primary">
                <Wallet className="size-4" />
              </span>
              <div>
                <p className="text-sm text-foreground">Algorand Testnet</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Agent settlement wallet
                </p>
              </div>
            </div>
            <div>
              <KeyValue label="x402 Status" value={<span className="text-primary">● Enabled</span>} />
              <KeyValue label="Facilitator" value={<span className="text-muted-foreground">GoPlausible</span>} />
              <KeyValue label="Settlements" value={`${realTxs.length} real transaction${realTxs.length !== 1 ? "s" : ""}`} />
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Settlement model" />
          <div className="px-5 py-2">
            <KeyValue label="Protocol" value="x402" />
            <KeyValue label="Asset" value="USDC" />
            <KeyValue label="Network" value="Algorand Testnet" />
            <KeyValue label="Price per verification" value="0.01 USDC" />
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Payment history" hint="x402 settlements" />
        <div className="divide-y divide-border">
          {allVerifications.map((v) => (
            <article key={v.id} className="grid gap-3 p-5 sm:grid-cols-[1.2fr_auto] sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-medium text-foreground">{v.claimLabel}</h2>
                  <StatusPill tone="ok">
                    {v.transaction.kind === "settled" ? "✓ Settled" : "✓ Settled"}
                  </StatusPill>
                  {v.transaction.kind === "demo" ? <DemoTag label="Demo" /> : null}
                </div>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  {v.amountUsdc.toFixed(2)} USDC · {v.network} · {v.transaction.id}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{v.createdAt}</p>
              </div>
              {v.transaction.kind === "settled" && v.transaction.explorerUrl ? (
                <a
                  href={v.transaction.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="justify-self-start sm:justify-self-end"
                >
                  <Button variant="outline" className="rounded-none">
                    <ExternalLink className="size-4" /> View on Lora
                  </Button>
                </a>
              ) : (
                <Button
                  variant="outline"
                  className="justify-self-start rounded-none sm:justify-self-end"
                  disabled={v.transaction.kind === "demo"}
                  title={v.transaction.kind === "demo" ? "Available once x402 settlement is connected" : undefined}
                >
                  <ExternalLink className="size-4" /> View on Lora
                </Button>
              )}
            </article>
          ))}
        </div>
      </Panel>
    </div>
  );
}
