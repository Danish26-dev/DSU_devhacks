/**
 * KLAIM x402 Payment Client — server-side payment signing.
 *
 * Reuses the exact payment mechanism from scripts/test-x402.ts.
 * Used by the MCP layer to complete the x402 payment flow server-side
 * when an AI agent calls verify_human_age through MCP.
 *
 * Security: The payer mnemonic (PAYER_PRIVATE_KEY) stays server-side.
 * It is NEVER exposed to Claude, the frontend, or any API response.
 */
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import algosdk from "algosdk";

import { env } from "./env.server";

const ALGOD_URL = "https://testnet-api.algonode.cloud";

/** Whether the payer wallet is configured for server-side payment signing. */
export function payerConfigured(): boolean {
  return Boolean(env("PAYER_WALLET_ADDRESS") && env("PAYER_PRIVATE_KEY"));
}

/** Returns the list of missing payer env vars. */
export function missingPayerEnv(): string[] {
  const missing: string[] = [];
  if (!env("PAYER_WALLET_ADDRESS")) missing.push("PAYER_WALLET_ADDRESS");
  if (!env("PAYER_PRIVATE_KEY")) missing.push("PAYER_PRIVATE_KEY");
  return missing;
}

/**
 * Given a 402 response from the verification endpoint, sign and construct
 * the X-PAYMENT headers needed to retry with payment.
 *
 * Returns the payment headers as a Record<string, string> on success,
 * or throws with a descriptive error on failure.
 */
export async function signPaymentFromResponse(response: Response): Promise<Record<string, string>> {
  const mnemonic = env("PAYER_PRIVATE_KEY");
  const payerAddress = env("PAYER_WALLET_ADDRESS");

  if (!mnemonic || !payerAddress) {
    throw new Error("PAYER_PRIVATE_KEY or PAYER_WALLET_ADDRESS not configured");
  }

  const account = algosdk.mnemonicToSecretKey(mnemonic);
  if (account.addr.toString() !== payerAddress) {
    throw new Error("PAYER_PRIVATE_KEY does not match PAYER_WALLET_ADDRESS");
  }

  // Create x402 client with Algorand signer (same as test-x402.ts)
  const core = new x402Client();
  const signer = {
    address: account.addr.toString(),
    async signTransactions(txns: Uint8Array[], indexesToSign?: number[]) {
      const targets = indexesToSign ?? txns.map((_, i) => i);
      return txns.map((txn, i) =>
        targets.includes(i)
          ? algosdk.signTransaction(algosdk.decodeUnsignedTransaction(txn), account.sk).blob
          : null,
      );
    },
  };
  core.register("algorand:*" as any, new ExactAvmScheme(signer, { algodUrl: ALGOD_URL }));
  const client = new x402HTTPClient(core);

  // Parse the 402 payment requirements from the response headers
  const challenge = client.getPaymentRequiredResponse((name) => response.headers.get(name));

  console.log("[KLAIM x402] Payment requirements parsed");
  console.log("[KLAIM x402] Signing payment...");

  // Create and sign the payment payload
  const payload = await client.createPaymentPayload(challenge);
  const paymentHeaders = client.encodePaymentSignatureHeader(payload);

  console.log("[KLAIM x402] Payment signed successfully");

  return paymentHeaders;
}
