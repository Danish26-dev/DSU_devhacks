import { createFileRoute } from "@tanstack/react-router";

import { RoleLogin } from "@/components/app/role-login";

export const Route = createFileRoute("/login/verifier")({
  head: () => ({
    meta: [
      { title: "Verify Humans. Programmatically. — KLAIM Verifier Sign in" },
      {
        name: "description",
        content:
          "Sign in as a verifier to give your AI agents access to privacy-preserving human verification through MCP and x402 pay-per-verification.",
      },
      { property: "og:title", content: "Verify Humans. Programmatically. — KLAIM" },
      { property: "og:description", content: "Agent-driven human verification over MCP, settled per request with x402 USDC." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RoleLogin
      role="verifier"
      title="Verify Humans. Programmatically."
      subtitle="Give your AI agents access to privacy-preserving human verification through MCP and x402."
      demoLabel="Use Demo Verifier Account"
      demoHint="did:identipi:verifier-4c19"
      defaultEmail="ops@verifier.demo"
    />
  ),
});
