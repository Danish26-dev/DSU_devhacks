import {
  CopyField,
  KeyValue,
  PageHeading,
  Panel,
  PanelHeader,
  PrivacyNote,
} from "@/components/app/primitives";
import { useKlaim } from "@/lib/klaim/store";

export function Settings() {
  const { user, credentials } = useKlaim();
  if (!user) return null;

  return (
    <div className="space-y-8">
      <PageHeading eyebrow="Settings" title="Settings" subtitle="Profile, identity and developer configuration." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Profile" />
          <div className="px-5 py-2">
            <KeyValue label="Name" value={user.name} />
            <KeyValue label="Email" value={user.email} />
            <KeyValue label="Session" value={<span className="text-muted-foreground">Demo authentication</span>} />
          </div>
          <div className="p-5 pt-3">
            <CopyField value={user.did} label="DID" />
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Connected Credentials" />
          <div className="px-5 py-2">
            {credentials.map((c) => (
              <KeyValue key={c.id} label={c.documentType} value={<span className="text-primary">✓ {c.issuer}</span>} />
            ))}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Privacy" />
          <div className="px-5 py-2">
            <KeyValue label="Raw document" value={<span className="text-muted-foreground">Not shared</span>} />
            <KeyValue label="Underlying credential" value={<span className="text-primary">Protected</span>} />
            <KeyValue label="Only required claim" value={<span className="text-primary">Disclosed</span>} />
          </div>
          <div className="p-5 pt-3">
            <PrivacyNote>KLAIM proves claims, not identities.</PrivacyNote>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Developer Settings" />
          <div className="px-5 py-2">
            <KeyValue label="MCP Endpoint" value={<span className="text-muted-foreground">Not connected</span>} />
            <KeyValue label="x402" value="Algorand Testnet" />
            <KeyValue label="Settlement asset" value="USDC" />
            <KeyValue label="Backend" value={<span className="text-muted-foreground">Mock services</span>} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
