/**
 * Create Agent modal. Provider-agnostic: a verifier may target Claude, GPT,
 * Strands or any other MCP-compatible client. The generated agent ID and
 * access key are simulated until the KLAIM backend issues real ones.
 */
import { X } from "lucide-react";
import { useState } from "react";

import { CopyButton, McpConnectionPanel } from "@/components/app/agent-ui";
import { DemoTag, PanelHeader } from "@/components/app/primitives";
import { AGENT_TOOLS, PROVIDER_LABELS } from "@/lib/klaim/mock-data";
import { agentService } from "@/lib/klaim/services";
import { useKlaim } from "@/lib/klaim/store";
import type { AgentProvider, AgentToolId, VerifierAgent } from "@/lib/klaim/types";
import { cn } from "@/lib/utils";

const providers: AgentProvider[] = ["claude", "openai", "strands", "custom"];

export function CreateAgentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { addAgent } = useKlaim();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<AgentProvider[]>(["claude"]);
  const [tools, setTools] = useState<AgentToolId[]>(["verify_human_age"]);
  const [dailyLimit, setDailyLimit] = useState("5");
  const [perRequest, setPerRequest] = useState("0.05");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<VerifierAgent | null>(null);

  if (!open) return null;

  const toggle = <T,>(list: T[], value: T, set: (v: T[]) => void) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const reset = () => {
    setName("");
    setDescription("");
    setSelectedProviders(["claude"]);
    setTools(["verify_human_age"]);
    setCreated(null);
  };

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const agent = await agentService.create({
      name: name.trim(),
      description: description.trim() || "No description provided.",
      providers: selectedProviders.length ? selectedProviders : ["custom"],
      tools: tools.length ? tools : ["verify_human_age"],
      spending: {
        dailyLimitUsdc: Number(dailyLimit) || 0,
        perRequestLimitUsdc: Number(perRequest) || 0,
      },
    });
    addAgent(agent);
    setCreated(agent);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-start overflow-y-auto bg-background/85 p-4 backdrop-blur-sm sm:p-8">
      <div className="mx-auto w-full max-w-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
            {created ? "Agent created" : "Create agent"}
          </h2>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {created ? (
          <div className="space-y-5 p-5">
            <div className="border border-border bg-background/60 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Agent ID</p>
              <p className="mt-1 font-mono text-sm text-foreground">{created.id}</p>
              <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                MCP access key
              </p>
              <p className="mt-1 flex items-center gap-2 font-mono text-sm text-foreground">
                {created.accessKeyMasked} <DemoTag label="Simulated" />
              </p>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                This is a demo access key. A real key will be issued once the KLAIM backend is connected. It is an API
                credential only — never a blockchain private key.
              </p>
              <div className="mt-4">
                <CopyButton value={created.id}>Copy Agent ID</CopyButton>
              </div>
            </div>

            <McpConnectionPanel agent={created} />

            <button
              type="button"
              onClick={() => {
                reset();
                onClose();
              }}
              className="w-full border border-primary/40 bg-primary/10 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary/20"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-6 p-5">
            <Field label="Agent name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer Onboarding Agent"
                className="w-full border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
              />
            </Field>

            <Field label="Description">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What does this agent verify?"
                className="w-full resize-none border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
              />
            </Field>

            <Field label="AI provider (select any)">
              <div className="flex flex-wrap gap-2">
                {providers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggle(selectedProviders, p, setSelectedProviders)}
                    className={cn(
                      "border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
                      selectedProviders.includes(p)
                        ? "border-primary/45 bg-primary/10 text-primary"
                        : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Permissions">
              <div className="space-y-2">
                {AGENT_TOOLS.map((tool) => (
                  <label
                    key={tool.id}
                    className="flex cursor-pointer items-start gap-3 border border-border bg-background/50 p-3"
                  >
                    <input
                      type="checkbox"
                      checked={tools.includes(tool.id)}
                      onChange={() => toggle(tools, tool.id, setTools)}
                      className="mt-1 size-3.5 accent-[oklch(0.78_0.13_205)]"
                    />
                    <span>
                      <span className="block font-mono text-[11px] text-foreground">{tool.name}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {tool.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>

            <Field label="Spending controls (USDC)">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Daily limit
                  </span>
                  <input
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                    inputMode="decimal"
                    className="w-full border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary/50"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Per-request limit
                  </span>
                  <input
                    value={perRequest}
                    onChange={(e) => setPerRequest(e.target.value)}
                    inputMode="decimal"
                    className="w-full border border-border bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary/50"
                  />
                </label>
              </div>
            </Field>

            <button
              type="button"
              disabled={!name.trim() || busy}
              onClick={() => void submit()}
              className="w-full border border-primary/40 bg-primary/10 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
            >
              {busy ? "Creating agent…" : "Create Agent"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export { PanelHeader };
