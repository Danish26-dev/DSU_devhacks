/**
 * Shared UI pieces for the verifier agent experience.
 * All data shown here comes from the mocked service layer — nothing in this
 * file signs a payment, holds a key or talks to a chain.
 */
import { Check, CheckCircle2, Copy, KeyRound, ShieldOff, Terminal, Wifi, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { DemoTag, KeyValue, Panel, PanelHeader, StatusPill } from "@/components/app/primitives";
import { klaimApi } from "@/lib/klaim/api";
import { getPublicMcpUrl } from "@/lib/klaim/mcp-url";
import { PROVIDER_LABELS } from "@/lib/klaim/mock-data";
import type { AgentEvent, AgentProvider, VerifierAgent } from "@/lib/klaim/types";
import { cn } from "@/lib/utils";

export function ProviderTags({ providers }: { providers: AgentProvider[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {providers.map((p) => (
        <span
          key={p}
          className="border border-border bg-secondary/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
        >
          {PROVIDER_LABELS[p]}
        </span>
      ))}
    </div>
  );
}

export function CopyButton({ value, children }: { value: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="inline-flex items-center gap-2 border border-border bg-secondary/40 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : children}
    </button>
  );
}

const actorLabel: Record<AgentEvent["actor"], string> = {
  agent: "Agent",
  klaim: "KLAIM",
  x402: "x402",
  algorand: "Algorand",
  zk: "ZK",
};

export function AgentTimeline({ events }: { events: AgentEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="p-5 text-sm text-muted-foreground">
        No events yet. Run a simulated verification to see the full x402 → Algorand → ZK timeline.
      </p>
    );
  }
  return (
    <ol className="divide-y divide-border">
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{e.at}</span>
          <span className="min-w-20 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
            {actorLabel[e.actor]}
          </span>
          <span className="text-sm text-foreground">{e.message}</span>
          {e.detail ? (
            <span
              className={cn(
                "font-mono text-[11px]",
                e.tone === "ok" ? "text-primary" : e.tone === "warn" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {e.detail}
            </span>
          ) : null}
          {e.simulated ? <DemoTag label="Simulated" /> : null}
        </li>
      ))}
    </ol>
  );
}

function useLiveEndpoint() {
  const [endpoint, setEndpoint] = useState(getPublicMcpUrl());
  useEffect(() => {
    // Re-resolve on mount in case the initial SSR value was just the path.
    setEndpoint(getPublicMcpUrl());
  }, []);
  return endpoint;
}

/* ------------------------------------------------------------------ types */

interface ConnectionTestResult {
  reachable: boolean;
  authenticated: boolean;
  toolAvailable: boolean;
  error?: string;
  tools?: string[];
}

/* --------------------------------------------------------- connection test */

async function testMcpConnection(
  endpoint: string,
  agentId: string,
  accessKey: string,
): Promise<ConnectionTestResult> {
  try {
    // Step 1: Initialize
    const initRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KLAIM-Agent-Id": agentId,
        Authorization: `Bearer ${accessKey}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });

    if (initRes.status === 401) {
      return { reachable: true, authenticated: false, toolAvailable: false, error: "Authentication rejected" };
    }
    if (!initRes.ok) {
      return { reachable: true, authenticated: false, toolAvailable: false, error: `Server returned ${initRes.status}` };
    }

    const initJson = (await initRes.json()) as { result?: { serverInfo?: { name: string } }; error?: { message: string } };
    if (initJson.error) {
      return { reachable: true, authenticated: false, toolAvailable: false, error: initJson.error.message };
    }

    // Step 2: List tools
    const toolsRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KLAIM-Agent-Id": agentId,
        Authorization: `Bearer ${accessKey}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });

    if (!toolsRes.ok) {
      return { reachable: true, authenticated: true, toolAvailable: false, error: `tools/list failed (${toolsRes.status})` };
    }

    const toolsJson = (await toolsRes.json()) as { result?: { tools?: Array<{ name: string }> }; error?: { message: string } };
    if (toolsJson.error) {
      return { reachable: true, authenticated: true, toolAvailable: false, error: toolsJson.error.message };
    }

    const toolNames = toolsJson.result?.tools?.map((t) => t.name) ?? [];
    return {
      reachable: true,
      authenticated: true,
      toolAvailable: toolNames.includes("verify_human_age"),
      tools: toolNames,
    };
  } catch (e) {
    return { reachable: false, authenticated: false, toolAvailable: false, error: (e as Error).message };
  }
}

function ConnectionTestPanel({
  endpoint,
  agentId,
  accessKey,
}: {
  endpoint: string;
  agentId: string | null;
  accessKey: string | null;
}) {
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const canTest = Boolean(agentId && accessKey);

  async function runTest() {
    if (!agentId || !accessKey) return;
    setTesting(true);
    setResult(null);
    const r = await testMcpConnection(endpoint, agentId, accessKey);
    setResult(r);
    setTesting(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={testing || !canTest}
          onClick={() => void runTest()}
          className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
        >
          <Wifi className="size-3.5" />
          {testing ? "Testing…" : "Test Connection"}
        </button>
        {!canTest ? (
          <span className="text-xs text-muted-foreground">Issue an access key first</span>
        ) : null}
      </div>

      {result ? (
        <div className="space-y-1 border border-border bg-background/70 p-3">
          <TestLine ok={result.reachable} label="MCP reachable" />
          <TestLine ok={result.authenticated} label="Authentication accepted" />
          <TestLine ok={result.toolAvailable} label="verify_human_age available" />
          {result.error ? (
            <p className="mt-2 font-mono text-[11px] text-destructive">{result.error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TestLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {ok ? (
        <CheckCircle2 className="size-3.5 text-primary" />
      ) : (
        <XCircle className="size-3.5 text-destructive" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

/* -------------------------------------------------------------- tool card */

function McpToolCard() {
  return (
    <div className="space-y-3 border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <code className="font-mono text-sm text-foreground">verify_human_age</code>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Verify whether a human satisfies the age &gt; 18 claim without exposing the underlying identity document or raw PII.
          </p>
        </div>
        <StatusPill tone="ok">● Available</StatusPill>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Input</p>
          <pre className="overflow-x-auto bg-secondary/30 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
{`{
  "did": "did:klaim:..."
}`}
          </pre>
        </div>
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Output</p>
          <pre className="overflow-x-auto bg-secondary/30 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
{`{
  "verified": true,
  "claim": "age_over_18",
  "proof": {...},
  "payment": {...}
}`}
          </pre>
        </div>
      </div>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        $0.01 USDC per request · x402 · Algorand Testnet
      </p>
    </div>
  );
}

/**
 * Real MCP connection panel.
 *
 * The endpoint is the app's live MCP server. Access keys are provisioned by
 * the backend and shown exactly once — KLAIM stores only a hash.
 */
export function McpConnectionPanel({ agent }: { agent: VerifierAgent }) {
  const endpoint = useLiveEndpoint();
  const [serverAgentId, setServerAgentId] = useState<string | null>(null);
  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeId = serverAgentId ?? agent.id;
  const isDemoAgent = agent.demo && !serverAgentId;

  const config = JSON.stringify(
    {
      mcpServers: {
        klaim: {
          type: "http",
          url: endpoint,
          headers: {
            "X-KLAIM-Agent-Id": activeId,
            Authorization: `Bearer ${issuedKey ?? "<KLAIM_ACCESS_KEY>"}`,
          },
        },
      },
    },
    null,
    2,
  );

  const claudeCommand = `claude mcp add --scope user --transport http klaim '${endpoint}' --header 'X-KLAIM-Agent-Id: ${activeId}' --header 'Authorization: Bearer ${issuedKey ?? "<KLAIM_ACCESS_KEY>"}'`;

  async function provision() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await klaimApi.createAgent({
        name: agent.name,
        description: agent.description ?? "",
        providers: agent.providers,
        tools: ["verify_human_age"],
        spending: {
          dailyLimitUsdc: agent.spending?.dailyLimitUsdc ?? 5,
          perRequestLimitUsdc: agent.spending?.perRequestLimitUsdc ?? 0.5,
        },
      });
      setServerAgentId(res.agent.id);
      setIssuedKey(res.accessKey);
      setStatus(res.notice);
    } catch (error) {
      setStatus((error as Error).message);
    }
    setBusy(false);
  }

  async function rotate() {
    if (!serverAgentId) return;
    setBusy(true);
    try {
      const res = await klaimApi.rotateAgentKey(serverAgentId);
      setIssuedKey(res.accessKey);
      setStatus(res.notice);
    } catch (error) {
      setStatus((error as Error).message);
    }
    setBusy(false);
  }

  async function revoke() {
    if (!serverAgentId) return;
    setBusy(true);
    try {
      await klaimApi.revokeAgentKey(serverAgentId);
      setIssuedKey(null);
      setStatus("Key revoked. MCP calls with the previous key are now rejected.");
    } catch (error) {
      setStatus((error as Error).message);
    }
    setBusy(false);
  }

  const agentStatus: string = serverAgentId
    ? "Configured"
    : isDemoAgent
      ? "Demo"
      : "Not configured";

  return (
    <Panel accent>
      <PanelHeader
        title="KLAIM Verification Agent"
        hint={agentStatus}
      />
      <div className="space-y-5 p-5">
        {/* Status banner */}
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={serverAgentId ? "ok" : "muted"}>
            ● {agentStatus}
          </StatusPill>
          {isDemoAgent ? <DemoTag label="Demo Configuration" /> : null}
        </div>

        {/* Core connection info */}
        <div>
          <KeyValue label="MCP Endpoint" value={<code className="break-all">{endpoint}</code>} />
          <KeyValue label="Transport" value="Streamable HTTP · JSON-RPC 2.0 · MCP 2025-06-18" />
          <KeyValue label="Authentication" value="Bearer token" />
          <KeyValue label="Agent ID" value={<code className="break-all">{activeId}</code>} />
          <KeyValue
            label="Agent Key"
            value={
              issuedKey ? (
                <span className="font-mono break-all text-primary">{issuedKey}</span>
              ) : (
                <span className="font-mono text-muted-foreground">klm_••••••••</span>
              )
            }
          />
        </div>

        {/* Key management buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void (serverAgentId ? rotate() : provision())}
            className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            <KeyRound className="size-3.5" />
            {serverAgentId ? "Rotate" : "Issue access key"}
          </button>
          {serverAgentId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void revoke()}
              className="inline-flex items-center gap-2 border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-destructive transition-colors hover:border-destructive/50 disabled:opacity-50"
            >
              <ShieldOff className="size-3.5" /> Revoke
            </button>
          ) : null}
          <CopyButton value={endpoint}>Copy Endpoint</CopyButton>
          <CopyButton value={config}>Copy Configuration</CopyButton>
        </div>

        {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}

        {/* Connection test */}
        <ConnectionTestPanel endpoint={endpoint} agentId={serverAgentId} accessKey={issuedKey} />

        {/* Connect AI Agent section */}
        <div className="space-y-3 border-t border-border pt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Connect AI Agent
          </p>

          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Claude Code / Claude Desktop
            </p>
            <pre className="overflow-x-auto border border-border bg-background/70 p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {claudeCommand}
            </pre>
            <div className="mt-2">
              <CopyButton value={claudeCommand}>Copy Claude Command</CopyButton>
            </div>
          </div>

          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Client configuration (JSON)
            </p>
            <pre className="overflow-x-auto border border-border bg-background/70 p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {config}
            </pre>
            <div className="mt-2">
              <CopyButton value={config}>Copy JSON Config</CopyButton>
            </div>
          </div>

          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Supported clients
            </p>
            <ProviderTags providers={["claude", "openai", "strands", "custom"]} />
          </div>
        </div>

        {/* Tool display */}
        <div className="space-y-3 border-t border-border pt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            MCP Tool
          </p>
          <McpToolCard />
        </div>

        {/* Security note */}
        <p className="flex items-start gap-2 border border-dashed border-border bg-secondary/20 p-3 text-xs leading-relaxed text-muted-foreground">
          <Terminal className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>
            This is a real MCP endpoint served by this app. The access key is a{" "}
            <strong className="text-foreground">KLAIM API credential only</strong> — never a wallet key, seed phrase or
            signing secret. Keys are stored as hashes and shown once.
          </span>
        </p>
      </div>
    </Panel>
  );
}

export function AgentStatusPills({ agent }: { agent: VerifierAgent }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusPill tone={agent.status === "active" ? "ok" : "muted"}>● {agent.status}</StatusPill>
      <StatusPill tone={agent.mcpStatus === "connected" ? "ok" : "muted"}>
        MCP: ● {agent.mcpStatus === "connected" ? "Connected" : "Not connected"}
      </StatusPill>
    </div>
  );
}
