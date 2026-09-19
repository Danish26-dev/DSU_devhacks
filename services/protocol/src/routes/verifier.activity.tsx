import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { DemoTag, KeyValue, PageHeading, Panel, PrivacyNote, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/verifier/activity")({
  head: () => ({
    meta: [
      { title: "Activity — KLAIM Verifier" },
      { name: "description", content: "Every verification your agents requested with real Algorand Testnet transactions." },
      { property: "og:title", content: "Activity — KLAIM Verifier" },
      { property: "og:description", content: "Request, payment, settlement and result for each agent verification." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifierActivityPage,
});

function VerifierActivityPage() {
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
        eyebrow="Activity"
        title="Activity"
        subtitle="Verification requested → payment → settlement → result."
      />

      <Panel>
        <div className="divide-y divide-border">
          {allVerifications.map((v) => (
            <article key={v.id} className="grid gap-4 p-5 sm:grid-cols-[1.2fr_auto] sm:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-medium text-foreground">{v.claimLabel}</h2>
                  <StatusPill tone="ok">
                    {v.transaction.kind === "settled" ? "✓ Settled" : `✓ ${v.status === "verified" ? "Verified" : "Failed"}`}
                  </StatusPill>
                  {v.transaction.kind === "demo" ? <DemoTag label="Demo tx" /> : null}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Requested by {v.requestedBy} · Subject {v.subjectDid} · {v.createdAt}
                </p>
                <div className="mt-3">
                  <KeyValue label="Paid" value={`${v.amountUsdc.toFixed(2)} USDC`} />
                  <KeyValue label="Network" value={v.network} />
                  <KeyValue
                    label="Transaction"
                    value={
                      v.transaction.kind === "settled" && v.transaction.explorerUrl ? (
                        <a
                          href={v.transaction.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline break-all"
                        >
                          {v.transaction.id} <ExternalLink className="size-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">{v.transaction.id}</span>
                      )
                    }
                  />
                  <KeyValue label="Not disclosed" value={<span className="text-muted-foreground">{v.notDisclosed.join(", ")}</span>} />
                </div>
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
                  className="rounded-none justify-self-start sm:justify-self-end"
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

      {demoVerifications.some((v) => v.transaction.kind === "demo") && (
        <PrivacyNote>
          Entries marked "Demo tx" are seeded examples. Real x402 settlements show the actual Algorand Testnet
          transaction and link directly to Lora.
        </PrivacyNote>
      )}
    </div>
  );
}
