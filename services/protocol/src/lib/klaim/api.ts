/**
 * Browser client for the REAL KLAIM backend API.
 *
 * Anything reached through this module is served by the app's own server
 * routes — not the browser mock in services.ts.
 */
export interface IntegrationStatus {
  id: string;
  label: string;
  state: "live" | "pending_credentials" | "not_configured";
  detail: string;
  requires: string[];
}

export interface IntegrationsResponse {
  integrations: IntegrationStatus[];
  mcp: { endpoint: string; transport: string; tools: Array<{ name: string; title: string; description: string }> };
  storage: string;
}

async function json<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok && res.status !== 402 && res.status !== 503) {
    throw new Error(body.message ?? body.error ?? `Request failed (${res.status})`);
  }
  return body;
}

export const klaimApi = {
  integrations: () => json<IntegrationsResponse>("/api/v1/integrations"),

  createAgent: (input: {
    name: string;
    description?: string;
    providers?: string[];
    tools?: string[];
    spending?: { dailyLimitUsdc: number; perRequestLimitUsdc: number };
  }) =>
    json<{ agent: { id: string; keyPrefix: string | null }; accessKey: string; notice: string }>("/api/v1/agents", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  rotateAgentKey: (agentId: string) =>
    json<{ accessKey: string; notice: string }>(`/api/v1/agents/${agentId}?action=rotate`, { method: "POST" }),

  revokeAgentKey: (agentId: string) =>
    json<{ agent: { id: string; status: string } }>(`/api/v1/agents/${agentId}?action=revoke`, { method: "POST" }),

  deleteCredential: (id: string) =>
    json<{ deleted: boolean; effects?: Record<string, string>; error?: string }>(
      `/api/v1/credentials?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),

  digilockerAuthorize: (input: { subjectDid: string; documentType: string }) =>
    json<{
      state: "ready" | "pending_credentials";
      authorizationUrl: string | null;
      consent: { requested: string; purpose: string; used: string; retained: string };
      missing: string[];
    }>("/api/v1/digilocker?action=authorize", { method: "POST", body: JSON.stringify(input) }),
};
