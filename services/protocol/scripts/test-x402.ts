/**
 * KLAIM x402 test client — proves the payment flow independently of the UI.
 *
 *   POST /api/v1/verify/age → 402 → sign with a Testnet wallet → retry
 *   → GoPlausible → Algorand Testnet settlement → 200 → REAL transaction id
 *
 * This script never prints a fabricated transaction. If the payer/provider
 * configuration is missing it exits with X402_NOT_CONFIGURED.
 *
 *   bun run scripts/test-x402.ts
 */
import "dotenv/config";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import { ALGORAND_TESTNET_CAIP2 } from "@x402/avm";
import algosdk from "algosdk";

const BASE_URL = process.env["KLAIM_BASE_URL"] ?? "http://localhost:8080";
const AGENT_ID = process.env["KLAIM_AGENT_ID"];
const AGENT_KEY = process.env["KLAIM_AGENT_KEY"];
const DID = process.env["KLAIM_DEMO_DID"] ?? "did:identipi:demo-user-001";
const ALGOD_URL = process.env["ALGOD_URL"] ?? "https://testnet-api.algonode.cloud";

function fail(missing: string[]): never {
  console.error("\nX402_NOT_CONFIGURED");
  console.error("Missing environment variables: " + missing.join(", "));
  console.error("See .env.example for how to configure and fund a Testnet wallet.");
  process.exit(1);
}

function loraUrl(txId: string) {
  return `https://lora.algokit.io/testnet/transaction/${txId}`;
}

async function main() {
  console.log("KLAIM x402 Test");
  console.log("----------------\n");

  const missing = [
    ...(process.env["PAYER_WALLET_ADDRESS"] ? [] : ["PAYER_WALLET_ADDRESS"]),
    ...(process.env["PAYER_PRIVATE_KEY"] ? [] : ["PAYER_PRIVATE_KEY"]),
    ...(AGENT_ID ? [] : ["KLAIM_AGENT_ID"]),
    ...(AGENT_KEY ? [] : ["KLAIM_AGENT_KEY"]),
  ];
  if (missing.length) fail(missing);

  const account = algosdk.mnemonicToSecretKey(process.env["PAYER_PRIVATE_KEY"]!);
  if (account.addr.toString() !== process.env["PAYER_WALLET_ADDRESS"]) {
    console.error("PAYER_PRIVATE_KEY does not match PAYER_WALLET_ADDRESS");
    process.exit(1);
  }

  const headers = {
    "Content-Type": "application/json",
    "X-KLAIM-Agent-Id": AGENT_ID!,
    Authorization: `Bearer ${AGENT_KEY!}`,
  };
  const url = `${BASE_URL}/api/v1/verify/age`;
  const body = JSON.stringify({ did: DID });

  console.log("Requesting verification...\n");
  const unpaid = await fetch(url, { method: "POST", headers, body });

  if (unpaid.status === 503) {
    const json = (await unpaid.json()) as { error?: string; missing?: string[] };
    if (json.error === "X402_NOT_CONFIGURED") fail(json.missing ?? ["PROVIDER_WALLET_ADDRESS"]);
  }
  if (unpaid.status !== 402) {
    console.error(`Expected 402, received ${unpaid.status}: ${await unpaid.text()}`);
    process.exit(1);
  }

  const core = new x402Client();
  const signer = {
    address: account.addr.toString(),
    async signTransactions(txns: Uint8Array[], indexesToSign?: number[]) {
      const targets = indexesToSign ?? txns.map((_, i) => i);
      return txns.map((txn, i) =>
        targets.includes(i) ? algosdk.signTransaction(algosdk.decodeUnsignedTransaction(txn), account.sk).blob : null,
      );
    },
  };
  core.register("algorand:*" as any, new ExactAvmScheme(signer, { algodUrl: ALGOD_URL }));
  const client = new x402HTTPClient(core);

  // x402 v2 carries the requirements in the PAYMENT-REQUIRED header.
  const challenge = client.getPaymentRequiredResponse((n) => unpaid.headers.get(n));
  const requirement = challenge.accepts[0]!;
  console.log("402 Payment Required ✓\n");
  console.log(`Network:\n${requirement.network}\n`);
  console.log(`Asset:\nUSDC (asset ${requirement.asset ?? "?"})\n`);
  console.log(`Amount:\n${requirement.maxAmountRequired ?? "?"} (atomic units)\n`);

  console.log("Signing payment...");
  const payload = await client.createPaymentPayload(challenge);
  const paymentHeaders = client.encodePaymentSignatureHeader(payload);
  console.log("Payment submitted...\n");

  const paid = await fetch(url, { method: "POST", headers: { ...headers, ...paymentHeaders }, body });
  const result = (await paid.json()) as {
    verified?: boolean;
    claim?: string;
    payment?: { status?: string; txId?: string; explorerUrl?: string };
    message?: string;
    error?: string;
  };

  if (paid.status !== 200 || !result.payment?.txId) {
    console.error(`Settlement failed (${paid.status}): ${result.message ?? result.error ?? JSON.stringify(result)}`);
    process.exit(1);
  }

  console.log("Settlement confirmed ✓\n");
  console.log(`Verification:\nAge > 18 ${result.verified ? "✓" : "✗"}\n`);
  console.log(`Transaction:\n${result.payment.txId}\n`);
  console.log(`Lora:\n${result.payment.explorerUrl ?? loraUrl(result.payment.txId)}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
