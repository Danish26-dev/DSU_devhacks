import { Link, createFileRoute, useParams } from "@tanstack/react-router";
import { ArrowLeft, Play } from "lucide-react";
import { useState } from "react";

import { AgentStatusPills, AgentTimeline, McpConnectionPanel, ProviderTags } from "@/components/app/agent-ui";
import {
  DemoTag,
  KeyValue,
  PageHeading,
  Panel,
  PanelHeader,
  PrivacyNote,
  StatusPill,
} from "@/components/app/primitives";
import { AGENT_TOOLS } from "@/lib/klaim/mock-data";
import { mcpService } from "@/lib/klaim/services";
import { useKlaim } from "@/lib/klaim/store";

export const Route = createFileRoute("/verifier/agents/$agentId")({
  head: () => ({
    meta: [
      { title: "Agent detail — KLAIM Verifier" },
      {
        name: "description",
        content:
          "Overview, MCP connection, tools, spending controls and the full x402 to Algorand to ZK proof event timeline for a KLAIM verification agent.",
      },
      { property: "og:title", content: "Agent detail — KLAIM Verifier" },
      { property: "og:description", content: "MCP connection, tools, spending and event timeline for one agent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentDetailPage,
});

const sections = ["Overview", "MCP", "Tools", "Spending", "Activity"] as const;
type Section = (typeof sections)[number];

function AgentDetailPage() {
  const { agentId } = useParams({ from: "/verifier/agents/$agentId" });
  const { agents, appendAgentEvents, updateAgent } = useKlaim();
  const [tab, setTab] = useState<Section>("Overview");
  const [running, setRunning] = useState(false);

  const agent = agents.find((a) => a.id === agentId);

  if (!agent) {
    return (
      <div className="space-y-6">
        <PageHeading eyebrow="Agent" title="Agent not found" subtitle="This agent no longer exists in the demo state." />
        <Link
          to="/verifier/agents"
          className="inline-flex items-center gap-2 border border-border px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground hover:text-primary"
        >
          <ArrowLeft className="size-3.5" /> Back to agents
        </Link>
      </div>
    );
  }

  const enabledTools = AGENT_TOOLS.filter((t) => agent.tools.includes(t.id));

  const runSimulation = async () => {
    if (running) return;
    setRunning(true);
    const tool = enabledTools[0] ?? AGENT_TOOLS[0]!;
    const events = mcpService.simulateRun(tool.id, tool.id === "verify_human_age" ? "Age > 18" : tool.name);
    setTab("Activity");
    for (const event of events) {
      // eslint-disable-next-line no-await-in-loop -- paced for the demo timeline
      await new Promise((r) => setTimeout(r, 550));
      appendAgentEvents(agent.id, [event]);
    }
    updateAgent(agent.id, {
      spendTodayUsdc: Number((agent.spendTodayUsdc + tool.priceUsdc).toFixed(2)),
      mcpStatus: "connected",
    });
    setRunning(false);
  };

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/verifier/agents"
          className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-3.5" /> Agents
        </Link>
      </div>

      <PageHeading
        eyebrow="Agent"
        title={agent.name}
        subtitle={agent.description}
        actions={
          <button
            type="button"
            onClick={() => void runSimulation()}
            disabled={running}
            className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
          >
            <Play className="size-3.5" /> {running ? "Running…" : "Run simulated request"}
          </button>
        }
      />

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {sections.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={
              "border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors " +
              (tab === s
                ? "border-primary/45 bg-primary/10 text-primary"
                : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground")
            }
          >
            {s}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <Panel>
          <PanelHeader title="Overview" hint="Demo data" />
          <div className="space-y-4 p-5">
            <AgentStatusPills agent={agent} />
            <div>
              <KeyValue label="Agent ID" value={<code>{agent.id}</code>} />
              <KeyValue label="Provider" value={<ProviderTags providers={agent.providers} />} />
              <KeyValue label="Created" value={agent.createdAt} />
              <KeyValue label="Last request" value={agent.lastActivity} />
              <KeyValue label="Today's spend" value={`$${agent.spendTodayUsdc.toFixed(2)} USDC`} />
            </div>
          </div>
        </Panel>
      ) : null}

      {tab === "MCP" ? <McpConnectionPanel agent={agent} /> : null}

      {tab === "Tools" ? (
        <Panel>
          <PanelHeader title="Tools" hint="Exposed over MCP" />
          <div className="divide-y divide-border">
            {enabledTools.map((tool) => (
              <div key={tool.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div className="max-w-xl">
                  <code className="font-mono text-sm text-foreground">{tool.name}</code>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{tool.description}</p>
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    ${tool.priceUsdc.toFixed(2)} USDC per request · x402
                  </p>
                </div>
                <StatusPill>● Enabled</StatusPill>
              </div>
            ))}
            {enabledTools.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No tools enabled for this agent.</p>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {tab === "Spending" ? (
        <Panel>
          <PanelHeader title="Spending" hint="x402 · USDC · Algorand Testnet" />
          <div className="space-y-4 p-5">
            <div>
              <KeyValue label="Daily limit" value={`$${agent.spending.dailyLimitUsdc.toFixed(2)} USDC`} />
              <KeyValue label="Per-request limit" value={`$${agent.spending.perRequestLimitUsdc.toFixed(2)} USDC`} />
              <KeyValue label="Spent today" value={`$${agent.spendTodayUsdc.toFixed(2)} USDC`} />
              <KeyValue label="Facilitator" value="GoPlausible" />
              <KeyValue
                label="Transaction ID"
                value={
                  <span className="flex items-center gap-2 text-muted-foreground">
                    Not available <DemoTag label="Simulated" />
                  </span>
                }
              />
            </div>
            <PrivacyNote>
              Payment authorization and settlement run in KLAIM&apos;s backend. No wallet key, seed phrase or signing
              secret is ever held by this interface. Real transaction IDs appear here once settlement is live.
            </PrivacyNote>
          </div>
        </Panel>
      ) : null}

      {tab === "Activity" ? (
        <Panel>
          <PanelHeader title="Event timeline" hint="Demo / Simulated" />
          <AgentTimeline events={agent.events} />
        </Panel>
      ) : null}
    </div>
  );
}
