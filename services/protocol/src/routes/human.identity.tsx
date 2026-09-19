import { createFileRoute } from "@tanstack/react-router";
import { Fingerprint } from "lucide-react";

import {
  CopyField,
  FlowChain,
  KeyValue,
  PageHeading,
  Panel,
  PanelHeader,
  PrivacyNote,
  StatusPill,
} from "@/components/app/primitives";
import { useKlaim } from "@/lib/klaim/store";

export const Route = createFileRoute("/human/identity")({
  head: () => ({
    meta: [
      { title: "My Identity — KLAIM" },
      { name: "description", content: "Your decentralized identifier is the root identity KLAIM uses to associate trusted credentials and generate privacy-preserving proofs." },
      { property: "og:title", content: "My Identity — KLAIM" },
      { property: "og:description", content: "DID, credential linkage and zero-knowledge proof architecture." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IdentityPage,
});

function IdentityPage() {
  const { user, credentials } = useKlaim();
  if (!user) return null;

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Identity"
        title="My Identity"
        subtitle="Your DID is the root identity used by KLAIM to associate trusted credentials and generate privacy-preserving proofs."
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Panel accent>
          <PanelHeader title="Decentralized Identifier" hint="Root identity" />
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center border border-primary/35 bg-primary/10 text-primary">
                <Fingerprint className="size-5" />
              </span>
              <div>
                <p className="font-mono text-sm text-foreground">{user.did}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  KLAIM identity
                </p>
              </div>
            </div>
            <CopyField value={user.did} label="DID" />
            <div>
              <KeyValue label="Status" value={<StatusPill>✓ Active</StatusPill>} />
              <KeyValue label="Created" value={user.createdAt} />
              <KeyValue label="Attached credentials" value={String(credentials.length)} />
              <KeyValue label="Method" value="did:identipi (demo)" />
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Identity Architecture" />
          <div className="p-5">
            <FlowChain nodes={["DID", "Trusted Credentials", "Zero-Knowledge Proofs", "Verified Claims"]} />
            <div className="mt-5">
              <PrivacyNote>
                No personal data is stored on this page. Credentials remain with their issuers; KLAIM holds only
                references and derives proofs on demand.
              </PrivacyNote>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
