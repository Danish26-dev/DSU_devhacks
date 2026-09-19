import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { DemoTag, PageHeading, Panel, PrivacyNote, StatusPill } from "@/components/app/primitives";
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

export const Route = createFileRoute("/human/activity")({
  head: () => ({
    meta: [
      { title: "Activity — KLAIM" },
      { name: "description", content: "Verification and x402 payment history for your KLAIM identity." },
      { property: "og:title", content: "Activity — KLAIM" },
      { property: "og:description", content: "Every verification request and its pay-per-use settlement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const { verifications: demoVerifications } = useKlaim();
  const [realTxs, setRealTxs] = useState<ServerTx[]>([]);

  useEffect(() => {
    fetch("/api/v1/transactions")
      .then((r) => r.json() as Promise<{ transactions: ServerTx[] }>)
      .then((d) => setRealTxs(d.transactions.filter((t) => t.status === "settled" && t.txId)))
      .catch(() => {});
  }, []);

  // Convert real server transactions to VerificationRecord format
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

  // Show real transactions first, then demo ones
  const allVerifications = [...realVerifications, ...demoVerifications];

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Activity"
        title="Activity"
        subtitle="Verification requests made against your identity. Verifiers pay for these — you never do."
      />

      <Panel>
        <div className="divide-y divide-border">
          {allVerifications.map((v) => (
            <article key={v.id} className="grid gap-3 p-5 sm:grid-cols-[1.2fr_auto] sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-medium text-foreground">{v.claimLabel}</h2>
                  <StatusPill tone="ok">
                    {v.transaction.kind === "settled" ? "✓ Settled" : `✓ ${v.status === "verified" ? "Verified" : "Failed"}`}
                  </StatusPill>
                  {v.transaction.kind === "demo" ? <DemoTag label="Demo tx" /> : null}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Requested by {v.requestedBy} · {v.createdAt}
                </p>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                  Paid by verifier · {v.amountUsdc.toFixed(2)} USDC · {v.network}
                </p>
                {v.transaction.kind === "settled" && (
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground break-all">
                    TX: {v.transaction.id}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Not disclosed: {v.notDisclosed.join(", ")}
                </p>
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
                  disabled
                  title="Available once x402 settlement is connected"
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
