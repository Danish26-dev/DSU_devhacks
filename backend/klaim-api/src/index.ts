/**
 * klaim-api entry point.
 *
 * Wires config + the in-memory repository + the Phase 2 MOCK adapters into the
 * app and starts an HTTP server. Cloud Run provides PORT.
 *
 * NOTE: the payment/verification adapters here are MOCK/DEVELOPMENT
 * implementations. They are replaced by services/protocol and services/idina +
 * services/zkp in later phases without changing the app or lifecycle service.
 * The dev lifecycle trigger endpoints only mount when KLAIM_DEV_ADAPTERS=true.
 */
import { MockPaymentAdapter } from "./adapters/payment-adapter";
import { ProtocolPaymentAdapter } from "./adapters/protocol-payment-adapter";
import { MockVerificationAdapter } from "./adapters/verification-adapter";
import { ProtocolVerificationAdapter } from "./adapters/protocol-verification-adapter";
import type { PaymentAdapter } from "./adapters/payment-adapter";
import type { VerificationAdapter } from "./adapters/verification-adapter";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { InMemoryVerificationRepository } from "./repositories/in-memory-verification-repository";

const config = loadConfig();

// Use the real protocol service when it's configured; otherwise fall back to
// the mock so local dev keeps working. (docs/PAYMENT_ADAPTER_CONTRACT.md)
const usingRealSettlement = Boolean(config.protocolServiceUrl && config.internalServiceToken);
const paymentAdapter: PaymentAdapter =
  usingRealSettlement
    ? new ProtocolPaymentAdapter({
        baseUrl: config.protocolServiceUrl!,
        token: config.internalServiceToken!,
      })
    : new MockPaymentAdapter();

// Real ZKP via the protocol service when ZKP_SERVICE_URL + token are set;
// otherwise the mock verification adapter.
const usingRealZkp = Boolean(config.zkpServiceUrl && config.internalServiceToken);
const verificationAdapter: VerificationAdapter =
  usingRealZkp
    ? new ProtocolVerificationAdapter({
        baseUrl: config.zkpServiceUrl!,
        token: config.internalServiceToken!,
      })
    : new MockVerificationAdapter();

const handle = createApp({
  config,
  repository: new InMemoryVerificationRepository(),
  paymentAdapter,
  verificationAdapter,
});

const server = Bun.serve({
  port: config.port,
  fetch: handle,
});

console.log(`[klaim-api] listening on http://localhost:${server.port}`);
console.log(
  usingRealSettlement
    ? `[klaim-api] settlement: ProtocolPaymentAdapter → ${config.protocolServiceUrl}`
    : "[klaim-api] settlement: MockPaymentAdapter (set PROTOCOL_SERVICE_URL + INTERNAL_SERVICE_TOKEN for real settlement)",
);
console.log(
  usingRealZkp
    ? `[klaim-api] verification: ProtocolVerificationAdapter → ${config.zkpServiceUrl}`
    : "[klaim-api] verification: MockVerificationAdapter (set ZKP_SERVICE_URL + INTERNAL_SERVICE_TOKEN for real proofs)",
);
if (config.devAdapters) {
  console.warn("[klaim-api] KLAIM_DEV_ADAPTERS=true — mock settle/verify endpoints are ENABLED (dev only)");
}
