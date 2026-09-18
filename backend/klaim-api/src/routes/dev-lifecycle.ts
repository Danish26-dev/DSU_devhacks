/**
 * DEVELOPMENT / TEST-ONLY lifecycle triggers.
 *
 * These endpoints let a developer or test drive the mock settlement and mock
 * verification transitions until services/protocol and services/idina + ZKP
 * exist. They are gated behind the `KLAIM_DEV_ADAPTERS` config flag and are NOT
 * mounted in production. They deliberately expose NO way to inject a payment
 * status, txId, or claim result from the client — they only invoke the
 * server-side mock adapters, which still pass through the state machine and the
 * NO SETTLEMENT → NO VERIFICATION invariant.
 *
 *   POST /api/dev/verification-requests/:id/settle   (mock PAYMENT_SETTLED)
 *   POST /api/dev/verification-requests/:id/verify    (mock VERIFYING→VERIFIED)
 */
import { ServiceError, type VerificationRequestService } from "../services/verification-request-service";
import { apiError } from "./errors";

function toResponse(err: unknown): Response {
  if (err instanceof ServiceError) {
    const status =
      err.code === "NOT_FOUND"
        ? "NOT_FOUND"
        : err.code === "CONSENT_NOT_PENDING"
          ? "CONSENT_NOT_PENDING"
          : err.code === "SETTLEMENT_REQUIRED"
            ? "SETTLEMENT_REQUIRED"
            : "INVALID_STATE_TRANSITION";
    return apiError(status, err.message);
  }
  // The state machine throws its own typed errors; surface them as 409.
  if (err instanceof Error && "code" in err) {
    const code = (err as { code: string }).code;
    if (code === "SETTLEMENT_REQUIRED") return apiError("SETTLEMENT_REQUIRED", err.message);
    if (code === "INVALID_STATE_TRANSITION") return apiError("INVALID_STATE_TRANSITION", err.message);
  }
  return apiError("INTERNAL_ERROR", "Unexpected error");
}

export async function handleDevSettle(
  requestId: string,
  service: VerificationRequestService,
): Promise<Response> {
  try {
    const updated = await service.settlePayment(requestId);
    return Response.json({ requestId: updated.requestId, status: updated.status });
  } catch (err) {
    return toResponse(err);
  }
}

export async function handleDevVerify(
  requestId: string,
  service: VerificationRequestService,
): Promise<Response> {
  try {
    const updated = await service.runVerification(requestId);
    return Response.json({ requestId: updated.requestId, status: updated.status });
  } catch (err) {
    return toResponse(err);
  }
}
