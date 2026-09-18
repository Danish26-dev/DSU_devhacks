/**
 * Runtime configuration for klaim-api.
 *
 * Values are read from the environment. Service-to-service URLs are NEVER
 * hardcoded (see docs/DEPLOYMENT.md). Cloud Run injects PORT.
 */

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export interface KlaimApiConfig {
  serviceName: "klaim-api";
  port: number;
  /** Comma-separated allowlist of frontend origins for CORS (empty = none). */
  allowedOrigins: string[];
  /**
   * When true, mounts the DEVELOPMENT/TEST-only lifecycle trigger endpoints
   * (mock settlement + mock verification). Off unless KLAIM_DEV_ADAPTERS=true.
   * Must never be enabled in production.
   */
  devAdapters: boolean;
  /**
   * Protocol service (x402 + Algorand settlement) wiring. When BOTH are set the
   * backend uses the real ProtocolPaymentAdapter; otherwise it falls back to the
   * MockPaymentAdapter. See docs/PAYMENT_ADAPTER_CONTRACT.md.
   */
  protocolServiceUrl: string | undefined;
  /** ZKP service base URL. When set (with the token), the real
   *  ProtocolVerificationAdapter is used; otherwise the mock. Defaults to the
   *  protocol service URL when unset (same service exposes /api/zkp/generate). */
  zkpServiceUrl: string | undefined;
  internalServiceToken: string | undefined;
}

export function loadConfig(): KlaimApiConfig {
  const port = Number(env("PORT") ?? "8080");
  return {
    serviceName: "klaim-api",
    port: Number.isFinite(port) && port > 0 ? port : 8080,
    allowedOrigins: (env("ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    devAdapters: env("KLAIM_DEV_ADAPTERS") === "true",
    protocolServiceUrl: env("PROTOCOL_SERVICE_URL"),
    // ZKP service defaults to the protocol service URL (same deployment exposes
    // /api/zkp/generate) when ZKP_SERVICE_URL is not explicitly set.
    zkpServiceUrl: env("ZKP_SERVICE_URL") ?? env("PROTOCOL_SERVICE_URL"),
    internalServiceToken: env("INTERNAL_SERVICE_TOKEN"),
  };
}
