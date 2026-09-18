/**
 * Consistent API error responses. Stable codes, no stack traces leaked.
 *
 * Shape:
 *   { "error": { "code": "INVALID_STATE_TRANSITION", "message": "..." } }
 */
export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "INVALID_STATE_TRANSITION"
  | "SETTLEMENT_REQUIRED"
  | "CONSENT_NOT_PENDING"
  | "UNSUPPORTED_CLAIM"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  INVALID_STATE_TRANSITION: 409,
  SETTLEMENT_REQUIRED: 409,
  CONSENT_NOT_PENDING: 409,
  UNSUPPORTED_CLAIM: 422,
  METHOD_NOT_ALLOWED: 405,
  INTERNAL_ERROR: 500,
};

export function apiError(code: ApiErrorCode, message: string): Response {
  return Response.json({ error: { code, message } }, { status: STATUS_BY_CODE[code] });
}
