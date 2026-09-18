/**
 * Shared test helpers for the verification lifecycle tests.
 */
import { MockPaymentAdapter } from "../src/adapters/payment-adapter";
import { MockVerificationAdapter } from "../src/adapters/verification-adapter";
import { createApp } from "../src/app";
import type { KlaimApiConfig } from "../src/config";
import { InMemoryVerificationRepository } from "../src/repositories/in-memory-verification-repository";
import { VerificationRequestService } from "../src/services/verification-request-service";

export function testConfig(overrides: Partial<KlaimApiConfig> = {}): KlaimApiConfig {
  return {
    serviceName: "klaim-api",
    port: 8080,
    allowedOrigins: [],
    devAdapters: true,
    protocolServiceUrl: undefined,
    internalServiceToken: undefined,
    ...overrides,
  };
}

export function makeService(opts: {
  paymentShouldFail?: boolean;
  verificationOutcome?: "proven" | "credential_invalid" | "verification_failed";
} = {}) {
  const repository = new InMemoryVerificationRepository();
  const service = new VerificationRequestService({
    repository,
    paymentAdapter: new MockPaymentAdapter({ shouldFail: opts.paymentShouldFail ?? false }),
    verificationAdapter: new MockVerificationAdapter(
      opts.verificationOutcome ? { outcome: opts.verificationOutcome } : {},
    ),
  });
  return { repository, service };
}

export function makeApp(config: KlaimApiConfig = testConfig()) {
  return createApp({
    config,
    repository: new InMemoryVerificationRepository(),
    paymentAdapter: new MockPaymentAdapter(),
    verificationAdapter: new MockVerificationAdapter(),
  });
}

export const VALID_CREATE = {
  verifierId: "quickdrop-demo",
  userDid: "did:identipi:demo-user-001",
  claims: ["identity_verified", "age_over_18", "license_valid"] as const,
};
