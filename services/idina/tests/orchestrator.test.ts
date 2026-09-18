/**
 * Orchestration + harness gating tests (node:test).
 * Covers: harness behavior, correct order, and every failure gate, plus the
 * critical guarantee that Idina cannot fabricate a verified result.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { orchestrate, type OrchestrationInput } from "../src/orchestrator.ts";
import type {
  GenerateProofInput,
  GenerateProofOutput,
  GetUserCredentialsInput,
  GetUserCredentialsOutput,
  Harnesses,
  VerifyPaymentInput,
  VerifyPaymentOutput,
} from "../src/harnesses/types.ts";
import { DemoWalletCredentialHarness, DEMO_DID } from "../src/harnesses/wallet-credential.harness.ts";
import { ProtocolPaymentHarness } from "../src/harnesses/payment.harness.ts";
import { ServiceZkpHarness } from "../src/harnesses/zkp.harness.ts";

const CLAIMS = ["identity_verified", "age_over_18", "license_valid"] as const;

/** Spy harnesses to assert call order + gate behavior. */
function makeHarnesses(opts: {
  covered?: boolean;
  payment?: "SETTLED" | "FAILED";
  proof?: "PROOF_GENERATED" | "FAILED";
  order?: string[];
}): Harnesses {
  const order = opts.order ?? [];
  return {
    wallet: {
      getUserCredentials(i: GetUserCredentialsInput): Promise<GetUserCredentialsOutput> {
        order.push("wallet");
        return Promise.resolve({
          requestId: i.requestId,
          credentials: (opts.covered ?? true)
            ? [{ credentialRef: "cred-identity-001", type: "IdentityCredential", issuer: "demo", status: "VALID", availableClaims: [...CLAIMS] }]
            : [],
          allClaimsCovered: opts.covered ?? true,
        });
      },
    },
    payment: {
      verifyPaymentSettlement(i: VerifyPaymentInput): Promise<VerifyPaymentOutput> {
        order.push("payment");
        const settled = (opts.payment ?? "SETTLED") === "SETTLED";
        return Promise.resolve({
          requestId: i.requestId,
          status: opts.payment ?? "SETTLED",
          txId: settled ? "ALGTX123" : null,
          network: "algorand:testnet",
          asset: "USDC",
          amount: 0.01,
          explorerUrl: settled ? "https://lora/tx/ALGTX123" : null,
        });
      },
    },
    zkp: {
      generateVerificationProof(i: GenerateProofInput): Promise<GenerateProofOutput> {
        order.push("zkp");
        const proven = (opts.proof ?? "PROOF_GENERATED") === "PROOF_GENERATED";
        return Promise.resolve({
          requestId: i.requestId,
          status: opts.proof ?? "PROOF_GENERATED",
          proofId: proven ? "proof-123" : null,
          claims: proven ? { identity_verified: true, age_over_18: true, license_valid: true } : {},
          engine: proven ? "local" : null,
        });
      },
    },
  };
}

const baseInput = (over: Partial<OrchestrationInput> = {}): OrchestrationInput => ({
  requestId: "REQ-1",
  userDid: DEMO_DID,
  claims: [...CLAIMS],
  consent: "ALLOW",
  ...over,
});

test("1. credential harness returns valid demo credential metadata (no PII)", async () => {
  const h = new DemoWalletCredentialHarness();
  const out = await h.getUserCredentials({ requestId: "REQ-1", userDid: DEMO_DID, requestedClaims: [...CLAIMS] });
  assert.equal(out.allClaimsCovered, true);
  assert.equal(out.credentials.length, 2);
  const json = JSON.stringify(out);
  for (const pii of ["dob", "aadhaar", "name", "address", "licenseNumber"]) assert.ok(!json.toLowerCase().includes(pii));
});

test("2. payment harness refuses to report settlement without a real protocol service", async () => {
  const h = new ProtocolPaymentHarness(undefined, undefined);
  const out = await h.verifyPaymentSettlement({ requestId: "REQ-1" });
  assert.notEqual(out.status, "SETTLED");
  assert.equal(out.txId, null);
});

test("3. zkp harness refuses to generate a proof without a real zkp service", async () => {
  const h = new ServiceZkpHarness(undefined, undefined);
  const out = await h.generateVerificationProof({ requestId: "REQ-1", credentialRefs: ["c"], claims: [...CLAIMS], did: DEMO_DID });
  assert.equal(out.status, "FAILED");
  assert.equal(out.proofId, null);
});

test("4. Idina invokes harnesses in the correct order", async () => {
  const order: string[] = [];
  const res = await orchestrate(baseInput(), makeHarnesses({ order }));
  assert.equal(res.status, "COMPLETED");
  assert.deepEqual(order, ["wallet", "payment", "zkp"]);
});

test("5. Idina cannot fabricate a verified result (no proof → not COMPLETED, no txId leak)", async () => {
  const res = await orchestrate(baseInput(), makeHarnesses({ proof: "FAILED" }));
  assert.equal(res.status, "VERIFICATION_FAILED");
  assert.equal(res.proofId, null);
});

test("6. consent denial stops orchestration before any harness", async () => {
  const order: string[] = [];
  const res = await orchestrate(baseInput({ consent: "DENY" }), makeHarnesses({ order }));
  assert.equal(res.status, "DENIED");
  assert.deepEqual(order, []); // no harness touched
});

test("6b. missing consent (PENDING) also stops orchestration", async () => {
  const res = await orchestrate(baseInput({ consent: null }), makeHarnesses({}));
  assert.equal(res.status, "DENIED");
});

test("7. invalid / missing credentials stop orchestration (no payment attempted)", async () => {
  const order: string[] = [];
  const res = await orchestrate(baseInput(), makeHarnesses({ covered: false, order }));
  assert.equal(res.status, "CREDENTIAL_INVALID");
  assert.deepEqual(order, ["wallet"]); // stopped before payment
});

test("8. payment failure stops orchestration (no proof attempted) — NO SETTLEMENT → NO VERIFICATION", async () => {
  const order: string[] = [];
  const res = await orchestrate(baseInput(), makeHarnesses({ payment: "FAILED", order }));
  assert.equal(res.status, "PAYMENT_FAILED");
  assert.deepEqual(order, ["wallet", "payment"]); // zkp never reached
});

test("9. proof failure stops orchestration", async () => {
  const res = await orchestrate(baseInput(), makeHarnesses({ proof: "FAILED" }));
  assert.equal(res.status, "VERIFICATION_FAILED");
});

test("10. successful flow reaches COMPLETED with proofId + txId", async () => {
  const res = await orchestrate(baseInput(), makeHarnesses({}));
  assert.equal(res.status, "COMPLETED");
  assert.equal(res.proofId, "proof-123");
  assert.equal(res.txId, "ALGTX123");
  assert.deepEqual(res.claims, { identity_verified: true, age_over_18: true, license_valid: true });
});
