# IDINA.md — KLAIM Verification Orchestrator

## What Idina is
Idina is KLAIM's **verification orchestrator**: an internal microservice
(`services/idina`) that coordinates a verification request through three
controlled harnesses and reports a structured result. It is **not** the
verification authority — it decides *which harness to call*, and each harness
executes a deterministic, authorized operation. The LLM never manipulates
credentials, payments, proofs, or verification state, and never sees raw PII.

```
QuickDrop → KLAIM API → Idina → { wallet/credential · payment · zkp } → KLAIM API → result
```

## Google ADK architecture (TS runtime note)
The canonical Google ADK is Python-first. In this Node/TypeScript service the
idiomatic, faithful equivalent is **Gemini / Vertex AI function-calling** via
`@google/genai`, which realises the same principle: the agent is given EXACTLY
THREE function tools (one per harness) and a strict system instruction; it
chooses the sequence, the harnesses do the work.

**Trust boundary (airtight):** even in agent mode, the *authoritative* result is
produced by the deterministic orchestrator (`src/orchestrator.ts`) over the same
harnesses. The model orchestrates; it does not decide truth. So the LLM cannot
fabricate a `VERIFIED` result, invent a payment status, or skip a gate.

## The three harnesses (Idina's ONLY capabilities)
No HTTP/db/shell/fs/generic tools. No credential-/payment-/blockchain-writing.

1. **Wallet / Credential** (`get_user_credentials`) — inspects the authorized
   wallet, returns credential **metadata + claim availability** only. No raw
   PII (no name, DOB, Aadhaar, PAN, address, license number, document images).
   Hackathon backing: ONE **DEMO CREDENTIAL** fixture for
   `did:identipi:demo-user-001` — explicitly a demo credential, **not** a
   DigiLocker/government credential.
2. **Payment verification** (`verify_payment_settlement`) — REAL HTTP client to
   the protocol service (`POST {PROTOCOL_SERVICE_URL}/api/payments/settle`).
   Returns `SETTLED` only when the protocol service reports a genuine on-chain
   txId. Never fabricates settlement.
3. **ZKP generation** (`generate_verification_proof`) — REAL HTTP client to the
   ZKP service (`POST {ZKP_SERVICE_URL}/api/zkp/generate`). The LLM never
   generates proofs.

### Tool contracts
`get_user_credentials` → `{ requestId, credentials: [{ credentialRef, type, issuer, status, availableClaims }], allClaimsCovered }`
`verify_payment_settlement` → `{ requestId, status: SETTLED|FAILED|REQUIRED, txId, network, asset, amount, explorerUrl }`
`generate_verification_proof` → `{ requestId, status: PROOF_GENERATED|FAILED, proofId, claims, engine }`

## Orchestration flow + gates
```
consent granted → credentials valid → payment SETTLED → proof generated → COMPLETED
```
Each gate blocks the next. Failure states: `DENIED` (no/denied consent),
`CREDENTIAL_INVALID`, `PAYMENT_FAILED`, `VERIFICATION_FAILED`.

**NON-NEGOTIABLE:** NO SETTLEMENT → NO VERIFICATION. Proof generation is never
attempted unless the payment harness returns a real `SETTLED` txId. Enforced in
`orchestrator.ts` independently of the model.

## Consent requirement
Idina only orchestrates after `CONSENT_GRANTED`. Consent is read from the KLAIM
API (system of record) via `GET /api/verification-requests/:id` when
`KLAIM_API_URL` is set; a request body may carry an explicit `consent` decision
for standalone/demo runs. `DENY`/pending → orchestration stops before any
harness runs (no credential access, no proof).

## No PII to the LLM
Hard rule. The agent operates only on: requestId, DID/reference, requested
claims, credential metadata, validation/payment/proof status. Raw identity
documents never reach Gemini/Vertex.

## API
- `GET /health` → `{ status: "ok", service: "idina", mode }`
- `POST /orchestrate` → `{ requestId, status, claims, proofId, txId, runtime, steps }`
  - body: `{ requestId, userDid, claims[], consent?, amountUsdc? }`
- `GET /orchestrate/:requestId` → last result (debug/status)

## Deterministic fallback
`IDINA_MODE=deterministic` (default) runs the fixed orchestration; `agent` uses
Gemini via `@google/genai`. Agent mode transparently falls back to deterministic
when the SDK is absent or Gemini/Vertex is unconfigured/unreachable. **Both modes
use the same three harnesses and the same gates.**

## Local development
```
# deterministic (no Gemini needed):
PORT=8082 IDINA_MODE=deterministic node --experimental-strip-types services/idina/src/index.ts
curl localhost:8082/health
curl -XPOST localhost:8082/orchestrate -H 'content-type: application/json' \
  -d '{"requestId":"REQ-1","userDid":"did:identipi:demo-user-001","claims":["identity_verified","age_over_18","license_valid"],"consent":"ALLOW"}'
```
With `PROTOCOL_SERVICE_URL`/`ZKP_SERVICE_URL` unset, the payment/zkp harnesses
report unavailable → the run stops at `PAYMENT_FAILED` (correct: no real
settlement, no verification). Point them at live services for a full `COMPLETED`.

## Docker
`services/idina/Dockerfile` — Node 22 slim, non-root, binds `0.0.0.0:$PORT`, no
secrets baked in. Build from repo root:
```
docker build -f services/idina/Dockerfile -t klaim-idina .
docker run -p 8082:8082 -e PORT=8082 -e IDINA_MODE=deterministic klaim-idina
```

## Cloud Run deployment (prepared, not executed here)
Service name `klaim-idina`. Expose `/health` + `/orchestrate`. Use Vertex AI via
the Cloud Run **service identity** (no API key) and Secret Manager for
`INTERNAL_SERVICE_TOKEN`. Keep Idina **internal** (invoker restricted to the
KLAIM API service account) — do not expose it publicly.
```
gcloud run deploy klaim-idina \
  --source . --region <REGION> --port 8082 --no-allow-unauthenticated \
  --set-env-vars IDINA_MODE=agent,GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=<PROJ>,GOOGLE_CLOUD_LOCATION=<LOC>,GEMINI_MODEL=gemini-2.0-flash,KLAIM_API_URL=<URL>,PROTOCOL_SERVICE_URL=<URL>,ZKP_SERVICE_URL=<URL>
```
(Build context is the repo root so `packages/*` resolve; adjust `--source`/
Artifact Registry as needed.)

## Environment variables
See `services/idina/.env.example`: `PORT`, `IDINA_MODE`, `GOOGLE_CLOUD_PROJECT`,
`GOOGLE_CLOUD_LOCATION`, `GOOGLE_GENAI_USE_VERTEXAI`, `GEMINI_MODEL`,
`KLAIM_API_URL`, `PROTOCOL_SERVICE_URL`, `ZKP_SERVICE_URL`,
`INTERNAL_SERVICE_TOKEN`.

## Observability
Structured JSON logs: `requestId`, harness/step, transition, duration, outcome.
Field names matching name/DOB/Aadhaar/PAN/address/document/secret/key/token are
redacted. No raw PII, credential secrets, keys, or payment secrets are logged.
