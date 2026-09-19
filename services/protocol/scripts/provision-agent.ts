/**
 * KLAIM Agent Provisioning — creates agent credentials for the test client.
 *
 * Usage:
 *   1. Start server: npm run dev
 *   2. Run: npx tsx scripts/provision-agent.ts
 *   3. Copy output into .env
 */

const BASE_URL = process.env["KLAIM_BASE_URL"] ?? "http://localhost:8080";

async function main() {
  console.log("\nKLAIM Agent Provisioning");
  console.log("========================\n");

  const res = await fetch(`${BASE_URL}/api/v1/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "KLAIM x402 Test Agent",
      description: "Independent test client for the x402 payment flow",
      providers: ["custom"],
      tools: ["verify_human_age"],
      spending: { dailyLimitUsdc: 1.0, perRequestLimitUsdc: 0.1 },
    }),
  });

  if (!res.ok) {
    console.error(`Failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }

  const data = (await res.json()) as {
    agent: { id: string };
    accessKey: string;
    notice: string;
  };

  console.log("Agent created!\n");
  console.log("  Agent ID:   " + data.agent.id);
  console.log("  Access Key: " + data.accessKey);
  console.log("\n--- Add to .env ---\n");
  console.log(`KLAIM_AGENT_ID=${data.agent.id}`);
  console.log(`KLAIM_AGENT_KEY=${data.accessKey}`);
  console.log("\n========================\n");
}

main().catch((err: unknown) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
