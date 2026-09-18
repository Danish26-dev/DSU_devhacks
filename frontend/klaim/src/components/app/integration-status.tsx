/**
 * Honest integration readiness, read from the real backend.
 *
 * KLAIM never reports an integration as live unless the credentials required
 * to reach the external service are actually configured.
 */
import { useEffect, useState } from "react";

import { KeyValue, Panel, PanelHeader, PrivacyNote, StatusPill } from "@/components/app/primitives";
import { klaimApi, type IntegrationsResponse } from "@/lib/klaim/api";

const STATE_LABEL: Record<string, string> = {
  live: "Live",
  pending_credentials: "Awaiting credentials",
  not_configured: "Not configured",
};

export function IntegrationStatusPanel() {
  const [data, setData] = useState<IntegrationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    klaimApi
      .integrations()
      .then((res) => {
        // The V2 backend does not (yet) expose /api/v1/integrations. Guard
        // against a response that lacks the expected array shape so the panel
        // shows a clean "unavailable" state instead of crashing.
        if (res && Array.isArray(res.integrations)) setData(res);
        else setError("Integration status is not available from the V2 backend yet.");
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const integrations = data?.integrations ?? [];
  const tools = data?.mcp?.tools ?? [];

  return (
    <Panel accent>
      <PanelHeader title="Integration status" {...(data ? { hint: `storage: ${data.storage}` } : {})} />
      <div className="px-5 py-2">
        {error ? <p className="py-3 text-sm text-destructive">{error}</p> : null}
        {!data && !error ? <p className="py-3 text-sm text-muted-foreground">Loading…</p> : null}
        {integrations.map((i) => (
          <KeyValue
            key={i.id}
            label={i.label}
            value={
              <span className="flex flex-col items-end gap-1 text-right">
                <StatusPill tone={i.state === "live" ? "ok" : "muted"}>{STATE_LABEL[i.state] ?? i.state}</StatusPill>
                <span className="max-w-md text-xs text-muted-foreground">{i.detail}</span>
                {i.requires.length > 0 && i.state !== "live" ? (
                  <span className="font-mono text-[10px] text-muted-foreground">requires: {i.requires.join(", ")}</span>
                ) : null}
              </span>
            }
          />
        ))}
      </div>
      {data?.mcp ? (
        <div className="p-5 pt-3">
          <PrivacyNote>
            MCP endpoint: <code className="break-all">{data.mcp.endpoint}</code> · tools:{" "}
            {tools.map((t) => t.name).join(", ")}. Server-side records are held in memory for this deployment
            and are not durable.
          </PrivacyNote>
        </div>
      ) : null}
    </Panel>
  );
}
