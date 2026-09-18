/**
 * Centralized MCP URL resolution for KLAIM.
 *
 * Priority:
 *   1. VITE_PUBLIC_MCP_URL environment variable (set at build time or in .env)
 *   2. Runtime origin (window.location.origin on the client, request URL on the server)
 *      + "/api/public/mcp"
 *
 * This module is the SINGLE source of truth for the public MCP endpoint URL.
 * Components and services must import from here — never hardcode the path.
 */

export const MCP_PATH = "/api/public/mcp";

/**
 * Returns the full public MCP endpoint URL for use in client-side code.
 *
 * Safe to call only in the browser (uses `window`). For SSR/server contexts
 * use `getServerMcpUrl(requestUrl)` instead.
 */
export function getPublicMcpUrl(): string {
  const override = import.meta.env?.["VITE_PUBLIC_MCP_URL"];
  if (override && typeof override === "string" && override.trim().length > 0) {
    return override.trim();
  }
  if (typeof window !== "undefined") {
    return new URL(MCP_PATH, window.location.origin).toString();
  }
  // Fallback for SSR pre-render where window is unavailable and no env is set.
  return MCP_PATH;
}

/**
 * Returns the full public MCP endpoint URL for server-side code where the
 * incoming request URL is available.
 */
export function getServerMcpUrl(requestUrl: string): string {
  const override = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    "VITE_PUBLIC_MCP_URL"
  ];
  if (override && override.trim().length > 0) {
    return override.trim();
  }
  const origin = new URL(requestUrl).origin;
  return `${origin}${MCP_PATH}`;
}
