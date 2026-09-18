/**
 * ProtocolPaymentAdapter — the REAL PaymentAdapter.
 *
 * Replaces MockPaymentAdapter by calling the protocol service (x402 +
 * GoPlausible + Algorand Testnet settlement) over HTTP, per
 * docs/PAYMENT_ADAPTER_CONTRACT.md. The protocol service's `/api/payments/settle`
 * is SYNCHRONOUS — it holds the connection while the on-chain settlement
 * confirms (a few seconds) and returns the final txId in one response, so this
 * adapter uses a generous request timeout (default 30s).
 *
 * A real `txId` only ever appears when settlement genuinely occurred; anything
 * else maps to a FAILED PaymentState. The state machine then blocks VERIFYING
 * unless payment.status === "SETTLED" (NO SETTLEMENT → NO VERIFICATION).
 *
 * Wired only when PROTOCOL_SERVICE_URL + INTERNAL_SERVICE_TOKEN are both set
 * (see index.ts). Otherwise the MockPaymentAdapter remains the default.
 */
import type { PaymentState } from "@klaim/types";

import type { PaymentAdapter, SettlementInput } from "./payment-adapter";

const DEFAULT_NETWORK = "algorand:testnet";
const DEFAULT_TIMEOUT_MS = 30_000;

interface ProtocolSettleResponse {
  requestId?: string;
  status?: string;
  txId?: string | null;
  network?: string | null;
  asset?: string | null;
  amount?: number | null;
  explorerUrl?: string | null;
  timestamp?: string | null;
  reason?: string;
  error?: string;
}

export interface ProtocolPaymentAdapterOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}

export class ProtocolPaymentAdapter implements PaymentAdapter {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(opts: ProtocolPaymentAdapterOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async settle(input: SettlementInput): Promise<PaymentState> {
    const now = () => new Date().toISOString();
    const failed = (amount: number): PaymentState => ({
      status: "FAILED",
      txId: null,
      network: DEFAULT_NETWORK,
      asset: "USDC",
      amount,
      explorerUrl: null,
      timestamp: now(),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let json: ProtocolSettleResponse;
    try {
      const res = await fetch(`${this.baseUrl}/api/payments/settle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          requestId: input.requestId,
          amountUsdc: input.amountUsdc,
          asset: "USDC",
          network: DEFAULT_NETWORK,
        }),
        signal: controller.signal,
      });
      json = (await res.json().catch(() => ({}))) as ProtocolSettleResponse;
    } catch {
      // Network error / timeout / abort — never fabricate a settlement.
      return failed(input.amountUsdc);
    } finally {
      clearTimeout(timer);
    }

    // Only a genuine SETTLED + txId counts. Everything else (FAILED,
    // X402_NOT_CONFIGURED, PAYER_NOT_CONFIGURED, 401, malformed) → FAILED.
    if (json.status !== "SETTLED" || !json.txId) {
      return failed(input.amountUsdc);
    }

    return {
      status: "SETTLED",
      txId: json.txId,
      network: json.network ?? DEFAULT_NETWORK,
      asset: "USDC",
      amount: typeof json.amount === "number" ? json.amount : input.amountUsdc,
      explorerUrl: json.explorerUrl ?? null,
      timestamp: json.timestamp ?? now(),
    };
  }
}
