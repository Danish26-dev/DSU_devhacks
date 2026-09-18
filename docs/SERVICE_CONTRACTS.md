# SERVICE_CONTRACTS.md — KLAIM V2

> Internal, service-to-service HTTP contracts. Public/frontend API is in
> `API_CONTRACT.md`. All base URLs come from env — never hardcoded.
>
> ```
> KLAIM_API_URL   IDINA_URL   PROTOCOL_SERVICE_URL   ZKP_SERVICE_URL   MCP_SERVICE_URL
> ```
>
> Every internal endpoint requires internal auth (service token /
> Cloud Run identity / signed request). Schemas live in `packages/contracts`;
> status strings in `packages/types`.

---

## 0. Call graph

```
QuickDrop ─► klaim-api ─► idina ─► protocol   (payment + settlement)
                   ▲          │
                   │          ├─► zkp        (proof generation)
                   │          └─► (provider/credential verification — reused executor)
Identity Wallet ─► klaim-api (consent)
Claude ─► mcp ─► klaim-api ─► idina ─► (same lifecycle)
```

`klaim-api` is the only writer of authoritative state. Idina orchestrates but
reports transitions back to `klaim-api`; services return facts, not state.

---

## 1. KLAIM API ↔ Idina

### 1.1 klaim-api → idina: orchestrate
```
POST {IDINA_URL}/api/orchestrate
```
```json
{
  "requestId": "REQ-123",
  "userDid": "did:identipi:demo-user-001",
  "claims": ["identity_verified", "age_over_18", "license_valid"]
}
```
Response `202`:
```json
{ "requestId": "REQ-123", "accepted": true }
```
Idina drives the request through consent → payment → verification → proof,
reporting each transition back to klaim-api (1.2). Idina receives **no raw PII** —
only requestId, claim types, DID, and later credential references / statuses.

### 1.2 idina → klaim-api: report state transition
```
POST {KLAIM_API_URL}/api/verification-requests/:requestId/transition
```
```json
{ "from": "PAYMENT_SETTLED", "to": "VERIFYING", "detail": "provider verification started" }
```
klaim-api validates the transition against the canonical state machine and
**rejects illegal jumps** (e.g. `PAYMENT_REQUIRED → VERIFIED`). This is where
`NO SETTLEMENT → NO VERIFICATION` is enforced centrally: klaim-api refuses any
transition into `VERIFYING` unless it has recorded a confirmed `PAYMENT_SETTLED`
with a real txId from the protocol service.

### 1.3 idina → klaim-api: consent / payment status reads
Idina polls the public status endpoints (`GET /api/verification-requests/:id`)
or dedicated internal reads for consent and payment status.

### 1.4 Idina service API (implemented — services/idina)
```
GET  {IDINA_URL}/health          → { status:"ok", service:"idina", mode }
POST {IDINA_URL}/orchestrate     → orchestration result (below)
GET  {IDINA_URL}/orchestrate/:id → last result (debug)
```
`POST /orchestrate` request:
```json
{ "requestId":"REQ-123", "userDid":"did:identipi:demo-user-001",
  "claims":["identity_verified","age_over_18","license_valid"],
  "consent":"ALLOW", "amountUsdc":0.01 }
```
Response:
```json
{ "requestId":"REQ-123", "status":"COMPLETED",
  "claims":{"identity_verified":true,"age_over_18":true,"license_valid":true},
  "proofId":"proof-123", "txId":"ALG_TX_ID", "runtime":"agent", "steps":[...] }
```
`status` ∈ `COMPLETED | DENIED | CREDENTIAL_INVALID | PAYMENT_FAILED |
VERIFICATION_FAILED`. Idina uses exactly three harnesses (see docs/IDINA.md);
the payment harness calls §2 and the zkp harness calls §3. Idina never
fabricates settlement or proofs; NO SETTLEMENT → NO VERIFICATION is enforced in
the orchestrator independently of the LLM. Idina is internal (KLAIM API →
Idina, server-to-server) and is not exposed to browsers.

---

## 2. Idina ↔ Protocol

### 2.1 idina → protocol: begin payment
```
POST {PROTOCOL_SERVICE_URL}/api/payments/:requestId/begin
```
```json
{ "requestId": "REQ-123", "amount": 0.01, "asset": "USDC", "network": "algorand:testnet" }
```
Response: the x402 payment requirements (402 challenge material) OR
`X402_NOT_CONFIGURED` (503) when the provider wallet is unset. No fabrication.

### 2.2 protocol payment lifecycle
Reuses `x402.server.ts` (`requirePayment` → `settle`) and `x402-client.server.ts`
(server-side payer signing) unchanged in logic:
```
PAYMENT_REQUIRED → 402 → x402 payment → GoPlausible verify → GoPlausible settle
→ Algorand Testnet confirmation → PAYMENT_SETTLED (real txId) | PAYMENT_FAILED
```

### 2.3 idina/klaim-api → protocol: payment status
```
GET {PROTOCOL_SERVICE_URL}/api/payments/:requestId/status
```
Response:
```json
{
  "requestId": "REQ-123",
  "status": "SETTLED",
  "txId": "REAL_ALGORAND_TX_ID",
  "network": "algorand:testnet",
  "asset": "USDC",
  "amount": 0.01,
  "explorerUrl": "https://lora.algokit.io/testnet/transaction/REAL_ALGORAND_TX_ID",
  "timestamp": "2026-09-18T10:00:20.000Z"
}
```
`status` ∈ `REQUIRED | SETTLED | FAILED`. `txId` null unless a real settlement
occurred. Private keys (payer mnemonic, `PAYER_PRIVATE_KEY`) never leave protocol.

---

## 3. Idina ↔ ZKP

### 3.1 idina → zkp: generate proof
```
POST {ZKP_SERVICE_URL}/api/zkp/generate
```
```json
{
  "requestId": "REQ-123",
  "claims": ["identity_verified", "age_over_18", "license_valid"],
  "credentialRefs": ["cred-identity-001", "cred-license-001"]
}
```
Response:
```json
{
  "requestId": "REQ-123",
  "status": "PROOF_GENERATED",
  "claims": { "identity_verified": true, "age_over_18": true, "license_valid": true },
  "proofId": "proof-123"
}
```
Engine `local` (deterministic over derived claims) by default; `midnight` when
`MIDNIGHT_PROVER_URL` is set. Proof objects carry `engine` and are **never**
labelled production Midnight unless the Midnight prover actually ran. Only claim
identifiers and credential references cross this boundary — no document content.

### 3.2 Credential verification (reused executor)
Idina invokes the existing verification executor
(`provider-agent.server.ts` — `check_did`, `check_credential`, `check_claim`,
`generate_zk_proof`, `verify_zk_proof`) as a tool/service. This executor is
**not** Idina and is not renamed to Idina. It runs behind `PAYMENT_SETTLED`.

---

## 4. MCP ↔ KLAIM API

```
Claude → mcp → klaim-api → idina → same lifecycle
```
- MCP authenticates the agent (`X-KLAIM-Agent-Id` + `Bearer klm_...`) exactly as
  today, then calls klaim-api on the agent's behalf.
- Tools: `verify_age`, `get_verification_status` (min); `verify_identity`,
  `verify_license` (optional); `verify_human_age` retained for compatibility.
- `verify_*` tools create/advance a verification request through klaim-api.
  `get_verification_status` reads `GET /api/verification-requests/:id`.
- MCP holds **no** payment, settlement, or ZK logic — it is a thin interface.
  (Today's `/api/public/mcp` route both bridges to `handleVerifyAge` and signs
  payment server-side; in V2 that payment concern moves behind protocol/klaim-api.)

---

## 5. Internal auth

| Direction | Mechanism |
|---|---|
| Verifier → klaim-api / mcp | `klm_` agent key (SHA-256 at rest, rotate/revoke) — **unchanged** |
| klaim-api ↔ idina ↔ protocol ↔ zkp | internal service token (env `INTERNAL_SERVICE_TOKEN`) or Cloud Run service identity |
| Wallet → klaim-api | request-scoped (requestId + session/DID) |

No secrets are exposed to the frontend, to Claude, or in any API response.

---

## 6. Contract ownership

- `packages/types` and `packages/contracts` are shared and versioned together.
- A breaking schema change requires updating both packages and every consumer in
  the same change. Services must not fork private copies of these schemas.
```