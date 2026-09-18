/**
 * Identity Wallet — interactive consent + verification experience (V2).
 *
 * Models the full KLAIM flow as the user experiences it in their wallet: a
 * verifier (QuickDrop) requests claims, and the wallet walks the user through
 * CONSENT-GATED steps, calling the real KLAIM V2 API at each stage:
 *
 *   1. Consent gate #1  → POST /consent (ALLOW)        [pauses for the user]
 *   2. Wallet access    → shows which local credentials cover the claims
 *   3. Payment          → POST /dev/settle             [x402 / Algorand]
 *   4. Consent gate #2  → allow proof generation        [pauses for the user]
 *   5. ZKP generation   → POST /dev/verify             [proof generated]
 *   6. VERIFIED         → recorded into Activity
 *
 * Honesty: settlement + proof run through the backend's DEVELOPMENT adapters
 * (dev-gated), so the tx id is a MOCK id and the proof is a mock proof — the UI
 * labels these. The consent gates are real user actions; each backend call
 * still passes through the state machine + NO SETTLEMENT → NO VERIFICATION
 * invariant.
 */
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DemoTag,
  KeyValue,
  PageHeading,
  Panel,
  PanelHeader,
  PrivacyNote,
  StatusPill,
} from "@/components/app/primitives";
import {
  ConsentGateDialog,
  PaymentConfirmationDialog,
  WalletAccessDialog,
  ZkpGenerationDialog,
  type WalletCredential,
} from "@/components/app/verification-steps";
import { Button } from "@/components/ui/button";
import { useKlaim } from "@/lib/klaim/store";
import { klaimV2, V2ApiUnavailableError } from "@/lib/klaim/v2-api";
import { cn } from "@/lib/utils";
import type { ClaimType, PaymentState, ProofResult, VerificationRequestStatus } from "@klaim/types";
import type { VerificationRecord } from "@/lib/klaim/types";

/**
 * Demo wallet fixture — the credentials this identity wallet holds locally.
 * Mirrors the Idina demo wallet (did:identipi:demo-user-001). Claim answers are
 * derived from these; the underlying documents never leave the device.
 */
const WALLET_CREDENTIALS: WalletCredential[] = [
  {
    credentialRef: "cred-identity-001",
    type: "Identity credential",
    issuer: "KLAIM Demo Issuer",
    covers: ["identity_verified", "age_over_18"],
  },
  {
    credentialRef: "cred-license-001",
    type: "Driver license credential",
    issuer: "KLAIM Demo Issuer",
    covers: ["license_valid"],
  },
];

const REQUESTED: { claim: ClaimType; title: string; desc: string }[] = [
  { claim: "identity_verified", title: "Identity verification", desc: "Confirm you are a real, verified person." },
  { claim: "age_over_18", title: "Age over 18", desc: "Prove you are 18+ — without revealing your date of birth." },
  { claim: "license_valid", title: "Valid driving license", desc: "Confirm your license is valid — without revealing the document." },
];
const CLAIMS = REQUESTED.map((r) => r.claim);
const VERIFIER = "quickdrop-demo";
const AMOUNT_USDC = 0.01;

const HAPPY_PATH: VerificationRequestStatus[] = [
  "PENDING_CONSENT",
  "CONSENT_GRANTED",
  "PAYMENT_REQUIRED",
  "PAYMENT_SETTLED",
  "VERIFYING",
  "PROOF_GENERATED",
  "VERIFIED",
];

const LABEL: Record<VerificationRequestStatus, string> = {
  CREATED: "Created",
  PENDING_CONSENT: "Awaiting consent",
  CONSENT_GRANTED: "Consent granted",
  PAYMENT_REQUIRED: "Payment required",
  PAYMENT_SETTLED: "Payment settled",
  VERIFYING: "Verifying",
  PROOF_GENERATED: "Proof generated",
  VERIFIED: "Verified",
  DENIED: "Denied",
  PAYMENT_FAILED: "Payment failed",
  CREDENTIAL_INVALID: "Credential invalid",
  VERIFICATION_FAILED: "Verification failed",
};

type Phase = "intro" | "requested" | "tracking";
/** Which step dialog is currently shown (the flow pauses on consent gates). */
type Step = "none" | "consent1" | "wallet" | "payment" | "consent2" | "zkp";

export function Verify() {
  const { user, addVerification } = useKlaim();
  const did = user?.did ?? "did:identipi:demo-user-001";

  const [phase, setPhase] = useState<Phase>("intro");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<VerificationRequestStatus | null>(null);
  const [claimResults, setClaimResults] = useState<Partial<Record<ClaimType, boolean>>>({});
  const [proofId, setProofId] = useState<string | null>(null);
  const [proof, setProof] = useState<ProofResult | null>(null);
  const [payment, setPayment] = useState<Partial<PaymentState> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>("none");
  const [listening, setListening] = useState(false);
  const poll = useRef<number | null>(null);
  const listenPoll = useRef<number | null>(null);
  const recorded = useRef(false);

  const stop = useCallback(() => {
    if (poll.current !== null) {
      window.clearInterval(poll.current);
      poll.current = null;
    }
  }, []);

  const stopListen = useCallback(() => {
    if (listenPoll.current !== null) {
      window.clearInterval(listenPoll.current);
      listenPoll.current = null;
    }
  }, []);

  const walletCoversAll = CLAIMS.every((c) => WALLET_CREDENTIALS.some((cred) => cred.covers.includes(c)));

  // Adopt a request created elsewhere (e.g. by QuickDrop) that is awaiting this
  // wallet's consent. Opens consent gate #1 directly on the incoming request.
  const adopt = useCallback((incomingId: string) => {
    stopListen();
    setListening(false);
    recorded.current = false;
    setRequestId(incomingId);
    setStatus("PENDING_CONSENT");
    setError(null);
    setPhase("tracking");
    setStep("consent1");
  }, [stopListen]);

  // Listening mode: poll for a PENDING_CONSENT request addressed to this DID
  // (created by a verifier). When one appears, adopt it and prompt for consent.
  const startListening = useCallback(() => {
    setError(null);
    setListening(true);
  }, []);

  useEffect(() => {
    if (!listening) return;
    const tick = async () => {
      try {
        const pending = await klaimV2.listRequests(did, "PENDING_CONSENT");
        setOffline(false);
        if (pending.length > 0) adopt(pending[0].requestId);
      } catch (e) {
        if (e instanceof V2ApiUnavailableError) setOffline(true);
      }
    };
    void tick();
    listenPoll.current = window.setInterval(() => void tick(), 1500);
    return stopListen;
  }, [listening, did, adopt, stopListen]);

  // Create the incoming request (models a verifier calling KLAIM). Used for the
  // self-contained wallet demo where the wallet also plays the verifier.
  const openRequest = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await klaimV2.createRequest({ verifierId: VERIFIER, userDid: did, claims: CLAIMS });
      setRequestId(created.requestId);
      setStatus(created.status);
      setPhase("requested");
    } catch (e) {
      if (e instanceof V2ApiUnavailableError) {
        setError(`KLAIM API is not reachable at ${klaimV2.apiUrl}. Start the backend, then retry.`);
      } else {
        setError(e instanceof Error ? e.message : "Could not open verification request");
      }
    } finally {
      setBusy(false);
    }
  }, [did]);

  const refresh = useCallback(async (id: string) => {
    try {
      const r = await klaimV2.getRequest(id);
      setStatus(r.status);
      setPayment(r.payment);
      setOffline(false);

      // The wallet only CONSENTS. The verifier (QuickDrop) pays + triggers
      // proof. The wallet reflects that live: once the user has consented, it
      // advances its status popups as the backend/verifier move the request.
      setStep((cur) => {
        if (cur === "consent1" || cur === "none") return cur; // waiting on the user's consent tap
        if (["PAYMENT_REQUIRED", "PAYMENT_SETTLED"].includes(r.status)) return "payment";
        if (["VERIFYING", "PROOF_GENERATED", "VERIFIED"].includes(r.status)) return "zkp";
        return cur;
      });

      if (r.status === "VERIFIED") {
        const res = await klaimV2.getResult(id);
        setClaimResults((res.claims ?? {}) as Partial<Record<ClaimType, boolean>>);
        setProof(res.proof ?? null);
        setProofId(res.proof?.proofId ?? res.proofId ?? null);
        if (res.payment) setPayment(res.payment);
        stop();
      }
      if (["DENIED", "PAYMENT_FAILED", "CREDENTIAL_INVALID", "VERIFICATION_FAILED"].includes(r.status)) stop();
    } catch (e) {
      if (e instanceof V2ApiUnavailableError) setOffline(true);
    }
  }, [stop]);

  /* ------------------------------------------------- stepped flow ------- */

  // Begin the flow: open the consent gate.
  const begin = useCallback(() => {
    setError(null);
    setPhase("tracking");
    setStep("consent1");
  }, []);

  // Consent → grant consent on the backend. After this the wallet just tracks;
  // the verifier pays and proof generation follows automatically. The wallet
  // shows a brief wallet-access step, then live payment + ZKP status popups.
  const allowConsent1 = useCallback(async () => {
    if (!requestId) return;
    setBusy(true);
    setError(null);
    try {
      await klaimV2.consent(requestId, "ALLOW");
      setStep("wallet");
      void refresh(requestId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Consent failed");
      setStep("none");
    } finally {
      setBusy(false);
    }
  }, [requestId, refresh]);

  // Wallet access acknowledged → move to the live payment status popup. The
  // wallet does NOT settle; it waits for the verifier to pay and reflects it.
  const continueFromWallet = useCallback(() => {
    if (!requestId) return;
    setStep("payment");
    void refresh(requestId);
  }, [requestId, refresh]);

  // Payment popup → advance to the live ZKP status popup. Verifier-driven;
  // the wallet only reflects the real proof generation.
  const continueFromPayment = useCallback(() => {
    setStep("zkp");
  }, []);

  const deny = useCallback(async () => {
    if (!requestId) return;
    setBusy(true);
    setStep("none");
    try {
      await klaimV2.consent(requestId, "DENY");
      void refresh(requestId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record decision");
    } finally {
      setBusy(false);
    }
  }, [requestId, refresh]);

  // Poll while tracking.
  useEffect(() => {
    if (phase !== "tracking" || !requestId) return;
    poll.current = window.setInterval(() => void refresh(requestId), 1500);
    return stop;
  }, [phase, requestId, refresh, stop]);

  // Record the completed verification into Activity once VERIFIED.
  useEffect(() => {
    if (status !== "VERIFIED" || recorded.current) return;
    recorded.current = true;
    const txId = payment?.txId ?? null;
    const isMockTx = !txId || txId.startsWith("MOCK-");
    const record: VerificationRecord = {
      id: requestId ?? `req-${Date.now()}`,
      claimId: "age_over_18",
      claimLabel: "Identity · Age 18+ · License",
      subjectDid: did,
      requestedBy: VERIFIER,
      status: "verified",
      amountUsdc: typeof payment?.amount === "number" ? payment.amount : AMOUNT_USDC,
      network: "Algorand Testnet",
      transaction: {
        id: txId ?? "—",
        kind: isMockTx ? "demo" : "settled",
        amountUsdc: typeof payment?.amount === "number" ? payment.amount : AMOUNT_USDC,
        network: "Algorand Testnet",
        createdAt: new Date().toLocaleString(),
        explorerUrl: payment?.explorerUrl ?? null,
      },
      createdAt: new Date().toLocaleString(),
      notDisclosed: ["Date of Birth", "Aadhaar", "PAN", "Address", "Document image"],
    };
    addVerification(record);
  }, [status, payment, requestId, did, addVerification]);

  const reset = useCallback(() => {
    stop();
    stopListen();
    recorded.current = false;
    setListening(false);
    setPhase("intro");
    setRequestId(null);
    setStatus(null);
    setClaimResults({});
    setProofId(null);
    setProof(null);
    setPayment(null);
    setError(null);
    setStep("none");
  }, [stop, stopListen]);

  const activeIndex = status ? HAPPY_PATH.indexOf(status) : -1;
  const isError = status ? ["DENIED", "PAYMENT_FAILED", "CREDENTIAL_INVALID", "VERIFICATION_FAILED"].includes(status) : false;

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Identity Wallet"
        title="Verification requests"
        subtitle="When a verifier asks to check something about you, it appears here. You decide exactly what to share — the verifier only ever receives the answer, never your documents."
      />

      <div className="mb-2 flex items-center gap-2 border border-dashed border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <ShieldCheck className="size-3.5 text-primary" />
        Connected to KLAIM API — settlement &amp; verification run through development adapters
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* left: the request + consent */}
        <Panel accent>
          <PanelHeader title="Incoming request" hint={VERIFIER} />
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-medium text-foreground">QuickDrop wants to verify</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Delivery partner onboarding
                </p>
              </div>
              <DemoTag label="Demo verifier" />
            </div>

            <ul className="mt-5 space-y-3">
              {REQUESTED.map((r) => {
                const done = claimResults[r.claim] === true;
                return (
                  <li key={r.claim} className="flex items-start gap-3 border border-border bg-background/50 p-3">
                    <span
                      className={cn(
                        "mt-0.5 grid size-5 place-items-center border",
                        done ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground",
                      )}
                    >
                      <Check className="size-3" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{r.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.desc}</p>
                    </div>
                  </li>
                );
              })}
            </ul>

            {error ? <div className="mt-5 border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive">{error}</div> : null}

            {phase === "intro" && (
              <div className="mt-6 space-y-3">
                {listening ? (
                  <div className="flex items-center justify-between border border-primary/30 bg-primary/[0.05] px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
                      <Loader2 className="size-3.5 animate-spin" /> Listening for requests…
                    </span>
                    <Button variant="ghost" className="h-7 rounded-none text-[11px]" onClick={() => setListening(false)}>
                      Stop
                    </Button>
                  </div>
                ) : (
                  <Button className="w-full rounded-none" onClick={startListening}>
                    <ShieldCheck className="size-4" /> Listen for verification requests
                  </Button>
                )}
                <p className="text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  waiting for a verifier (e.g. QuickDrop) to request your DID
                </p>
                <Button
                  variant="outline"
                  className="w-full rounded-none"
                  disabled={busy}
                  onClick={() => void openRequest()}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Simulate a request (self-demo)
                </Button>
              </div>
            )}

            {phase === "requested" && (
              <Button className="mt-6 w-full rounded-none" disabled={busy} onClick={begin}>
                <ShieldCheck className="size-4" /> Review &amp; respond
              </Button>
            )}

            {phase === "tracking" && (
              <div className="mt-6 flex flex-wrap gap-2">
                {status === "VERIFIED" ? (
                  <StatusPill tone="ok">✓ Verification complete</StatusPill>
                ) : isError ? (
                  <StatusPill tone="warn">{LABEL[status!]}</StatusPill>
                ) : (
                  <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin text-primary" /> In progress
                  </span>
                )}
                <Button variant="ghost" className="rounded-none" onClick={reset}>
                  Start over
                </Button>
              </div>
            )}

            <div className="mt-5">
              <PrivacyNote>
                You are sharing claim <em>answers</em> only. Your date of birth, license document, and other identifiers
                are never sent to the verifier.
              </PrivacyNote>
            </div>
          </div>
        </Panel>

        {/* right: status */}
        <Panel>
          <PanelHeader title="Request status" hint={requestId ?? "—"} />
          <div className="p-5">
            {!status ? (
              <p className="text-sm text-muted-foreground">No active request. Open one to see its progress here.</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <StatusPill tone={isError ? "warn" : status === "VERIFIED" ? "ok" : "muted"}>
                    {LABEL[status]}
                  </StatusPill>
                  {proofId ? <span className="font-mono text-[10px] text-muted-foreground">{proofId}</span> : null}
                </div>

                {offline ? (
                  <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-destructive">
                    API unreachable — retrying
                  </p>
                ) : null}

                <div className="mt-5 space-y-1">
                  {HAPPY_PATH.map((s, i) => {
                    const past = !isError && i < activeIndex;
                    const active = !isError && i === activeIndex;
                    return (
                      <div
                        key={s}
                        className={cn(
                          "flex items-center gap-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em]",
                          active ? "text-foreground" : past ? "text-muted-foreground" : "text-muted-foreground/50",
                        )}
                      >
                        <span
                          className={cn(
                            "size-2.5 border",
                            active ? "border-primary bg-primary" : past ? "border-primary/60 bg-primary/60" : "border-border",
                          )}
                        />
                        {LABEL[s]}
                      </div>
                    );
                  })}
                </div>

                {requestId ? (
                  <div className="mt-5">
                    <KeyValue label="Request" value={requestId} />
                    <KeyValue label="Verifier" value={VERIFIER} />
                    <KeyValue label="Claims" value={`${CLAIMS.length} requested`} />
                    {payment?.txId ? <KeyValue label="Tx" value={<span className="truncate">{payment.txId}</span>} /> : null}
                  </div>
                ) : null}

                {phase === "tracking" ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="rounded-none text-[11px]"
                      disabled={!payment}
                      onClick={() => setStep("payment")}
                    >
                      Payment
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-none text-[11px]"
                      disabled={!proof && status !== "VERIFIED"}
                      onClick={() => setStep("zkp")}
                    >
                      Proof
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </Panel>
      </div>

      {/* ---- interactive stepped flow dialogs ---- */}
      <ConsentGateDialog
        open={step === "consent1"}
        title="Consent required"
        requester={VERIFIER}
        question="QuickDrop wants to verify the following about you. Allow KLAIM to check your wallet and answer these claims?"
        detail="Allowing lets KLAIM read which of your credentials can answer these claims. Your documents never leave your device."
        claims={CLAIMS}
        busy={busy}
        onAllow={() => void allowConsent1()}
        onDeny={() => void deny()}
      />

      <WalletAccessDialog
        open={step === "wallet"}
        onOpenChange={(o) => setStep(o ? "wallet" : "none")}
        did={did}
        requestedClaims={CLAIMS}
        credentials={WALLET_CREDENTIALS}
        allClaimsCovered={walletCoversAll}
        onContinue={() => void continueFromWallet()}
        busy={busy}
      />

      <PaymentConfirmationDialog
        open={step === "payment"}
        onOpenChange={(o) => setStep(o ? "payment" : "none")}
        status={status}
        payment={payment}
        onContinue={continueFromPayment}
      />

      <ZkpGenerationDialog
        open={step === "zkp"}
        onOpenChange={(o) => setStep(o ? "zkp" : "none")}
        status={status}
        proof={proof}
        claimResults={claimResults}
      />
    </div>
  );
}
