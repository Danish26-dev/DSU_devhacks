import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, CircleDollarSign, Fingerprint, ShieldCheck, WalletCards } from "lucide-react";

import {
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

export const Route = createFileRoute("/human/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — KLAIM Identity Console" },
      { name: "description", content: "Your KLAIM identity overview: DID status, trusted credentials, proofs generated and verification spend." },
      { property: "og:title", content: "Overview — KLAIM Identity Console" },
      { property: "og:description", content: "Identity status, credentials and recent privacy-preserving verifications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function DashboardPage() {
  const { user, credentials, verifications } = useKlaim();
  if (!user) return null;

    const latest = verifications[0];

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Overview"
        title={`${greeting()}, ${user.name}`}
        subtitle="Your identity is ready for privacy-preserving verification."
        actions={
          <Button asChild variant="outline" className="rounded-none">
            <Link to="/human/credentials">Manage credentials</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Identity Status" value="✓ Active" hint="DID resolvable" icon={<Fingerprint className="size-4" />} />
        <StatCard
          label="Credentials"
          value={`${credentials.filter((c) => c.status === "verified").length} Verified`}
          hint="Trusted issuers"
          icon={<WalletCards className="size-4" />}
        />
        <StatCard label="Proofs" value="12 Demo" hint="Zero-knowledge" icon={<CircleDollarSign className="size-4" />} />
        <StatCard
          label="Privacy"
          value="Protected"
          hint="Claims only — never documents"
          icon={<ShieldCheck className="size-4" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Panel>
          <PanelHeader title="Identity at a glance" hint="KLAIM proves claims, not identities" />
          <div className="px-5 py-2">
            <KeyValue label="DID" value={user.did} />
            <KeyValue label="Credential status" value={<span className="text-primary">✓ Verified</span>} />
            <KeyValue label="Privacy status" value={<span className="text-primary">Protected</span>} />
            <KeyValue label="Verification cost" value={<span className="text-muted-foreground">Paid by the verifier</span>} />
          </div>
          <div className="px-5 pb-5">
            <PrivacyNote>
              Raw documents are never shared with verifiers. Only the specific claim requested by an agent is disclosed.
            </PrivacyNote>
          </div>
        </Panel>

        <Panel accent>
          <PanelHeader title="Recent Verification Requests" hint={latest ? latest.createdAt : "—"} />
          {latest ? (
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-medium text-foreground">{latest.claimLabel}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    {latest.requestedBy} requested {latest.claimLabel}
                  </p>
                </div>
                <StatusPill>
                  <Check className="size-3" /> Verified
                </StatusPill>
              </div>
              <div className="mt-4">
                <KeyValue label="Claim" value={latest.claimLabel} />
                <KeyValue label="Disclosed" value={<span className="text-primary">Claim result only</span>} />
                <KeyValue label="Not disclosed" value={<span className="text-muted-foreground">{latest.notDisclosed.join(", ")}</span>} />
              </div>
              <Button asChild variant="outline" className="mt-5 w-full rounded-none">
                <Link to="/human/activity">View Activity</Link>
              </Button>
            </div>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">No verifications yet.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
