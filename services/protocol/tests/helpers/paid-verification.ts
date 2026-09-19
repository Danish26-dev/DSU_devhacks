/**
 * Shared payment helper for the integration test. Signs a real Algorand
 * Testnet payment with the official x402 client — never a mock.
 */
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactAvmScheme } from "@x402/avm/exact/client";
import { ALGORAND_TESTNET_CAIP2 } from "@x402/avm";
import algosdk from "algosdk";

export interface PaidVerificationResult {
  status: number;
  body: {
    verified?: boolean;
    claim?: string;
    payment?: { status?: string; txId?: string; explorerUrl?: string; network?: string };
  };
}

export async function runPaidVerification(input: {
  baseUrl: string;
  headers: Record<string, string>;
  did: string;
}): Promise<PaidVerificationResult> {
  const account = algosdk.mnemonicToSecretKey(process.env["PAYER_PRIVATE_KEY"]!);
  const url = `${input.baseUrl}/api/v1/verify/age`;
  const body = JSON.stringify({ did: input.did });

  const unpaid = await fetch(url, { method: "POST", headers: input.headers, body });
  if (unpaid.status !== 402) throw new Error(`Expected 402, received ${unpaid.status}`);

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
  core.register(
    ALGORAND_TESTNET_CAIP2,
    new ExactAvmScheme(signer, { algodUrl: process.env["ALGOD_URL"] ?? "https://testnet-api.algonode.cloud" }),
  );
  const client = new x402HTTPClient(core);

  const challenge = client.getPaymentRequiredResponse((n) => unpaid.headers.get(n));
  const payload = await client.createPaymentPayload(challenge);
  const paymentHeaders = client.encodePaymentSignatureHeader(payload);

  const paid = await fetch(url, {
    method: "POST",
    headers: { ...input.headers, ...paymentHeaders },
    body,
  });
  return { status: paid.status, body: (await paid.json()) as PaidVerificationResult["body"] };
}
