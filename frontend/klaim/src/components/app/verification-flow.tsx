import { Check, CircleDollarSign, Cpu, FileCheck2, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { DemoTag, KeyValue, PrivacyNote, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { verificationService, x402Service, zkpService } from "@/lib/klaim/services";
import { useKlaim } from "@/lib/klaim/store";
import type { ClaimOption, Transaction, VerificationRecord } from "@/lib/klaim/types";
import { cn } from "@/lib/utils";

type StepState = "idle" | "running" | "done";

const stepMeta = [
  { id: "request", num: "01", title: "Request", icon: Sparkles },
  { id: "payment", num: "02", title: "Payment", icon: CircleDollarSign },
  { id: "credential", num: "03", title: "Credential", icon: FileCheck2 },
  { id: "proof", num: "04", title: "Zero-Knowledge Proof", icon: ShieldCheck },
  { id: "result", num: "05", title: "Result", icon: Cpu },
] as const;

export function VerificationFlow({
  open,
  onOpenChange,
  claim,
  onComplete,
  subjectDid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claim: ClaimOption;
  onComplete: (record: VerificationRecord) => void;
  subjectDid?: string;
}) {
  const { user } = useKlaim();
  const subject = subjectDid ?? user?.did ?? "";
  const [states, setStates] = useState<Record<string, StepState>>({});
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [record, setRecord] = useState<VerificationRecord | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!open) {
      started.current = false;
      setStates({});
      setTransaction(null);
      setRecord(null);
      return;
    }
    if (started.current || !subject) return;
    started.current = true;

    let cancelled = false;
    const set = (id: string, s: StepState) => !cancelled && setStates((prev) => ({ ...prev, [id]: s }));

    void (async () => {
      set("request", "running");
      const requirement = await x402Service.requestVerification({
        claimId: claim.id,
        subjectDid: subject,
        amountUsdc: claim.priceUsdc,
      });
      set("request", "done");

      set("payment", "running");
      const status = await x402Service.getPaymentStatus(requirement.paymentId);
      if (status !== "settled") return;
      const tx = await x402Service.getTransaction(requirement.paymentId, claim.priceUsdc);
      if (cancelled) return;
      setTransaction(tx);
      set("payment", "done");

      set("credential", "running");
      await new Promise((r) => setTimeout(r, 1100));
      set("credential", "done");

      set("proof", "running");
      await zkpService.generateProof(claim.id);
      set("proof", "done");

      set("result", "running");
      const built = verificationService.buildRecord({
        claimId: claim.id,
        claimLabel: claim.label,
        subjectDid: subject,
        requestedBy: "Claude Agent",
        transaction: tx,
        amountUsdc: claim.priceUsdc,
      });
      if (cancelled) return;
      setRecord(built);
      onComplete(built);
      set("result", "done");
    })();

    return () => {
      cancelled = true;
    };
  }, [open, subject, claim, onComplete]);

  const stepStatus = (id: string) => states[id] ?? "idle";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-none border-border bg-card sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Verification in progress <DemoTag label="Simulation" />
            </DialogTitle>
            <DialogDescription>
              KLAIM proves the requested claim without disclosing the underlying personal data.
            </DialogDescription>
          </DialogHeader>

          <ol className="mt-2 space-y-2">
            {stepMeta.map(({ id, num, title, icon: Icon }) => {
              const status = stepStatus(id);
              return (
                <li
                  key={id}
                  className={cn(
                    "border px-4 py-4 transition-colors",
                    status === "idle" && "border-border/60 opacity-50",
                    status === "running" && "border-primary/40 bg-primary/[0.05]",
                    status === "done" && "border-border bg-background/50",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] text-muted-foreground">{num}</span>
                    <Icon className="size-4 text-primary" />
                    <span className="font-mono text-[11px] uppercase tracking-[0.13em] text-foreground">{title}</span>
                    <span className="ml-auto">
                      {status === "running" ? <Loader2 className="size-4 animate-spin text-primary" /> : null}
                      {status === "done" ? <Check className="size-4 text-primary" /> : null}
                    </span>
                  </div>

                  {id === "request" && status !== "idle" ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      AI agent requested: <span className="text-foreground">{claim.label}</span>
                    </p>
                  ) : null}

                  {id === "payment" && status !== "idle" ? (
                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      <p>
                        x402 payment required — <span className="text-foreground">{claim.priceUsdc.toFixed(2)} USDC</span> on
                        Algorand Testnet
                      </p>
                      <p className="font-mono text-[11px] uppercase tracking-[0.12em]">
                        {status === "running"
                          ? "Waiting for x402 payment…"
                          : `Payment state: settled (${transaction?.kind === "demo" ? "demo placeholder" : "on-chain"})`}
                      </p>
                      <p className="text-xs">
                        This state is wired to the x402 service interface and will reflect the real Algorand Testnet
                        settlement once the backend is connected.
                      </p>
                    </div>
                  ) : null}

                  {id === "credential" && status !== "idle" ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      {status === "running" ? "Checking trusted credential…" : "✓ Credential verified"}
                    </p>
                  ) : null}

                  {id === "proof" && status !== "idle" ? (
                    <div className="mt-3">
                      <p className="text-sm text-muted-foreground">
                        {status === "running" ? "Generating privacy-preserving proof…" : "✓ Proof generated"}
                      </p>
                      <div className={cn("klaim-proof-anim mt-3", status === "done" && "is-done")} aria-hidden>
                        <span />
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                    </div>
                  ) : null}

                  {id === "result" && status === "done" && record ? (
                    <div className="mt-3">
                      <StatusPill>✓ Verified — {claim.label}</StatusPill>
                      <div className="mt-3">
                        <KeyValue label="DOB" value={<span className="text-muted-foreground">Not disclosed</span>} />
                        <KeyValue label="Aadhaar" value={<span className="text-muted-foreground">Not disclosed</span>} />
                        <KeyValue label="Document" value={<span className="text-muted-foreground">Not disclosed</span>} />
                        <KeyValue label="Proof" value={<span className="text-primary">Valid</span>} />
                        <KeyValue label="Payment" value={`${claim.priceUsdc.toFixed(2)} USDC`} />
                        <KeyValue label="Network" value="Algorand Testnet" />
                        <KeyValue
                          label="Transaction"
                          value={
                            <span className="text-muted-foreground">
                              {record.transaction.id} {record.transaction.kind === "demo" ? "(demo placeholder)" : ""}
                            </span>
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>

          {record ? (
            <>
              <VerificationResultCard record={record} onProofDetails={() => setProofOpen(true)} />
              <PrivacyNote>
                Demo transaction identifiers are placeholders. No blockchain transaction has been broadcast.
              </PrivacyNote>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <ProofDetailsDialog open={proofOpen} onOpenChange={setProofOpen} claimLabel={claim.label} />
    </>
  );
}

export function VerificationResultCard({
  record,
  onProofDetails,
}: {
  record: VerificationRecord;
  onProofDetails: () => void;
}) {
  return (
    <div className="border border-primary/35 bg-primary/[0.05] p-5">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-primary">
        <Check className="size-4" /> Verified
      </div>
      <p className="mt-3 text-2xl font-medium tracking-[-0.02em] text-foreground">{record.claimLabel}</p>
      <p className="mt-2 text-sm text-muted-foreground">Proof verified · Underlying DOB: Hidden</p>
      <div className="mt-4 border-t border-border pt-3">
        <KeyValue label="Payment" value={`${record.amountUsdc.toFixed(2)} USDC`} />
        <KeyValue label="Network" value={record.network} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" className="rounded-none" onClick={onProofDetails}>
          View Proof Details
        </Button>
        <Button variant="ghost" className="rounded-none" disabled title="Available once x402 settlement is connected">
          View Transaction
        </Button>
      </div>
    </div>
  );
}

export function ProofDetailsDialog({
  open,
  onOpenChange,
  claimLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Zero-Knowledge Proof <DemoTag label="Simulation" />
          </DialogTitle>
          <DialogDescription>
            KLAIM proved that the required claim is true without revealing the underlying personal information.
          </DialogDescription>
        </DialogHeader>
        <div>
          <KeyValue label="Private input" value={<span className="text-muted-foreground">Date of Birth — HIDDEN</span>} />
          <KeyValue label="Proven statement" value={claimLabel} />
          <KeyValue label="Public result" value={<span className="text-primary">TRUE</span>} />
          <KeyValue label="Information disclosed" value="Only the required claim" />
        </div>
        <div className="klaim-chain klaim-chain-compact mt-2">
          {["PRIVATE DATA", "ZK CIRCUIT", "VALID PROOF", "CLAIM"].map((n, i, arr) => (
            <div key={n} className="klaim-chain-item">
              <div className="klaim-chain-node">{n}</div>
              {i < arr.length - 1 ? <span className="klaim-chain-arrow" aria-hidden /> : null}
            </div>
          ))}
        </div>
        <PrivacyNote>
          This demo simulates proof generation. The production circuit will be executed by the KLAIM proving service.
        </PrivacyNote>
      </DialogContent>
    </Dialog>
  );
}
