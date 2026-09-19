/**
 * GET /api/v1/integrations — honest integration readiness for the UI.
 */
import { createFileRoute } from "@tanstack/react-router";

import { integrationStatuses } from "@/lib/klaim/server/env.server";
import { MCP_TOOLS } from "@/lib/klaim/server/mcp.server";
import { getServerMcpUrl } from "@/lib/klaim/mcp-url";
import { repository } from "@/lib/klaim/server/store.server";

export const Route = createFileRoute("/api/v1/integrations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return Response.json({
          integrations: integrationStatuses(),
          mcp: {
            endpoint: getServerMcpUrl(request.url),
            transport: "streamable-http",
            tools: MCP_TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description })),
          },
          storage: repository.storage,
        });
      },
    },
  },
});
