/**
 * HARNESS 2 — Payment verification.
 *
 * A REAL HTTP client to the KLAIM protocol service (x402 + GoPlausible +
 * Algorand settlement), per docs/PAYMENT_ADAPTER_CONTRACT.md. It NEVER fabricates
 * a settlement: the harness returns SETTLED only when the protocol service
 * reports a genuine on-chain txId. If the protocol service is not configured or
 * unreachable, it returns FAILED — the agent cannot claim payment succeeded.
 *
 * Enforces (with the orchestrator) the invariant: NO SETTLEMENT → NO VERIFICATION.
 */
import type { PaymentHarness, VerifyPaymentInput, VerifyPaymentOutput } from "./types.ts";

const DEFAULT_NETWORK = "algorand:testnet";
const TIMEOUT_MS = 30_000;

interface ProtocolResponse {
  status?: string;
  txId?: string | null;
  network?: string | null;
  asset?: string | null;
  amount?: number | null;
  explorerUrl?: string | null;
}

export class ProtocolPaymentHarness implements PaymentHarness {
  private readonly baseUrl: string | undefined;
  private readonly token: string | undefined;

  constructor(baseUrl: string | undefined, token: string | undefined) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async verifyPaymentSettlement(input: VerifyPaymentInput): Promise<VerifyPaymentOutput> {
    const failed = (status: "FAILED" | "REQUIRED" = "FAILED"): VerifyPaymentOutput => ({
      requestId: input.requestId,
      status,
      txId: null,
      network: DEFAULT_NETWORK,
      asset: "USDC",
      amount: input.amountUsdc ?? null,
      explorerUrl: null,
    });

    // Not wired to a real protocol service → cannot confirm settlement.
    if (!this.baseUrl) return failed("REQUIRED");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let json: ProtocolResponse;
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/payments/settle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          requestId: input.requestId,
          amountUsdc: input.amountUsdc ?? 0.01,
          asset: "USDC",
          network: DEFAULT_NETWORK,
        }),
        signal: controller.signal,
      });
      json = (await res.json().catch(() => ({}))) as ProtocolResponse;
    } catch {
      return failed();
    } finally {
      clearTimeout(timer);
    }

    if (json.status !== "SETTLED" || !json.txId) return failed();

    return {
      requestId: input.requestId,
      status: "SETTLED",
      txId: json.txId,
      network: json.network ?? DEFAULT_NETWORK,
      asset: "USDC",
      amount: typeof json.amount === "number" ? json.amount : (input.amountUsdc ?? null),
      explorerUrl: json.explorerUrl ?? null,
    };
  }
}
