/**
 * GET /api/health — runtime configuration truth, nothing aspirational.
 */
import { createFileRoute } from "@tanstack/react-router";

import { digilockerConfigured, strandsConfiguredEnv, zkConfigured } from "@/lib/klaim/server/env.server";
import { facilitatorReachable, x402Configured } from "@/lib/klaim/server/x402.server";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const facilitator = await facilitatorReachable();
        return Response.json({
          mcp: true,
          x402: x402Configured(),
          facilitator,
          algorand: x402Configured() && facilitator,
          providerAgent: true,
          providerAgentRuntime: strandsConfiguredEnv() ? "strands" : "deterministic",
          zkp: zkConfigured(),
          digilocker: digilockerConfigured(),
        });
      },
    },
  },
});
