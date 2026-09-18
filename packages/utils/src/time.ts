/** Current timestamp as an ISO-8601 string. Centralized so timestamps are consistent. */
export function nowIso(): string {
  return new Date().toISOString();
}
