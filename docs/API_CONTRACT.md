# API_CONTRACT.md — KLAIM V2

> Public + frontend-facing API of `backend/klaim-api`. Service-to-service
> (internal) contracts are in `SERVICE_CONTRACTS.md`. Existing V1 endpoints that
> remain live during migration are listed in §5.

Request/response shapes and lightweight validators live in `packages/contracts`
(dependency-free in Phase 2; may move to `zod` later). Status strings come from
`packages/types`.

> **Phase 2 status:** the four core `/api/verification-requests` endpoints below
> are **implemented** in `backend/klaim-api`. Payment settlement and verification
> currently run through MOCK/development adapters exercised via dev-only trigger
> endpoints (`POST /api/dev/verification-requests/:id/{settle,verify}`, gated by
> `KLAIM_DEV_ADAPTERS=true`). Real x402/Algorand/ZKP/Idina arrive in later phases.
> The canonical transition rules and the settlement invariant live in
> `docs/STATE_MACHINE.md`.

---

## 1. Shared vocabulary (`packages/types`)

```ts
type ClaimType = "identity_verified" | "age_over_18" | "license_valid";

type VerificationStatus =
  | "CREATED" | "PENDING_CONSENT" | "CONSENT_GRANTED"
  | "PAYMENT_REQUIRED" | "PAYMENT_SETTLED"
  | "VERIFYING" | "PROOF_GENERATED" | "VERIFIED"
  // failures:
  | "DENIED" | "PAYMENT_FAILED" | "CREDENTIAL_INVALID" | "VERIFICATION_FAILED";

type ConsentDecision = "ALLOW" | "DENY";
type PaymentStatus   = "REQUIRED" | "SETTLED" | "FAILED";
```

---

## 2. Core verification-request API

### 2.1 Create request
```
POST /api/verification-requests
```
Request:
```json
{
  "verifierId": "quickdrop-demo",
  "userDid": "did:identipi:demo-user-001",
  "claims": ["identity_verified", "age_over_18", "license_valid"]
}
```
Response `201`:
```json
{ "requestId": "REQ-123", "status": "PENDING_CONSENT" }
```
Notes: `verifierId` maps to an authenticated agent/verifier. `claims` must be a
non-empty subset of `ClaimType`. Creating the request moves it
`CREATED → PENDING_CONSENT`.

### 2.2 Get request status
```
GET /api/verification-requests/:requestId
```
Response `200`:
```json
{
  "requestId": "REQ-123",
  "status": "PAYMENT_REQUIRED",
  "verifierId": "quickdrop-demo",
  "userDid": "did:identipi:demo-user-001",
  "claims": ["identity_verified", "age_over_18", "license_valid"],
  "consent": { "decision": null, "at": null },
  "payment": { "status": "REQUIRED", "txId": null },
  "createdAt": "2026-09-18T10:00:00.000Z",
  "updatedAt": "2026-09-18T10:00:05.000Z"
}
```
`404` if unknown. This is the endpoint QuickDrop and the Wallet poll.

### 2.3 Consent (Identity Wallet)
```
POST /api/verification-requests/:requestId/consent
```
Request:
```json
{ "decision": "ALLOW" }
```
Response `200`:
```json
{ "requestId": "REQ-123", "status": "CONSENT_GRANTED" }
```
`DENY` → `{ "status": "DENIED" }` (terminal). Consent is only accepted while the
request is `PENDING_CONSENT`; otherwise `409`.

### 2.4 Get result
```
GET /api/verification-requests/:requestId/result
```
Response `200` (only meaningful once `VERIFIED`):
```json
{
  "requestId": "REQ-123",
  "status": "VERIFIED",
  "claims": { "identity_verified": true, "age_over_18": true, "license_valid": true },
  "proofId": "proof-123",
  "proof": { "engine": "local", "notDisclosed": ["date_of_birth", "aadhaar_number", "pan_number", "address", "document_image"] },
  "payment": {
    "status": "SETTLED",
    "txId": "REAL_ALGORAND_TX_ID",
    "network": "algorand:testnet",
    "asset": "USDC",
    "amount": 0.01,
    "explorerUrl": "https://lora.algokit.io/testnet/transaction/REAL_ALGORAND_TX_ID",
    "timestamp": "2026-09-18T10:00:20.000Z"
  }
}
```
Before `VERIFIED`, returns the current `status` and `result: null`. The response
**never** contains raw identity documents or PII. `txId` is `null` until a real
settlement returns one — never fabricated.

---

## 3. Auth & CORS

- Verifier calls (QuickDrop creating requests, MCP) authenticate with the
  existing agent credential: `X-KLAIM-Agent-Id: agent_...` +
  `Authorization: Bearer klm_...`. Keys are SHA-256-hashed at rest, rotatable,
  revocable.
- Wallet consent calls are scoped to a `requestId` (+ a wallet session/DID check
  in a later phase).
- CORS: `klaim-api` allows the QuickDrop origin and the Identity Wallet origin
  from an env allowlist. No unrestricted production CORS.

---

## 4. Error shape

```json
{ "error": "invalid_request", "message": "Human-readable explanation" }
```
Common codes: `unauthorized` (401), `invalid_request` (400), `not_found` (404),
`conflict` (409, illegal transition), `spend_limit_exceeded` (403),
`X402_NOT_CONFIGURED` (503). Payment-required uses HTTP `402` with x402 headers.

---

## 5. Existing V1 endpoints (preserved during migration — see BACKWARD COMPATIBILITY)

These remain live and unchanged so nothing breaks while V2 is built. They keep
their original spelling and single-claim behavior.

| Endpoint | Method | Notes |
|---|---|---|
| `/api/v1/verify/age` | POST | x402-protected `age_over_18`. `handleVerifyAge`. The proven settlement→verification core is reused by V2 behind `PAYMENT_SETTLED → VERIFYING`. |
| `/api/public/mcp` | POST | MCP JSON-RPC; tool `verify_human_age`. |
| `/api/v1/agents`, `/api/v1/agents/:id` | GET/POST | Agent CRUD, key rotate/revoke. |
| `/api/v1/credentials` | GET/DELETE | Credential references. |
| `/api/v1/digilocker` | POST | DigiLocker authorize/callback. |
| `/api/v1/integrations` | GET | Integration statuses + MCP descriptor. |
| `/api/v1/transactions` | GET | Transaction history. |
| `/api/health` | GET | Health/readiness. |

Old endpoints are removed only after V2 is proven and nothing depends on them.

---

## 6. Claim-spelling policy

- New V2 contract: **`license_valid`** (American).
- Legacy `types.ts` / old endpoints keep **`licence_valid`** where already used.
- `packages/contracts` performs the mapping at the boundary; the new contract is
  never contaminated with the old spelling.
```