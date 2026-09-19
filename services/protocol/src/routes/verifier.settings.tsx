import { createFileRoute } from "@tanstack/react-router";

import { CopyField, KeyValue, PageHeading, Panel, PanelHeader, PrivacyNote } from "@/components/app/primitives";
import { IntegrationStatusPanel } from "@/components/app/integration-status";
import { useKlaim } from "@/lib/klaim/store";

export const Route = createFileRoute("/verifier/settings")({
  head: () => ({
    meta: [
      { title: "Settings — KLAIM Verifier" },
      { name: "description", content: "Verifier profile, agent configuration, MCP endpoint and x402 settlement settings." },
      { property: "og:title", content: "Settings — KLAIM Verifier" },
      { property: "og:description", content: "Configure your agent, MCP endpoint and x402 settlement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VerifierSettingsPage,
});

function VerifierSettingsPage() {
  const { user } = useKlaim();
  if (!user) return null;

  return (
    <div className="space-y-8">
      <PageHeading eyebrow="Settings" title="Settings" subtitle="Verifier profile and developer configuration." />

      <IntegrationStatusPanel />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Profile" />
          <div className="px-5 py-2">
            <KeyValue label="Account" value={user.name} />
            <KeyValue label="Email" value={user.email} />
            <KeyValue label="Role" value={<span className="text-primary">Verifier</span>} />
            <KeyValue label="Session" value={<span className="text-muted-foreground">Demo authentication</span>} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Agent / MCP" />
          <div className="px-5 py-2">
            <KeyValue label="Agent" value="Claude / GPT" />
            <KeyValue label="Available tool" value={<code>verify_human_age()</code>} />
          </div>
          <div className="p-5 pt-3">
            <CopyField label="MCP Endpoint (demo)" value="https://mcp.klaim.demo/v1/verification" />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Payments" />
          <div className="px-5 py-2">
            <KeyValue label="x402" value="Algorand Testnet" />
            <KeyValue label="Settlement asset" value="USDC" />
            <KeyValue label="Facilitator" value={<span className="text-muted-foreground">Not connected</span>} />
            <KeyValue label="Backend" value={<span className="text-muted-foreground">Mock services</span>} />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Data received" />
          <div className="px-5 py-2">
            <KeyValue label="Claim result" value={<span className="text-primary">Disclosed</span>} />
            <KeyValue label="Date of birth" value={<span className="text-muted-foreground">Never</span>} />
            <KeyValue label="Documents / identifiers" value={<span className="text-muted-foreground">Never</span>} />
          </div>
          <div className="p-5 pt-3">
            <PrivacyNote>KLAIM proves claims, not identities. Verifiers cannot modify a human's credentials.</PrivacyNote>
          </div>
        </Panel>
      </div>
    </div>
  );
}
