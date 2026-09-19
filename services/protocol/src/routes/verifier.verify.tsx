import { createFileRoute } from "@tanstack/react-router";
import { Bot, Terminal } from "lucide-react";
import { useCallback, useState } from "react";

import {
  DemoTag,
  KeyValue,
  PageHeading,
  Panel,
  PanelHeader,
  PrivacyNote,
  StatusPill,
} from "@/components/app/primitives";
import { ProofDetailsDialog, VerificationFlow, VerificationResultCard } from "@/components/app/verification-flow";
import { Button } from "@/components/ui/button";
import { DEMO_DID, claimOptions } from "@/lib/klaim/mock-data";
import { useKlaim } from "@/lib/klaim/store";
import type { ClaimOption, VerificationRecord } from "@/lib/klaim/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/verifier/verify")({
  head: () => ({
    meta: [
      { title: "Verify a Human — KLAIM" },
      { name: "description", content: "Request a specific identity claim such as Age > 18 without accessing unnecessary personal data, settled per request with x402 USDC." },
      { property: "og:title", content: "Verify a Human — KLAIM" },
      { property: "og:description", content: "Build a verification request, pay per use with x402 and receive only the proven claim." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifyPage,
});

function VerifyPage() {
  const { addVerification } = useKlaim();
  const [subjectDid, setSubjectDid] = useState(DEMO_DID);
  const [selected, setSelected] = useState<ClaimOption>(claimOptions[0]!);
  const [flowOpen, setFlowOpen] = useState(false);
  const [result, setResult] = useState<VerificationRecord | null>(null);
  const [proofOpen, setProofOpen] = useState(false);

  const handleComplete = useCallback(
    (record: VerificationRecord) => {
      setResult(record);
      addVerification(record);
    },
    [addVerification],
  );

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Verify"
        title="Verify a Human"
        subtitle="Request a specific claim without receiving unnecessary personal information."
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Panel accent>
          <PanelHeader title="Verification request" hint="x402 pay-per-verification" />
          <div className="space-y-5 p-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Human DID</p>
              <input
                value={subjectDid}
                onChange={(e) => setSubjectDid(e.target.value)}
                className="mt-1.5 w-full border border-border bg-background/70 px-3 py-2 font-mono text-sm text-foreground outline-none transition-colors focus:border-primary/50"
                spellCheck={false}
              />
            </div>

            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Claim</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {claimOptions.map((option) => {
                  const active = option.id === selected.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={!option.enabled}
                      onClick={() => setSelected(option)}
                      className={cn(
                        "border px-4 py-3 text-left transition-colors",
                        active && option.enabled
                          ? "border-primary/45 bg-primary/10"
                          : "border-border hover:border-primary/30",
                        !option.enabled && "cursor-not-allowed opacity-40 hover:border-border",
                      )}
                    >
                      <span className="block font-mono text-[11px] uppercase tracking-[0.12em] text-foreground">
                        {option.label}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <KeyValue label="Price" value={`${selected.priceUsdc.toFixed(2)} USDC`} />
              <KeyValue label="Network" value="Algorand Testnet" />
              <KeyValue label="Payment" value="x402 Pay-per-verification" />
              <KeyValue label="Consent" value={<span className="text-primary">Human-approved credential</span>} />
              <KeyValue label="Requested by" value="Your verifier agent" />
            </div>

            <Button
              className="w-full rounded-none"
              onClick={() => {
                setResult(null);
                setFlowOpen(true);
              }}
            >
              Request Verification
            </Button>
            <p className="text-xs text-muted-foreground">
              Payment settlement is simulated until the x402 backend is connected.
            </p>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Agent Verification" hint="Local MCP Test Client" />
            <div className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-9 place-items-center border border-border bg-background text-primary">
                    <Bot className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm text-foreground">Verifier Agent</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      Claude / GPT
                    </p>
                  </div>
                </div>
                <StatusPill>● Connected</StatusPill>
              </div>

              <div>
                <KeyValue label="MCP" value="KLAIM Verification MCP" />
                <KeyValue label="Available tool" value={<code>verify_human_age()</code>} />
                <KeyValue label="Client" value={<span className="text-muted-foreground">Local MCP Test Client (not Claude/GPT)</span>} />
              </div>

              <div className="border border-border bg-background/70 p-4 font-mono text-[11px] leading-relaxed">
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Terminal className="size-3.5 text-primary" /> mcp session <DemoTag label="Local MCP Test Client" />
                </p>
                <p className="mt-3 text-muted-foreground">
                  agent&gt; <span className="text-foreground">"Verify whether this customer is over 18."</span>
                </p>
                <p className="mt-2 text-muted-foreground">
                  klaim&gt; <span className="text-foreground">402 payment required — 0.01 USDC</span>
                </p>
                <p className="mt-2 text-primary">klaim&gt; payment settled ✓</p>
                <p className="mt-1 text-primary">klaim&gt; verification complete ✓</p>
                <p className="mt-1 text-primary">klaim&gt; age &gt; 18 ✓</p>
                <p className="mt-2 text-muted-foreground">klaim&gt; dob, document, identifiers — not disclosed</p>
              </div>

              <PrivacyNote>
                The agent receives a boolean claim result only. The real MCP server will be integrated later.
              </PrivacyNote>
            </div>
          </Panel>

          {result ? <VerificationResultCard record={result} onProofDetails={() => setProofOpen(true)} /> : null}
        </div>
      </div>

      <VerificationFlow open={flowOpen} onOpenChange={setFlowOpen} claim={selected} subjectDid={subjectDid} onComplete={handleComplete} />
      <ProofDetailsDialog open={proofOpen} onOpenChange={setProofOpen} claimLabel={result?.claimLabel ?? selected.label} />
    </div>
  );
}
