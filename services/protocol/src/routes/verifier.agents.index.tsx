import { Link, createFileRoute } from "@tanstack/react-router";
import { Bot, Plus } from "lucide-react";
import { useState } from "react";

import { AgentStatusPills, CopyButton, ProviderTags } from "@/components/app/agent-ui";
import { CreateAgentModal } from "@/components/app/create-agent-modal";
import { PageHeading, Panel, PanelHeader, PrivacyNote } from "@/components/app/primitives";
import { getPublicMcpUrl } from "@/lib/klaim/mcp-url";
import { useKlaim } from "@/lib/klaim/store";

export const Route = createFileRoute("/verifier/agents/")({
  head: () => ({
    meta: [
      { title: "AI Verification Agents — KLAIM Verifier" },
      {
        name: "description",
        content:
          "Create AI verification agents, connect them to Claude, GPT or Strands over the universal KLAIM MCP endpoint, and let them request privacy-preserving human verification.",
      },
      { property: "og:title", content: "AI Verification Agents — KLAIM Verifier" },
      {
        property: "og:description",
        content: "Provider-agnostic MCP agents that pay per verification with x402 on Algorand.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const { agents } = useKlaim();
  const [open, setOpen] = useState(false);
  const mcpEndpoint = getPublicMcpUrl();

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Agents"
        title="AI Verification Agents"
        subtitle="Connect your AI agents to KLAIM and let them request privacy-preserving human verification."
        actions={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary/20"
          >
            <Plus className="size-3.5" /> Create Agent
          </button>
        }
      />

      <Panel>
        <PanelHeader title="Universal MCP endpoint" hint="Live" />
        <div className="flex flex-wrap items-center gap-3 p-5">
          <code className="font-mono text-sm text-foreground">{mcpEndpoint}</code>
          <CopyButton value={mcpEndpoint}>Copy</CopyButton>
          <p className="w-full text-xs leading-relaxed text-muted-foreground">
            One endpoint for every agent. Works with Claude, GPT / OpenAI, Strands and any other MCP-compatible client.
          </p>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {agents.map((agent) => (
          <Panel key={agent.id} className="flex flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center border border-border bg-background text-primary">
                  <Bot className="size-4" />
                </span>
                <div>
                  <p className="text-sm text-foreground">{agent.name}</p>
                  <p className="mt-1 font-mono text-[10px] tracking-[0.1em] text-muted-foreground">{agent.id}</p>
                </div>
              </div>
              <AgentStatusPills agent={agent} />
            </div>

            <div className="flex-1 space-y-4 p-5">
              <p className="text-xs leading-relaxed text-muted-foreground">{agent.description}</p>

              <div>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  Providers
                </p>
                <ProviderTags providers={agent.providers} />
              </div>

              <div>
                <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Tools</p>
                <div className="flex flex-wrap gap-1.5">
                  {agent.tools.map((t) => (
                    <code
                      key={t}
                      className="border border-border bg-background/60 px-2 py-0.5 font-mono text-[10px] text-foreground"
                    >
                      {t}
                    </code>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Today&apos;s spend
                  </p>
                  <p className="mt-1 font-mono text-sm text-foreground">${agent.spendTodayUsdc.toFixed(2)} USDC</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Last activity
                  </p>
                  <p className="mt-1 text-sm text-foreground">{agent.lastActivity}</p>
                </div>
              </div>
            </div>

            <div className="border-t border-border p-4">
              <Link
                to="/verifier/agents/$agentId"
                params={{ agentId: agent.id }}
                className="inline-flex w-full items-center justify-center border border-border bg-secondary/40 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                Open Agent
              </Link>
            </div>
          </Panel>
        ))}
      </div>

      <PrivacyNote>
        Agents never receive personal data. They receive a single boolean claim result — payment, settlement and proof
        generation all happen in KLAIM&apos;s backend infrastructure, never in this interface.
      </PrivacyNote>

      <CreateAgentModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
