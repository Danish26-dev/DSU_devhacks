/**
 * PaymentAdapter — the seam the future services/protocol (x402 + GoPlausible +
 * Algorand) plugs into. The lifecycle service depends on THIS interface, never
 * on a concrete payment implementation, so the mock can be swapped for the real
 * protocol service without changing the lifecycle.
 *
 * Phase 2 ships a MOCK/DEVELOPMENT implementation only. No x402, no Algorand.
 */
import type { PaymentState } from "@klaim/types";

export interface SettlementInput {
  requestId: string;
  amountUsdc: number;
}

export interface PaymentAdapter {
  /**
   * Attempt to settle payment for a request. Returns the resulting PaymentState.
   * The REAL adapter performs an on-chain settlement and returns a genuine txId;
   * it must NEVER fabricate one.
   */
  settle(input: SettlementInput): Promise<PaymentState>;
}

/**
 * MOCK / DEVELOPMENT ONLY payment adapter.
 *
 * Simulates a successful settlement so the state machine can be exercised
 * end-to-end before services/protocol exists. The txId is explicitly prefixed
 * `MOCK-` so nothing downstream can mistake it for a real Algorand transaction.
 * This adapter must not ship to production.
 */
export class MockPaymentAdapter implements PaymentAdapter {
  constructor(private readonly opts: { shouldFail?: boolean } = {}) {}

  settle(input: SettlementInput): Promise<PaymentState> {
    const now = new Date().toISOString();
    if (this.opts.shouldFail) {
      return Promise.resolve({
        status: "FAILED",
        txId: null,
        network: "algorand:testnet",
        asset: "USDC",
        amount: input.amountUsdc,
        explorerUrl: null,
        timestamp: now,
      });
    }
    const txId = `MOCK-${input.requestId}`;
    return Promise.resolve({
      status: "SETTLED",
      txId,
      network: "algorand:testnet",
      asset: "USDC",
      amount: input.amountUsdc,
      // Deliberately null: no real explorer entry exists for a mock settlement.
      explorerUrl: null,
      timestamp: now,
    });
  }
}
