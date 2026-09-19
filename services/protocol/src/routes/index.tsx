import { createFileRoute } from "@tanstack/react-router";
import { KlaimLanding } from "@/components/klaim-landing";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KLAIM — Human Verification for AI Agents" },
      { name: "description", content: "Pay-per-use human identity verification for AI agents using zero-knowledge proofs, MCP, x402 and USDC settlement on Algorand." },
      { property: "og:title", content: "KLAIM — Human Verification for AI Agents" },
      { property: "og:description", content: "AI agents request trusted human identity claims and receive only the proof they need." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <KlaimLanding />;
}
