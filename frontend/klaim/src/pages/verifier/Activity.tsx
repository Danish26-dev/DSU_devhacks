import { ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { KeyValue, PageHeading, Panel, PrivacyNote, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { klaimV2, V2ApiUnavailableError } from "@/lib/klaim/v2-api";
import type { ClaimType, PaymentState, VerificationRequestStatus } from "@klaim/types";

const CLAIM_LABEL: Record<ClaimType, string> = {
  identity_verified: "Identity verified",
  age_over_18: "Age over 18",
  license_valid: "Valid driving license",
};

const STATUS_LABEL: Partial<Record<VerificationRequestStatus, string>> = {
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

/** A row shown in the activity list, enriched with real result data. */
interface Row {
  requestId: string;
  status: VerificationRequestStatus;
  userDid: string;
  claims: ClaimType[];
  createdAt: string;
  payment?: Partial<PaymentState> | null;
  proofId?: string | null;
}

const DEMO_DID = "did:identipi:demo-user-001";

export function VerifierActivity() {
  const [rows, setRows] = useState<Row[]>([]);
  const [offline, setOffline] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const poll = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      // Real requests this verifier's subject went through. (Demo uses one DID;
      // a production verifier would query by its own verifierId.)
      const list = await klaimV2.listRequests(DEMO_DID);
      setOffline(false);
      const enriched: Row[] = await Promise.all(
        list.map(async (r) => {
          const base: Row = {
            requestId: r.requestId,
            status: r.status,
            userDid: r.userDid,
            claims: r.claims,
            createdAt: r.createdAt,
            payment: r.payment,
          };
          if (r.status === "VERIFIED") {
            const res = await klaimV2.getResult(r.requestId).catch(() => null);
            if (res) {
              base.payment = res.payment ?? r.payment;
              base.proofId = res.proof?.proofId ?? res.proofId ?? null;
            }
          }
          return base;
        }),
      );
      setRows(enriched);
    } catch (e) {
      if (e instanceof V2ApiUnavailableError) setOffline(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    poll.current = window.setInterval(() => void load(), 2500);
    return () => {
      if (poll.current !== null) window.clearInterval(poll.current);
    };
  }, [load]);

  const isSettled = (p?: Partial<PaymentState> | null) =>
    p?.status === "SETTLED" && Boolean(p?.txId) && !p.txId!.startsWith("MOCK-");

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Activity"
        title="Activity"
        subtitle="Live verification requests: consent → payment → proof → result. Real on-chain settlements link to Lora."
      />

      {offline ? (
        <div className="border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs text-destructive">
          KLAIM API unreachable — retrying.
        </div>
      ) : null}

      <Panel>
        <div className="divide-y divide-border">
          {!loaded ? (
            <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading activity…
            </div>
          ) : rows.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No verification requests yet. Start one from QuickDrop and it will appear here in real time.
            </p>
          ) : (
            rows.map((v) => {
              const settled = isSettled(v.payment);
              const failed = ["DENIED", "PAYMENT_FAILED", "CREDENTIAL_INVALID", "VERIFICATION_FAILED"].includes(v.status);
              const label = v.claims.map((c) => CLAIM_LABEL[c]).join(" · ");
              const amount = typeof v.payment?.amount === "number" ? v.payment.amount : 0.01;
              return (
                <article key={v.requestId} className="grid gap-4 p-5 sm:grid-cols-[1.2fr_auto] sm:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-medium text-foreground">{label}</h2>
                      <StatusPill tone={v.status === "VERIFIED" ? "ok" : failed ? "warn" : "muted"}>
                        {STATUS_LABEL[v.status] ?? v.status}
                      </StatusPill>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {v.requestId} · Subject {v.userDid} · {new Date(v.createdAt).toLocaleString()}
                    </p>
                    <div className="mt-3">
                      <KeyValue label="Paid by verifier" value={`${amount.toFixed(2)} USDC`} />
                      <KeyValue label="Network" value="Algorand Testnet" />
                      <KeyValue
                        label="Transaction"
                        value={
                          settled && v.payment?.explorerUrl ? (
                            <a
                              href={v.payment.explorerUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline break-all"
                            >
                              {v.payment.txId} <ExternalLink className="size-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground">{v.payment?.txId ?? "—"}</span>
                          )
                        }
                      />
                      {v.proofId ? <KeyValue label="Proof" value={<span className="font-mono text-[11px]">{v.proofId}</span>} /> : null}
                      <KeyValue label="Not disclosed" value={<span className="text-muted-foreground">DOB, Aadhaar, PAN, address, document</span>} />
                    </div>
                  </div>
                  {settled && v.payment?.explorerUrl ? (
                    <a href={v.payment.explorerUrl} target="_blank" rel="noopener noreferrer" className="justify-self-start sm:justify-self-end">
                      <Button variant="outline" className="rounded-none">
                        <ExternalLink className="size-4" /> View on Lora
                      </Button>
                    </a>
                  ) : (
                    <Button variant="outline" className="rounded-none justify-self-start sm:justify-self-end" disabled title="Explorer link appears once settled on-chain">
                      <ExternalLink className="size-4" /> View on Lora
                    </Button>
                  )}
                </article>
              );
            })
          )}
        </div>
      </Panel>

      <PrivacyNote>
        This activity is read live from the KLAIM API. Verified rows show the real Algorand Testnet transaction and
        link directly to the Lora explorer. The verifier pays; the applicant never does, and never shares documents.
      </PrivacyNote>
    </div>
  );
}
