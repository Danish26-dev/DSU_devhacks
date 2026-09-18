/**
 * Verification flow step dialogs — the three interactive moments a user sees as
 * a verification request advances through the KLAIM V2 lifecycle:
 *
 *   1. WalletAccessDialog        — the identity wallet is accessed to find the
 *                                  credentials that can answer the requested
 *                                  claims (runs around CONSENT_GRANTED).
 *   2. PaymentConfirmationDialog — the x402 / USDC settlement step
 *                                  (PAYMENT_REQUIRED → PAYMENT_SETTLED), driven
 *                                  by the REAL backend payment state + txId.
 *   3. ZkpGenerationDialog       — zero-knowledge proof generation
 *                                  (VERIFYING → PROOF_GENERATED), driven by the
 *                                  REAL proofId + engine returned by the backend.
 *
 * These popups are presentational: they render the authoritative backend status
 * that pages/Verify.tsx already polls. They never fabricate a txId or proofId —
 * a value is shown only when the backend has actually produced it. When the
 * backend runs its development mock adapters, the dialogs say so explicitly.
 */
import { Check, CircleDollarSign, Cpu, ExternalLink, Loader2, ShieldCheck, Wallet, X } from "lucide-react";
import type { ReactNode } from "react";

import { DemoTag, KeyValue, PrivacyNote, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClaimType, PaymentState, ProofResult, VerificationRequestStatus } from "@klaim/types";
import { cn } from "@/lib/utils";

/* --------------------------------------------------------------- shared */

const CLAIM_LABEL: Record<ClaimType, string> = {
  identity_verified: "Identity verified",
  age_over_18: "Age over 18",
  license_valid: "Valid driving license",
};

/** A local credential the wallet holds — mirrors the demo wallet fixture. */
export interface WalletCredential {
  credentialRef: string;
  type: string;
  issuer: string;
  covers: ClaimType[];
}

function DialogShell({
  open,
  onOpenChange,
  icon,
  title,
  demoLabel,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: ReactNode;
  title: string;
  demoLabel?: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-none border-border bg-card sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-primary">{icon}</span>
            {title}
            {demoLabel ? <DemoTag label={demoLabel} /> : null}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------------------- 0. consent gate (interactive) */

/**
 * Interactive consent prompt. The verification flow PAUSES on this dialog until
 * the user explicitly allows or denies — modelling Idina asking the wallet for
 * consent before it proceeds. Used twice: before credential access, and again
 * before zero-knowledge proof generation.
 */
export function ConsentGateDialog({
  open,
  title,
  requester,
  question,
  detail,
  claims,
  busy,
  onAllow,
  onDeny,
}: {
  open: boolean;
  title: string;
  requester: string;
  question: string;
  detail: string;
  claims?: ClaimType[];
  busy?: boolean;
  onAllow: () => void;
  onDeny: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onDeny() : undefined)}>
      <DialogContent className="rounded-none border-primary/30 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            {title}
            <DemoTag label="Consent" />
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary">{requester}</span> is
            requesting your consent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-foreground">{question}</p>

          {claims && claims.length > 0 ? (
            <ul className="space-y-1.5">
              {claims.map((c) => (
                <li
                  key={c}
                  className="flex items-center gap-2 border border-border bg-background/50 px-3 py-2 text-sm text-foreground"
                >
                  <Check className="size-3.5 text-primary" />
                  {CLAIM_LABEL[c]}
                </li>
              ))}
            </ul>
          ) : null}

          <PrivacyNote>{detail}</PrivacyNote>

          <div className="grid grid-cols-2 gap-3">
            <Button className="rounded-none" disabled={busy} onClick={onAllow}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Allow
            </Button>
            <Button variant="outline" className="rounded-none" disabled={busy} onClick={onDeny}>
              <X className="size-4" /> Deny
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------- 1. wallet access */

export function WalletAccessDialog({
  open,
  onOpenChange,
  did,
  requestedClaims,
  credentials,
  allClaimsCovered,
  onContinue,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  did: string;
  requestedClaims: ClaimType[];
  credentials: WalletCredential[];
  allClaimsCovered: boolean;
  onContinue: () => void;
  busy?: boolean;
}) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      icon={<Wallet className="size-4" />}
      title="Wallet access"
      demoLabel="Local wallet"
      description="KLAIM is checking your identity wallet for credentials that can answer this request. Only claim answers leave your device — never the underlying documents."
    >
      <div className="space-y-4">
        <KeyValue label="Subject DID" value={<span className="truncate">{did}</span>} />

        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
            Requested claims
          </p>
          <ul className="space-y-1.5">
            {requestedClaims.map((c) => {
              const covered = credentials.some((cred) => cred.covers.includes(c));
              return (
                <li
                  key={c}
                  className="flex items-center justify-between border border-border bg-background/50 px-3 py-2"
                >
                  <span className="text-sm text-foreground">{CLAIM_LABEL[c]}</span>
                  <StatusPill tone={covered ? "ok" : "warn"}>
                    {covered ? "In wallet" : "Missing"}
                  </StatusPill>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
            Credentials found ({credentials.length})
          </p>
          <div className="space-y-2">
            {credentials.map((cred) => (
              <div key={cred.credentialRef} className="border border-border bg-background/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{cred.type}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{cred.credentialRef}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Issuer: {cred.issuer}</p>
              </div>
            ))}
            {credentials.length === 0 ? (
              <p className="text-sm text-muted-foreground">No credentials in this wallet.</p>
            ) : null}
          </div>
        </div>

        <PrivacyNote>
          Your wallet stays on your device. KLAIM only reads which claims a credential can answer — not the
          personal data inside it.
        </PrivacyNote>

        <Button
          className="w-full rounded-none"
          disabled={busy || !allClaimsCovered}
          onClick={onContinue}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          {allClaimsCovered ? "Continue to payment" : "Wallet cannot cover all claims"}
        </Button>
      </div>
    </DialogShell>
  );
}

/* --------------------------------------------- 2. payment confirmation */

export function PaymentConfirmationDialog({
  open,
  onOpenChange,
  status,
  payment,
  amountUsdc = 0.01,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: VerificationRequestStatus | null;
  payment?: Partial<Pick<PaymentState, "status" | "txId" | "network" | "amount" | "explorerUrl">> | null;
  amountUsdc?: number;
  /** When provided, shows a Continue action once settlement is confirmed. */
  onContinue?: () => void;
}) {
  const settled = payment?.status === "SETTLED" && Boolean(payment?.txId);
  const failed = status === "PAYMENT_FAILED" || payment?.status === "FAILED";
  const waiting = !settled && !failed;
  const amount = typeof payment?.amount === "number" ? payment.amount : amountUsdc;
  const network = payment?.network ?? "algorand:testnet";
  // A mock/dev tx id starts with MOCK-; a real settlement is a base32 Algorand id.
  const isMockTx = Boolean(payment?.txId && payment.txId.startsWith("MOCK-"));

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      icon={<CircleDollarSign className="size-4" />}
      title="Payment settlement"
      demoLabel={isMockTx ? "Dev adapter" : undefined}
      description="The verifier (QuickDrop) pays per request via x402 — you never pay. Settlement happens on Algorand in USDC before any proof is generated: no settlement, no verification."
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <StatusPill tone={settled ? "ok" : failed ? "warn" : "muted"}>
            {settled ? "Settled" : failed ? "Failed" : "Awaiting settlement"}
          </StatusPill>
          {waiting ? <Loader2 className="size-4 animate-spin text-primary" /> : null}
        </div>

        <div>
          <KeyValue label="Amount" value={`${amount.toFixed(2)} USDC`} />
          <KeyValue label="Network" value={network} />
          <KeyValue
            label="Transaction"
            value={
              payment?.txId ? (
                <span className={cn("truncate", isMockTx ? "text-muted-foreground" : "text-foreground")}>
                  {payment.txId}
                  {isMockTx ? " (dev)" : ""}
                </span>
              ) : (
                <span className="text-muted-foreground">Pending</span>
              )
            }
          />
        </div>

        {settled && payment?.explorerUrl && !isMockTx ? (
          <a
            href={payment.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 border border-primary/40 bg-primary/[0.05] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary/10"
          >
            <ExternalLink className="size-3.5" /> View on Algorand explorer
          </a>
        ) : null}

        {failed ? (
          <div className="border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive">
            Settlement was not confirmed. Verification cannot proceed without a real on-chain payment.
          </div>
        ) : null}

        <PrivacyNote>
          {isMockTx
            ? "This settlement used the backend's development adapter — no real USDC moved. Wire PROTOCOL_SERVICE_URL to settle on-chain."
            : "The transaction id above is a real Algorand Testnet settlement. KLAIM never fabricates a transaction."}
        </PrivacyNote>

        {onContinue ? (
          <Button className="w-full rounded-none" disabled={!settled} onClick={onContinue}>
            {settled ? "Continue to proof" : "Awaiting settlement…"}
          </Button>
        ) : null}
      </div>
    </DialogShell>
  );
}

/* --------------------------------------------- 3. ZKP generation */

export function ZkpGenerationDialog({
  open,
  onOpenChange,
  status,
  proof,
  claimResults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: VerificationRequestStatus | null;
  proof?: Pick<ProofResult, "proofId" | "engine" | "notDisclosed"> | null;
  claimResults: Partial<Record<ClaimType, boolean>>;
}) {
  const generating = status === "VERIFYING";
  const done = (status === "PROOF_GENERATED" || status === "VERIFIED") && Boolean(proof?.proofId);
  const claims = Object.entries(claimResults) as [ClaimType, boolean][];

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      icon={<Cpu className="size-4" />}
      title="Zero-knowledge proof"
      demoLabel={proof?.engine === "local" ? "Local engine" : undefined}
      description="KLAIM proves each requested claim is true without disclosing the underlying personal data. Only the claim answers reach the verifier."
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <StatusPill tone={done ? "ok" : "muted"}>
            {done ? "Proof generated" : generating ? "Generating" : "Waiting for settlement"}
          </StatusPill>
          {generating ? <Loader2 className="size-4 animate-spin text-primary" /> : null}
        </div>

        <div className={cn("klaim-proof-anim", done && "is-done")} aria-hidden>
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="klaim-chain klaim-chain-compact">
          {["PRIVATE DATA", "ZK ENGINE", "VALID PROOF", "CLAIM"].map((n, i, arr) => (
            <div key={n} className="klaim-chain-item">
              <div className="klaim-chain-node">{n}</div>
              {i < arr.length - 1 ? <span className="klaim-chain-arrow" aria-hidden /> : null}
            </div>
          ))}
        </div>

        {claims.length > 0 ? (
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
              Proven claims
            </p>
            <ul className="space-y-1.5">
              {claims.map(([claim, result]) => (
                <li
                  key={claim}
                  className="flex items-center justify-between border border-border bg-background/50 px-3 py-2"
                >
                  <span className="text-sm text-foreground">{CLAIM_LABEL[claim]}</span>
                  <StatusPill tone={result ? "ok" : "warn"}>{result ? "TRUE" : "FALSE"}</StatusPill>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {done && proof ? (
          <div>
            <KeyValue label="Proof id" value={<span className="truncate">{proof.proofId}</span>} />
            <KeyValue label="Engine" value={proof.engine} />
            {proof.notDisclosed && proof.notDisclosed.length > 0 ? (
              <KeyValue label="Not disclosed" value={proof.notDisclosed.join(", ")} />
            ) : (
              <KeyValue
                label="Not disclosed"
                value={<span className="text-muted-foreground">DOB, document, identifiers</span>}
              />
            )}
          </div>
        ) : null}

        <PrivacyNote>
          {proof?.engine === "local"
            ? "Proof generated by the local proof engine (Midnight-ready). This is a real proof from the proving service, not a simulation — but it is not yet a Midnight ZK circuit."
            : "The proof attests the claim answers only. The verifier never receives your date of birth, documents, or identifiers."}
        </PrivacyNote>
      </div>
    </DialogShell>
  );
}
