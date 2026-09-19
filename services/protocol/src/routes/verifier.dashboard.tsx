import { Link, createFileRoute } from "@tanstack/react-router";
import { Activity, Bot, CircleDollarSign, ShieldCheck } from "lucide-react";

import {
  DemoTag,
  KeyValue,
  PageHeading,
  Panel,
  PanelHeader,
  PrivacyNote,
  StatCard,
  StatusPill,
} from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { useKlaim } from "@/lib/klaim/store";

export const Route = createFileRoute("/verifier/dashboard")({
  head: () => ({
    meta: [
      { title: "Verifier Console — KLAIM" },
      {
        name: "description",
        content:
          "Your agents can request and pay for privacy-preserving human verification: request volume, successful verifications, x402 spend and MCP agent status.",
      },
      { property: "og:title", content: "Verifier Console — KLAIM" },
      { property: "og:description", content: "Agent-driven human verification with x402 pay-per-use settlement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifierDashboard,
});

function VerifierDashboard() {
  const { verifications } = useKlaim();
  const spend = verifications.reduce((sum, v) => sum + v.amountUsdc, 0);

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Verifier"
        title="Verifier Console"
        subtitle="Your agents can request and pay for human verification."
        actions={
          <Button asChild className="rounded-none">
            <Link to="/verifier/verify">Verify a human</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Verification Requests" value="24" hint="Last 30 days" icon={<Activity className="size-4" />} />
        <StatCard label="Successful Verifications" value="21" hint="Claims proven" icon={<ShieldCheck className="size-4" />} />
        <StatCard
          label="x402 Spend"
          value={`$${(spend + 0.18).toFixed(2)} USDC`}
          hint="Algorand Testnet"
          icon={<CircleDollarSign className="size-4" />}
        />
        <StatCard label="Agent Status" value="● Connected" hint="Simulated MCP" icon={<Bot className="size-4" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Panel accent>
          <PanelHeader title="AI Verification" hint="Agent-initiated" />
          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid size-9 place-items-center border border-border bg-background text-primary">
                  <Bot className="size-4" />
                </span>
                <div>
                  <p className="text-sm text-foreground">Verifier Agent</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Claude / GPT</p>
                </div>
              </div>
              <StatusPill>● Connected</StatusPill>
            </div>
            <div>
              <KeyValue label="MCP Status" value={<span className="text-primary">● Connected (simulated)</span>} />
              <KeyValue label="Available tools" value={<code>verify_human_age()</code>} />
              <KeyValue label="Settlement" value="x402 · USDC · Algorand Testnet" />
            </div>
            <Button asChild variant="outline" className="w-full rounded-none">
              <Link to="/verifier/agents">Open Agents &amp; MCP</Link>
            </Button>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Recent verification" hint={verifications[0]?.createdAt ?? "—"} />
          {verifications[0] ? (
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-medium text-foreground">{verifications[0].claimLabel}</p>
                <StatusPill>✓ Verified</StatusPill>
                {verifications[0].transaction.kind === "demo" ? <DemoTag label="Demo tx" /> : null}
              </div>
              <div className="mt-4">
                <KeyValue label="Paid" value={`${verifications[0].amountUsdc.toFixed(2)} USDC`} />
                <KeyValue label="Network" value={verifications[0].network} />
                <KeyValue label="Transaction" value={<span className="text-muted-foreground">{verifications[0].transaction.id}</span>} />
                <KeyValue label="Received" value={<span className="text-primary">Claim result only</span>} />
              </div>
              <Button asChild variant="outline" className="mt-5 w-full rounded-none">
                <Link to="/verifier/activity">View Activity</Link>
              </Button>
            </div>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">No verifications yet.</p>
          )}
          <div className="px-5 pb-5">
            <PrivacyNote>
              Verifiers receive the proven claim only. Date of birth, document images and identifiers are never returned.
            </PrivacyNote>
          </div>
        </Panel>
      </div>
    </div>
  );
}
