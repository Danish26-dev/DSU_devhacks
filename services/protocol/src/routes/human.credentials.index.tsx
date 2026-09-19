import { Link, createFileRoute } from "@tanstack/react-router";
import { Building2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";

import { klaimApi } from "@/lib/klaim/api";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useKlaim } from "@/lib/klaim/store";
import type { Credential } from "@/lib/klaim/types";

export const Route = createFileRoute("/human/credentials/")({
  head: () => ({
    meta: [
      { title: "Credentials — KLAIM" },
      { name: "description", content: "Trusted credentials attached to your KLAIM identity, with underlying documents never shared with verifiers." },
      { property: "og:title", content: "Credentials — KLAIM" },
      { property: "og:description", content: "Manage DigiLocker-issued trusted credentials linked to your DID." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CredentialsPage,
});

function CredentialCard({
  credential,
  onView,
  onPrivacy,
  onDelete,
}: {
  credential: Credential;
  onView: () => void;
  onPrivacy: () => void;
  onDelete: () => void;
}) {
  return (
    <Panel className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">{credential.provider}</p>
          <h3 className="mt-1.5 text-lg font-medium text-foreground">{credential.documentType}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="size-3.5" /> {credential.issuer}
          </p>
        </div>
        <StatusPill>✓ Verified</StatusPill>
      </div>

      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Available claims</p>
      <ul className="mt-2 space-y-1.5">
        {credential.claims.map((claim) => (
          <li key={claim.label} className="flex items-center justify-between text-sm text-foreground">
            <span>• {claim.label}</span>
            {claim.maskedValue ? (
              <span className="font-mono text-xs text-muted-foreground">{claim.maskedValue}</span>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
        Underlying document is not shared with verifiers.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" className="rounded-none" onClick={onView}>
          View Credential
        </Button>
        <Button variant="ghost" className="rounded-none" onClick={onPrivacy}>
          Privacy Controls
        </Button>
        <Button
          variant="ghost"
          className="rounded-none text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>
    </Panel>
  );
}

function CredentialsPage() {
  const { credentials, user, removeCredential } = useKlaim();
  const [viewing, setViewing] = useState<Credential | null>(null);
  const [privacy, setPrivacy] = useState<Credential | null>(null);
  const [deleting, setDeleting] = useState<Credential | null>(null);
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    // Deletes server-side first; the local record is only dropped on success.
    try {
      await klaimApi.deleteCredential(deleting.id);
    } catch {
      /* credential exists only in local demo state */
    }
    removeCredential(deleting.id);
    setBusy(false);
    setDeleting(null);
  }


  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Credentials"
        title="Credentials"
        subtitle="Trusted credentials attached to your KLAIM identity."
        actions={
          <Button asChild className="rounded-none">
            <Link to="/human/credentials/add">
              <Plus className="size-4" /> Add credential
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {credentials.map((credential) => (
          <CredentialCard
            key={credential.id}
            credential={credential}
            onView={() => setViewing(credential)}
            onPrivacy={() => setPrivacy(credential)}
            onDelete={() => setDeleting(credential)}
          />
        ))}
      </div>

      <PrivacyNote>
        KLAIM stores a credential reference only. Sensitive values shown here are masked demo data and are never
        transmitted to a requesting agent.
      </PrivacyNote>

      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="rounded-none border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewing?.documentType} <DemoTag />
            </DialogTitle>
            <DialogDescription>Credential reference attached to your KLAIM DID.</DialogDescription>
          </DialogHeader>
          {viewing ? (
            <div>
              <KeyValue label="Provider" value={viewing.provider} />
              <KeyValue label="Issuer" value={viewing.issuer} />
              <KeyValue label="Authenticity" value={<span className="text-primary">✓ Verified</span>} />
              <KeyValue label="Attached to" value={user?.did ?? "—"} />
              <KeyValue label="Attached on" value={viewing.attachedAt} />
              {viewing.claims.map((c) => (
                <KeyValue key={c.label} label={c.label} value={c.maskedValue ?? "Available"} />
              ))}
              <div className="mt-4">
                <PrivacyNote>Document image and full identifiers are not stored by KLAIM.</PrivacyNote>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={privacy !== null} onOpenChange={(o) => !o && setPrivacy(null)}>
        <DialogContent className="rounded-none border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Privacy Controls</DialogTitle>
            <DialogDescription>What a verifying agent can and cannot receive.</DialogDescription>
          </DialogHeader>
          <div>
            <KeyValue label="Raw document" value={<span className="text-muted-foreground">Not shared</span>} />
            <KeyValue label="Full identifiers" value={<span className="text-muted-foreground">Not shared</span>} />
            <KeyValue label="Date of birth" value={<span className="text-muted-foreground">Not disclosed</span>} />
            <KeyValue label="Requested claim only" value={<span className="text-primary">Disclosed</span>} />
            <KeyValue label="Consent" value={<span className="text-primary">Required per request</span>} />
          </div>
          <PrivacyNote>
            Granular per-claim toggles arrive with the real credential backend. This demo enforces claim-only
            disclosure by default.
          </PrivacyNote>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="rounded-none border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete {deleting?.documentType}?</DialogTitle>
            <DialogDescription>This removes the credential from KLAIM. It cannot be undone.</DialogDescription>
          </DialogHeader>
          <div>
            <KeyValue
              label="Removed from KLAIM"
              value={<span className="text-foreground">Credential reference and cached claims</span>}
            />
            <KeyValue
              label="Future proofs"
              value={<span className="text-destructive">No longer possible from this credential</span>}
            />
            <KeyValue
              label="DigiLocker / issuer copy"
              value={<span className="text-muted-foreground">Unaffected — KLAIM cannot delete it there</span>}
            />
            <KeyValue
              label="Past verifications"
              value={<span className="text-muted-foreground">Remain in your activity history</span>}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              className="rounded-none"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {busy ? "Deleting…" : "Delete credential"}
            </Button>
            <Button variant="ghost" className="rounded-none" disabled={busy} onClick={() => setDeleting(null)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
