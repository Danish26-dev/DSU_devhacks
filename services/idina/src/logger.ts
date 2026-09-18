/**
 * Structured, PII-safe logging. Logs requestId, harness/step, transition,
 * duration and outcome — NEVER raw identity documents, names, DOB, addresses,
 * credential secrets, keys, or payment secrets.
 */
type Fields = Record<string, string | number | boolean | null | undefined>;

const REDACT = /(name|dob|birth|aadhaar|pan|address|document|mnemonic|privateKey|secret|token)/i;

function safe(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = REDACT.test(k) ? "[redacted]" : v;
  }
  return out;
}

export const log = {
  info(event: string, fields: Fields = {}) {
    console.log(JSON.stringify({ level: "info", svc: "idina", event, ...safe(fields) }));
  },
  warn(event: string, fields: Fields = {}) {
    console.warn(JSON.stringify({ level: "warn", svc: "idina", event, ...safe(fields) }));
  },
  error(event: string, fields: Fields = {}) {
    console.error(JSON.stringify({ level: "error", svc: "idina", event, ...safe(fields) }));
  },
};
