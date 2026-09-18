/**
 * Lifecycle service tests: the full happy path, each failure branch, the
 * settlement invariant, and repository behavior via the service.
 */
import { beforeEach, describe, expect, it } from "bun:test";

import { ServiceError } from "../src/services/verification-request-service";
import { SettlementRequiredError } from "../src/domain/verification-state-machine";
import { makeService, VALID_CREATE } from "./helpers";

describe("lifecycle — creation", () => {
  it("creates a request in PENDING_CONSENT with a server-generated id", async () => {
    const { service } = makeService();
    const req = await service.create({ ...VALID_CREATE, claims: [...VALID_CREATE.claims] });
    expect(req.status).toBe("PENDING_CONSENT");
    expect(req.requestId).toMatch(/^REQ-[A-Z0-9]{8}$/);
    expect(req.payment.status).toBe("REQUIRED");
    expect(req.payment.txId).toBeNull();
  });
});

describe("lifecycle — consent", () => {
  it("ALLOW advances PENDING_CONSENT → CONSENT_GRANTED → PAYMENT_REQUIRED", async () => {
    const { service } = makeService();
    const req = await service.create({ ...VALID_CREATE, claims: [...VALID_CREATE.claims] });
    const after = await service.applyConsent(req.requestId, "ALLOW");
    expect(after.status).toBe("PAYMENT_REQUIRED");
    expect(after.consent.decision).toBe("ALLOW");
    expect(after.consent.at).not.toBeNull();
  });

  it("DENY moves PENDING_CONSENT → DENIED (terminal)", async () => {
    const { service } = makeService();
    const req = await service.create({ ...VALID_CREATE, claims: [...VALID_CREATE.claims] });
    const after = await service.applyConsent(req.requestId, "DENY");
    expect(after.status).toBe("DENIED");
  });

  it("rejects consent when not PENDING_CONSENT", async () => {
    const { service } = makeService();
    const req = await service.create({ ...VALID_CREATE, claims: [...VALID_CREATE.claims] });
    await service.applyConsent(req.requestId, "ALLOW");
    await expect(service.applyConsent(req.requestId, "ALLOW")).rejects.toThrow(ServiceError);
  });
});

describe("lifecycle — payment", () => {
  it("PAYMENT_REQUIRED → PAYMENT_SETTLED via mock adapter", async () => {
    const { service } = makeService();
    const req = await service.create({ ...VALID_CREATE, claims: [...VALID_CREATE.claims] });
    await service.applyConsent(req.requestId, "ALLOW");
    const settled = await service.settlePayment(req.requestId);
    expect(settled.status).toBe("PAYMENT_SETTLED");
    expect(settled.payment.status).toBe("SETTLED");
    expect(settled.payment.txId).toMatch(/^MOCK-/);
  });

  it("PAYMENT_REQUIRED → PAYMENT_FAILED when settlement fails", async () => {
    const { service } = makeService({ paymentShouldFail: true });
    const req = await service.create({ ...VALID_CREATE, claims: [...VALID_CREATE.claims] });
    await service.applyConsent(req.requestId, "ALLOW");
    const failed = await service.settlePayment(req.requestId);
    expect(failed.status).toBe("PAYMENT_FAILED");
    expect(failed.failure?.status).toBe("PAYMENT_FAILED");
  });
});

describe("lifecycle — verification + proof", () => {
  it("full happy path ends VERIFIED with a mock proof + claim results", async () => {
    const { service } = makeService();
    const req = await service.create({ ...VALID_CREATE, claims: [...VALID_CREATE.claims] });
    await service.applyConsent(req.requestId, "ALLOW");
    await service.settlePayment(req.requestId);
    const verified = await service.runVerification(req.requestId);

    expect(verified.status).toBe("VERIFIED");
    expect(verified.proof?.proofId).toMatch(/^mock-proof-/);
    expect(verified.claimResults).toEqual({
      identity_verified: true,
      age_over_18: true,
      license_valid: true,
    });

    const result = await service.getResult(req.requestId);
    expect(result?.status).toBe("VERIFIED");
    expect(result?.proof?.proofId).toMatch(/^mock-proof-/);
  });

  it("VERIFYING → CREDENTIAL_INVALID branch", async () => {
    const { service } = makeService({ verificationOutcome: "credential_invalid" });
    const req = await service.create({ ...VALID_CREATE, claims: [...VALID_CREATE.claims] });
    await service.applyConsent(req.requestId, "ALLOW");
    await service.settlePayment(req.requestId);
    const out = await service.runVerification(req.requestId);
    expect(out.status).toBe("CREDENTIAL_INVALID");
    expect(out.failure?.status).toBe("CREDENTIAL_INVALID");
  });

  it("VERIFYING → VERIFICATION_FAILED branch", async () => {
    const { service } = makeService({ verificationOutcome: "verification_failed" });
    const req = await service.create({ ...VALID_CREATE, claims: [...VALID_CREATE.claims] });
    await service.applyConsent(req.requestId, "ALLOW");
    await service.settlePayment(req.requestId);
    const out = await service.runVerification(req.requestId);
    expect(out.status).toBe("VERIFICATION_FAILED");
  });
});

describe("lifecycle — CRITICAL invariant: NO SETTLEMENT → NO VERIFICATION", () => {
  it("runVerification throws before settlement (PAYMENT_REQUIRED)", async () => {
    const { service } = makeService();
    const req = await service.create({ ...VALID_CREATE, claims: [...VALID_CREATE.claims] });
    await service.applyConsent(req.requestId, "ALLOW"); // now PAYMENT_REQUIRED, not settled
    await expect(service.runVerification(req.requestId)).rejects.toThrow(SettlementRequiredError);

    // and the request must NOT have advanced
    const still = await service.get(req.requestId);
    expect(still?.status).toBe("PAYMENT_REQUIRED");
  });

  it("runVerification throws right after creation (PENDING_CONSENT)", async () => {
    const { service } = makeService();
    const req = await service.create({ ...VALID_CREATE, claims: [...VALID_CREATE.claims] });
    await expect(service.runVerification(req.requestId)).rejects.toThrow();
    const still = await service.get(req.requestId);
    expect(still?.status).toBe("PENDING_CONSENT");
  });
});

describe("lifecycle — repository behavior", () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  it("create + get round-trip", async () => {
    const req = await ctx.service.create({ ...VALID_CREATE, claims: [...VALID_CREATE.claims] });
    const fetched = await ctx.service.get(req.requestId);
    expect(fetched?.requestId).toBe(req.requestId);
  });

  it("get unknown request returns null", async () => {
    expect(await ctx.service.get("REQ-UNKNOWN0")).toBeNull();
  });

  it("consent + result persist across reads", async () => {
    const req = await ctx.service.create({ ...VALID_CREATE, claims: [...VALID_CREATE.claims] });
    await ctx.service.applyConsent(req.requestId, "ALLOW");
    await ctx.service.settlePayment(req.requestId);
    await ctx.service.runVerification(req.requestId);

    const persisted = await ctx.repository.getById(req.requestId);
    expect(persisted?.consent.decision).toBe("ALLOW");
    const result = await ctx.repository.getResult(req.requestId);
    expect(result?.status).toBe("VERIFIED");
  });

  it("applyConsent on missing request throws NOT_FOUND", async () => {
    await expect(ctx.service.applyConsent("REQ-MISSING0", "ALLOW")).rejects.toThrow(ServiceError);
  });
});
