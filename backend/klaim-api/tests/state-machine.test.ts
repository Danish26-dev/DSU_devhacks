/**
 * Unit tests for the pure state machine: legal transitions, illegal
 * transitions, terminal states, and the settlement invariant.
 */
import { describe, expect, it } from "bun:test";

import type { PaymentState, VerificationRequestStatus } from "@klaim/types";
import {
  InvalidStateTransitionError,
  SettlementRequiredError,
  assertTransition,
  canTransition,
  isTerminal,
} from "../src/domain/verification-state-machine";

const SETTLED: PaymentState = {
  status: "SETTLED",
  txId: "MOCK-x",
  network: "algorand:testnet",
  asset: "USDC",
  amount: 0.01,
  explorerUrl: null,
  timestamp: "2026-01-01T00:00:00.000Z",
};

const UNSETTLED: PaymentState = {
  status: "REQUIRED",
  txId: null,
  network: null,
  asset: null,
  amount: null,
  explorerUrl: null,
  timestamp: null,
};

describe("state machine — legal transitions", () => {
  const legal: [VerificationRequestStatus, VerificationRequestStatus][] = [
    ["CREATED", "PENDING_CONSENT"],
    ["PENDING_CONSENT", "CONSENT_GRANTED"],
    ["PENDING_CONSENT", "DENIED"],
    ["CONSENT_GRANTED", "PAYMENT_REQUIRED"],
    ["PAYMENT_REQUIRED", "PAYMENT_SETTLED"],
    ["PAYMENT_REQUIRED", "PAYMENT_FAILED"],
    ["PAYMENT_SETTLED", "VERIFYING"],
    ["VERIFYING", "PROOF_GENERATED"],
    ["VERIFYING", "CREDENTIAL_INVALID"],
    ["VERIFYING", "VERIFICATION_FAILED"],
    ["PROOF_GENERATED", "VERIFIED"],
  ];
  for (const [from, to] of legal) {
    it(`allows ${from} → ${to}`, () => {
      expect(canTransition(from, to)).toBe(true);
    });
  }
});

describe("state machine — illegal transitions rejected", () => {
  const illegal: [VerificationRequestStatus, VerificationRequestStatus][] = [
    ["PENDING_CONSENT", "VERIFIED"],
    ["PAYMENT_REQUIRED", "VERIFIED"],
    ["CREATED", "VERIFIED"],
    ["CONSENT_GRANTED", "VERIFIED"],
    ["VERIFYING", "PAYMENT_SETTLED"],
    ["CREATED", "VERIFYING"],
    ["PENDING_CONSENT", "PAYMENT_SETTLED"],
    ["CONSENT_GRANTED", "VERIFYING"],
  ];
  for (const [from, to] of illegal) {
    it(`rejects ${from} → ${to}`, () => {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to, SETTLED)).toThrow(InvalidStateTransitionError);
    });
  }
});

describe("state machine — terminal states", () => {
  const terminals: VerificationRequestStatus[] = [
    "VERIFIED",
    "DENIED",
    "PAYMENT_FAILED",
    "CREDENTIAL_INVALID",
    "VERIFICATION_FAILED",
  ];
  for (const t of terminals) {
    it(`${t} is terminal and cannot transition further`, () => {
      expect(isTerminal(t)).toBe(true);
      // any target is illegal from a terminal state
      expect(() => assertTransition(t, "VERIFYING", SETTLED)).toThrow(InvalidStateTransitionError);
    });
  }
});

describe("state machine — settlement invariant (NO SETTLEMENT → NO VERIFICATION)", () => {
  it("blocks PAYMENT_SETTLED → VERIFYING when payment is not settled", () => {
    // structurally legal edge, but invariant must still reject it
    expect(canTransition("PAYMENT_SETTLED", "VERIFYING")).toBe(true);
    expect(() => assertTransition("PAYMENT_SETTLED", "VERIFYING", UNSETTLED)).toThrow(
      SettlementRequiredError,
    );
  });

  it("allows VERIFYING only with a settled payment", () => {
    expect(() => assertTransition("PAYMENT_SETTLED", "VERIFYING", SETTLED)).not.toThrow();
  });
});
