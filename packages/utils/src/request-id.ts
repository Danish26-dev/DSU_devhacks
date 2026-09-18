/**
 * Request-id generation for KLAIM V2.
 *
 * Verification requests use a human-readable, prefixed id (e.g. "REQ-AB12CD34")
 * to match the examples in docs/API_CONTRACT.md. Uses Web Crypto, available in
 * both Bun and Node runtimes.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Generate a random uppercase alphanumeric token of the given length. */
export function randomToken(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/** Generate a prefixed id, e.g. `prefixedId("REQ")` → "REQ-AB12CD34". */
export function prefixedId(prefix: string, length = 8): string {
  return `${prefix}-${randomToken(length)}`;
}

/** Convenience: a verification request id. */
export function newRequestId(): string {
  return prefixedId("REQ");
}
