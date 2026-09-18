/**
 * HTTP layer for the verification-request lifecycle. Translation only:
 * parse/validate input, call the service, map domain results/errors to HTTP.
 * No state-machine logic lives here.
 *
 * Endpoints:
 *   POST /api/verification-requests
 *   GET  /api/verification-requests/:id
 *   POST /api/verification-requests/:id/consent
 *   GET  /api/verification-requests/:id/result
 */
import type {
  ConsentResponse,
  CreateVerificationRequestResponse,
  GetVerificationRequestResponse,
} from "@klaim/contracts";
import { parseConsentBody, parseCreateVerificationRequest } from "@klaim/contracts";
import type { VerificationResult } from "@klaim/types";

import { ServiceError, type VerificationRequestService } from "../services/verification-request-service";
import { apiError } from "./errors";

/** Map a thrown ServiceError to the correct HTTP response. */
function serviceErrorToResponse(err: ServiceError): Response {
  switch (err.code) {
    case "NOT_FOUND":
      return apiError("NOT_FOUND", err.message);
    case "INVALID_STATE_TRANSITION":
      return apiError("INVALID_STATE_TRANSITION", err.message);
    case "SETTLEMENT_REQUIRED":
      return apiError("SETTLEMENT_REQUIRED", err.message);
    case "CONSENT_NOT_PENDING":
      return apiError("CONSENT_NOT_PENDING", err.message);
    default:
      return apiError("INTERNAL_ERROR", "Unexpected error");
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function handleCreateRequest(
  request: Request,
  service: VerificationRequestService,
): Promise<Response> {
  const body = await readJson(request);
  const parsed = parseCreateVerificationRequest(body);
  if (!parsed.ok) {
    // Distinguish an unsupported/invalid claim (422) from a malformed body (400).
    const isClaimError = /claim/i.test(parsed.error);
    return isClaimError
      ? apiError("UNSUPPORTED_CLAIM", parsed.error)
      : apiError("INVALID_REQUEST", parsed.error);
  }

  // Reject duplicate claims (contract validates membership, not uniqueness).
  const claims = parsed.value.claims;
  if (new Set(claims).size !== claims.length) {
    return apiError("INVALID_REQUEST", "Duplicate claims are not allowed");
  }

  const created = await service.create(parsed.value);
  const response: CreateVerificationRequestResponse = {
    requestId: created.requestId,
    status: created.status,
  };
  return Response.json(response, { status: 201 });
}

function toRequestResponse(found: {
  requestId: string;
  status: GetVerificationRequestResponse["status"];
  verifierId: string;
  userDid: string;
  claims: GetVerificationRequestResponse["claims"];
  consent: { decision: GetVerificationRequestResponse["consent"]["decision"]; at: string | null };
  payment: { status: GetVerificationRequestResponse["payment"]["status"]; txId: string | null };
  createdAt: string;
  updatedAt: string;
}): GetVerificationRequestResponse {
  return {
    requestId: found.requestId,
    status: found.status,
    verifierId: found.verifierId,
    userDid: found.userDid,
    claims: found.claims,
    consent: { decision: found.consent.decision, at: found.consent.at },
    payment: { status: found.payment.status, txId: found.payment.txId },
    createdAt: found.createdAt,
    updatedAt: found.updatedAt,
  };
}

export async function handleGetRequest(
  requestId: string,
  service: VerificationRequestService,
): Promise<Response> {
  const found = await service.get(requestId);
  if (!found) return apiError("NOT_FOUND", `Verification request ${requestId} not found`);
  return Response.json(toRequestResponse(found));
}

/**
 * GET /api/verification-requests?userDid=<did>&status=<status>
 *
 * Lists requests, optionally filtered by subject DID and/or status. This lets a
 * wallet discover verification requests awaiting its consent (a verifier such
 * as QuickDrop creates the request; the wallet polls this to find it).
 */
export async function handleListRequests(
  url: URL,
  service: VerificationRequestService,
): Promise<Response> {
  const userDid = url.searchParams.get("userDid") ?? undefined;
  const statusParam = url.searchParams.get("status") ?? undefined;

  const VALID_STATUSES = new Set([
    "CREATED", "PENDING_CONSENT", "CONSENT_GRANTED", "PAYMENT_REQUIRED", "PAYMENT_SETTLED",
    "VERIFYING", "PROOF_GENERATED", "VERIFIED", "DENIED", "PAYMENT_FAILED",
    "CREDENTIAL_INVALID", "VERIFICATION_FAILED",
  ]);
  if (statusParam && !VALID_STATUSES.has(statusParam)) {
    return apiError("INVALID_REQUEST", `Unknown status filter: ${statusParam}`);
  }

  const items = await service.list({
    userDid,
    status: statusParam as GetVerificationRequestResponse["status"] | undefined,
  });
  return Response.json({ requests: items.map(toRequestResponse) });
}

export async function handleConsent(
  requestId: string,
  request: Request,
  service: VerificationRequestService,
): Promise<Response> {
  const body = await readJson(request);
  const parsed = parseConsentBody(body);
  if (!parsed.ok) return apiError("INVALID_REQUEST", parsed.error);

  try {
    const updated = await service.applyConsent(requestId, parsed.value.decision);
    const response: ConsentResponse = { requestId: updated.requestId, status: updated.status };
    return Response.json(response);
  } catch (err) {
    if (err instanceof ServiceError) return serviceErrorToResponse(err);
    return apiError("INTERNAL_ERROR", "Unexpected error");
  }
}

export async function handleGetResult(
  requestId: string,
  service: VerificationRequestService,
): Promise<Response> {
  const found = await service.get(requestId);
  if (!found) return apiError("NOT_FOUND", `Verification request ${requestId} not found`);

  // Not yet verified — report the current status without a result payload.
  if (found.status !== "VERIFIED") {
    return Response.json({ requestId: found.requestId, status: found.status, result: null });
  }

  const result: VerificationResult = (await service.getResult(requestId))!;
  return Response.json({
    requestId: result.requestId,
    status: result.status,
    claims: result.claims,
    proofId: result.proof?.proofId ?? null,
    proof: result.proof,
    // Include payment so both UIs can render the real txId + explorer link.
    payment: result.payment,
  });
}
