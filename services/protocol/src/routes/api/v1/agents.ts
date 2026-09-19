/**
 * Verifier agent management API.
 *
 *   GET  /api/v1/agents        list agents (never returns key material)
 *   POST /api/v1/agents        create agent -> returns the access key ONCE
 *
 * The access key is a KLAIM API credential only. It is not a wallet key, seed
 * phrase or signing secret, and KLAIM stores only its SHA-256 hash.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { maskKey, repository } from "@/lib/klaim/server/store.server";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).default(""),
  providers: z.array(z.string().max(40)).max(10).default([]),
  tools: z.array(z.string().max(60)).max(20).default([]),
  spending: z
    .object({
      dailyLimitUsdc: z.number().min(0).max(1000).default(5),
      perRequestLimitUsdc: z.number().min(0).max(100).default(0.5),
    })
    .default({ dailyLimitUsdc: 5, perRequestLimitUsdc: 0.5 }),
});

function publicAgent(a: ReturnType<typeof repository.listAgents>[number]) {
  const { keyHash: _keyHash, ...rest } = a;
  return rest;
}

export const Route = createFileRoute("/api/v1/agents")({
  server: {
    handlers: {
      GET: async () => Response.json({ agents: repository.listAgents().map(publicAgent), storage: repository.storage }),
      POST: async ({ request }) => {
        let input: z.infer<typeof createSchema>;
        try {
          input = createSchema.parse(await request.json());
        } catch {
          return Response.json({ error: "invalid_request" }, { status: 400 });
        }
        const { agent, accessKey } = await repository.createAgent(input);
        return Response.json(
          {
            agent: publicAgent(agent),
            // Shown once; KLAIM cannot display it again.
            accessKey,
            accessKeyMasked: maskKey(accessKey),
            notice: "Copy this key now — KLAIM stores only its hash and cannot show it again.",
          },
          { status: 201 },
        );
      },
    },
  },
});
