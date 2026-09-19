/**
 *   POST   /api/v1/agents/:agentId?action=rotate|revoke
 *   DELETE /api/v1/agents/:agentId
 */
import { createFileRoute } from "@tanstack/react-router";

import { maskKey, repository } from "@/lib/klaim/server/store.server";

function publicAgent(a: NonNullable<ReturnType<typeof repository.getAgent>>) {
  const { keyHash: _keyHash, ...rest } = a;
  return rest;
}

export const Route = createFileRoute("/api/v1/agents/$agentId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const agent = repository.getAgent(params.agentId);
        if (!agent) return Response.json({ error: "not_found" }, { status: 404 });
        return Response.json({ agent: publicAgent(agent), audit: repository.listAudit(agent.id) });
      },
      POST: async ({ params, request }) => {
        const action = new URL(request.url).searchParams.get("action");
        if (action === "rotate") {
          const rotated = await repository.rotateAgentKey(params.agentId);
          if (!rotated) return Response.json({ error: "not_found" }, { status: 404 });
          return Response.json({
            agent: publicAgent(rotated.agent),
            accessKey: rotated.accessKey,
            accessKeyMasked: maskKey(rotated.accessKey),
            notice: "Previous key is now invalid. Copy this one — it is shown only once.",
          });
        }
        if (action === "revoke") {
          const agent = repository.revokeAgentKey(params.agentId);
          if (!agent) return Response.json({ error: "not_found" }, { status: 404 });
          return Response.json({ agent: publicAgent(agent) });
        }
        return Response.json({ error: "invalid_action", message: "action must be rotate or revoke" }, { status: 400 });
      },
      DELETE: async ({ params }) => {
        const ok = repository.deleteAgent(params.agentId);
        return Response.json({ deleted: ok }, { status: ok ? 200 : 404 });
      },
    },
  },
});
