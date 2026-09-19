import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Loader2, QrCode, ScanLine, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { credentialService } from "@/lib/klaim/services";
import { useKlaim } from "@/lib/klaim/store";
import type { Credential } from "@/lib/klaim/types";

export const Route = createFileRoute("/human/credentials/add")({
  head: () => ({
    meta: [
      { title: "Add a Trusted Credential — KLAIM" },
      { name: "description", content: "Connect a credential from a trusted issuer such as DigiLocker to your KLAIM DID." },
      { property: "og:title", content: "Add a Trusted Credential — KLAIM" },
      { property: "og:description", content: "Connect DigiLocker or scan a credential QR to attach a trusted credential." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AddCredentialPage,
});

type Stage = "idle" | "authorize" | "verifying" | "verified" | "attaching" | "attached";

function AddCredentialPage() {
  const { user, addCredential } = useKlaim();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("idle");
  const [source, setSource] = useState<"connect" | "scan">("connect");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pending, setPending] = useState<Omit<Credential, "id" | "attachedTo"> | null>(null);

  const runVerification = async (from: "connect" | "scan") => {
    setSource(from);
    setStage("verifying");
    const credential = await credentialService.verifyWithDigiLocker(from);
    setPending(credential);
    setStage("verified");
  };

  const attach = async () => {
    if (!pending || !user) return;
    setStage("attaching");
    const attached = await credentialService.attachToDid(pending, user.did);
    addCredential(attached);
    setStage("attached");
  };

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Credentials"
        title="Add a Trusted Credential"
        subtitle="Connect a credential from a trusted issuer to your KLAIM DID."
        actions={
          <Button variant="ghost" className="rounded-none" onClick={() => void navigate({ to: "/human/credentials" })}>
            Back to credentials
          </Button>
        }
      />

      {stage === "idle" || stage === "authorize" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel className="flex flex-col p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">DigiLocker</p>
            <h2 className="mt-2 text-xl font-medium text-foreground">Connect your government-issued credentials</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Authorize KLAIM to verify the authenticity of an issued credential and retrieve only the claims needed
              for verification.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <Button className="rounded-none" onClick={() => setStage("authorize")}>
                Connect DigiLocker
              </Button>
              <DemoTag label="Simulated" />
            </div>
          </Panel>

          <Panel className="flex flex-col p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Scan Credential</p>
            <h2 className="mt-2 text-xl font-medium text-foreground">Scan a DigiLocker verification QR</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Use the credential QR printed on an issued document to attach it to your DID.
            </p>
            <div className="mt-6 flex items-center gap-2">
              <Button variant="outline" className="rounded-none" onClick={() => setScannerOpen(true)}>
                <QrCode className="size-4" /> Open Scanner
              </Button>
              <DemoTag label="Simulated" />
            </div>
          </Panel>
        </div>
      ) : null}

      {stage === "verifying" ? (
        <Panel className="p-10 text-center">
          <Loader2 className="mx-auto size-6 animate-spin text-primary" />
          <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Verifying credential…
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Checking issuer signature and credential authenticity via {source === "scan" ? "QR reference" : "DigiLocker"}.
          </p>
        </Panel>
      ) : null}

      {(stage === "verified" || stage === "attaching") && pending ? (
        <Panel accent>
          <PanelHeader title="Credential verified" hint="Simulated issuer check" />
          <div className="p-5">
            <div className="flex items-center gap-2 text-primary">
              <Check className="size-4" />
              <span className="font-mono text-[11px] uppercase tracking-[0.13em]">Credential verified</span>
            </div>
            <div className="mt-4">
              <KeyValue label="Document" value={pending.documentType} />
              <KeyValue label="Issuer" value={pending.issuer} />
              <KeyValue label="Status" value={<span className="text-primary">✓ Authentic</span>} />
            </div>
            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
              Available claims
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-foreground">
              {pending.claims.map((c) => (
                <li key={c.label} className="flex items-center justify-between">
                  <span>• {c.label}</span>
                  {c.maskedValue ? <span className="font-mono text-xs text-muted-foreground">{c.maskedValue}</span> : null}
                </li>
              ))}
            </ul>
            <Button className="mt-6 rounded-none" onClick={() => void attach()} disabled={stage === "attaching"}>
              {stage === "attaching" ? <Loader2 className="size-4 animate-spin" /> : null}
              Attach to KLAIM DID
            </Button>
          </div>
        </Panel>
      ) : null}

      {stage === "attached" ? (
        <Panel accent>
          <PanelHeader title="Credential attached" />
          <div className="p-5">
            <div className="flex items-center gap-2 text-primary">
              <Check className="size-4" />
              <span className="font-mono text-[11px] uppercase tracking-[0.13em]">Credential attached</span>
            </div>
            <div className="mt-4">
              <KeyValue label="DID" value={user?.did ?? "—"} />
              <KeyValue label="Document" value={pending?.documentType ?? "—"} />
              <KeyValue label="Status" value={<StatusPill>✓ Verified</StatusPill>} />
            </div>
            <div className="mt-5">
              <PrivacyNote>
                Credential reference attached. KLAIM uses only the claims required for verification and does not store
                the original DigiLocker document.
              </PrivacyNote>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button className="rounded-none" onClick={() => void navigate({ to: "/human/credentials" })}>
                View credentials
              </Button>
              <Button variant="outline" className="rounded-none" onClick={() => void navigate({ to: "/human/dashboard" })}>
                Back to overview
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      {/* Simulated DigiLocker authorization */}
      <Dialog open={stage === "authorize"} onOpenChange={(o) => !o && setStage("idle")}>
        <DialogContent className="rounded-none border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              DigiLocker <DemoTag label="Simulated" />
            </DialogTitle>
            <DialogDescription>Allow KLAIM to access your issued credential?</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2 text-foreground">
              <Check className="size-4 text-primary" /> Verify credential authenticity
            </li>
            <li className="flex items-center gap-2 text-foreground">
              <Check className="size-4 text-primary" /> Retrieve required claims
            </li>
            <li className="flex items-center gap-2 text-muted-foreground">
              <X className="size-4" /> No unnecessary document storage
            </li>
          </ul>
          <div className="mt-2 flex gap-2">
            <Button className="flex-1 rounded-none" onClick={() => void runVerification("connect")}>
              Allow &amp; Continue
            </Button>
            <Button variant="ghost" className="rounded-none" onClick={() => setStage("idle")}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Simulated QR scanner */}
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="rounded-none border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Scan DigiLocker Credential <DemoTag label="Simulated" />
            </DialogTitle>
            <DialogDescription>Position the credential QR inside the frame.</DialogDescription>
          </DialogHeader>
          <div className="klaim-scanner">
            <span className="klaim-scanner-corner tl" />
            <span className="klaim-scanner-corner tr" />
            <span className="klaim-scanner-corner bl" />
            <span className="klaim-scanner-corner br" />
            <span className="klaim-scanner-line" />
            <ScanLine className="size-8 text-muted-foreground/60" />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Live camera scanning is not enabled in this demo — arbitrary QR codes are not validated yet.
          </p>
          <Button
            className="rounded-none"
            onClick={() => {
              setScannerOpen(false);
              void runVerification("scan");
            }}
          >
            <ShieldCheck className="size-4" /> Use Demo Credential
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
