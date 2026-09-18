/**
 * Idina runtime configuration. All values from env (Cloud Run injects PORT).
 * Service URLs are never hardcoded.
 */
function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export type IdinaMode = "agent" | "deterministic";

export interface IdinaConfig {
  serviceName: "idina";
  port: number;
  /** "agent" = Google ADK-equivalent (Gemini function-calling). "deterministic" = fixed orchestration. */
  mode: IdinaMode;
  gemini: {
    project: string | undefined;
    location: string | undefined;
    useVertex: boolean;
    model: string;
  };
  /** Service clients. */
  klaimApiUrl: string | undefined;
  protocolServiceUrl: string | undefined;
  zkpServiceUrl: string | undefined;
  internalServiceToken: string | undefined;
}

export function loadConfig(): IdinaConfig {
  const port = Number(env("PORT") ?? "8082");
  const mode: IdinaMode = env("IDINA_MODE") === "agent" ? "agent" : "deterministic";
  return {
    serviceName: "idina",
    port: Number.isFinite(port) && port > 0 ? port : 8082,
    mode,
    gemini: {
      project: env("GOOGLE_CLOUD_PROJECT"),
      location: env("GOOGLE_CLOUD_LOCATION"),
      useVertex: env("GOOGLE_GENAI_USE_VERTEXAI") === "true",
      model: env("GEMINI_MODEL") ?? "gemini-2.0-flash",
    },
    klaimApiUrl: env("KLAIM_API_URL"),
    protocolServiceUrl: env("PROTOCOL_SERVICE_URL"),
    zkpServiceUrl: env("ZKP_SERVICE_URL"),
    internalServiceToken: env("INTERNAL_SERVICE_TOKEN"),
  };
}
