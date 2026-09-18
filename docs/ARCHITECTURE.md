# ARCHITECTURE.md — KLAIM V2

> Target service-oriented architecture. This is the destination; the current
> monolith is described in `EXISTING_SYSTEM.md` and the path between them in
> `MIGRATION_PLAN.md`.

---

## 1. Product

KLAIM is a privacy-first identity verification platform/API. Applications,
organizations, backend systems and AI agents verify **specific human claims**
without receiving the user's underlying identity documents.

Primary demo verifier: **QuickDrop** (fictional delivery/gig platform) requesting
`identity_verified`, `age_over_18`, `license_valid`. The user consents in the
**Identity Wallet**; KLAIM verifies, x402 settles on Algorand Testnet, a
privacy-preserving proof is produced, and QuickDrop receives **only** the claim
booleans + proof/payment metadata — never raw documents.

---

## 2. Three layers

```
FRONTEND            BACKEND                 SERVICES
────────            ───────                 ────────
quickdrop     ─┐                        ┌─  idina      (orchestrator)
identity-wallet├──►  klaim-api  ───────►├─  protocol   (x402 + Algorand)
               ┘   (source of truth)    ├─  zkp        (proofs)
                                        └─  mcp         (AI-agent interface)
```

- **Frontend** renders backend state. It never decides verification.
- **Backend (`klaim-api`)** owns the verification-request lifecycle, request IDs,
  the state machine, consent state, payment state, results, and audit. It is the
  single source of truth and the only coordination point.
- **Services** perform specialized functions and are called by the backend
  (and by Idina) over HTTP. They never bypass the backend's state machine.

**Code boundaries are hard. Deployment may be consolidated** (see `DEPLOYMENT.md`).

---

## 3. Repository layout (target)

```
KLAIM/
├── frontend/
│   ├── quickdrop/          (Monika)  Vite React — verifier client
│   └── identity-wallet/    (Danish)  Vite React PWA — user consent
├── backend/
│   └── klaim-api/          (Danish)  TanStack Start — REST + state machine + source of truth
├── services/
│   ├── idina/              (Danish)  orchestrator (Google ADK/Vertex + deterministic fallback)
│   ├── protocol/           (Omkar)   x402, GoPlausible, Algorand, USDC settlement
│   ├── zkp/                (Omkar)   proof generation (local engine + Midnight boundary)
│   └── mcp/                (Omkar)   MCP server + tools + Claude integration
├── packages/
│   ├── types/              VerificationStatus, ClaimType, VerificationRequest/Result, ...
│   ├── contracts/          zod request/response + service schemas
│   └── utils/              request IDs, hashing, HTTP helpers (shared, non-domain)
├── legacy/
│   └── existing-klaim/     the current monolith, preserved & recoverable
├── docs/                   this folder
├── infra/
│   ├── docker/             Dockerfiles + compose fragments
│   └── gcp/                Cloud Run configs
├── .env.example
├── docker-compose.yml
├── package.json            (workspaces root)
└── README.md
```

Each app/service has its **own** `src/`, `package.json`, and `Dockerfile`. There
is **no** top-level `src/idina`, `src/zkp`, etc.

---

## 4. Verification state machine (canonical)

Defined once in `packages/types` and imported everywhere. No service defines its
own status strings.

```
CREATED
  → PENDING_CONSENT
    → CONSENT_GRANTED        (or → DENIED)
      → PAYMENT_REQUIRED
        → PAYMENT_SETTLED    (or → PAYMENT_FAILED)
          → VERIFYING
            → PROOF_GENERATED   (or → CREDENTIAL_INVALID / VERIFICATION_FAILED)
              → VERIFIED
```

Terminal failure states: `DENIED`, `PAYMENT_FAILED`, `CREDENTIAL_INVALID`,
`VERIFICATION_FAILED`.

### The invariant
```
NO SETTLEMENT → NO VERIFICATION
```
Only a **confirmed on-chain settlement** (`PAYMENT_SETTLED`, from the protocol
service reporting a real Algorand txId) permits the transition into `VERIFYING`.
The backend enforces this. The frontend cannot influence it. Neither
"payment intent", "402 acknowledged", nor "frontend says paid" is ever accepted.

---

## 5. Components

### 5.1 frontend/quickdrop (Monika)
Delivery-partner onboarding, creates a verification request, polls status, shows
the final boolean result. Talks **only** to `klaim-api`. Env:
`VITE_KLAIM_API_URL`, `VITE_DEMO_DID`. Must never independently determine
verification.

### 5.2 frontend/identity-wallet (Danish)
User-facing consent PWA. Displays incoming requests and requested claims, offers
Allow/Deny, shows status and credential references. Talks **only** to `klaim-api`.
Never exposes raw identity documents to the verifier.

### 5.3 backend/klaim-api (Danish)
Central REST API and source of truth. Owns:
- verification request creation + request IDs
- the state machine + all state transitions
- consent state, payment state, results, audit
- storage (via `VerificationRepository` abstraction)
- coordination with Idina and the services
- MCP-facing bridge (delegates to the MCP service / same lifecycle)

Reuses the proven `handleVerifyAge` settlement→verification logic behind the
`PAYMENT_SETTLED → VERIFYING` transition.

### 5.4 services/idina (Danish) — IMPLEMENTED
The **orchestrator** (`services/idina`, Node microservice). Receives a request,
inspects credentials, verifies payment settlement, triggers proof generation, and
returns a structured result — through **exactly three controlled harnesses**
(wallet/credential, payment, zkp). Agent mode = Gemini/Vertex function-calling
(Google ADK-equivalent for the TS runtime); `deterministic` fallback uses the
same harnesses + gates. The LLM **orchestrates only** — the authoritative result
is computed by the deterministic orchestrator, so the model can never fabricate a
result, invent payment status, or skip a gate. Operates on request IDs, claim
types, credential references, consent/payment/proof status — **never raw PII**.
API: `POST /orchestrate`, `GET /health`, `GET /orchestrate/:id`. See docs/IDINA.md.

### 5.5 services/protocol (Omkar)
Wraps the existing x402 / GoPlausible / Algorand code. Exposes payment
initiation, settlement, and status-by-requestId. Returns `{ requestId, status,
txId, network, asset, amount, timestamp }`. Private keys never leave the service.

### 5.6 services/zkp (Omkar)
Wraps `zkpService`. `POST /api/zkp/generate` takes `{ requestId, claims,
credentialRefs }` → `{ requestId, status: "PROOF_GENERATED", claims{...},
proofId }`. Engine `local` (deterministic) by default; Midnight boundary
preserved via `MIDNIGHT_PROVER_URL`. Local proofs are labelled `engine=local` —
never presented as production Midnight cryptography.

### 5.7 services/mcp (Omkar)
MCP server exposing KLAIM to AI agents. Minimum tools `verify_age`,
`get_verification_status`; optional `verify_identity`, `verify_license`. It is an
**interface**, not a second verification engine — every tool drives the same
`klaim-api` lifecycle. Existing `verify_human_age` preserved for backward
compatibility.

### 5.8 packages/*
- `types` — the canonical enums and domain shapes (state machine lives here).
- `contracts` — zod schemas for REST + service calls (reuse the repo's `zod`).
- `utils` — request-ID generation, SHA-256 hashing, HTTP helpers only.

### 5.9 legacy/existing-klaim
The current monolith, preserved and runnable. Existing endpoints
(`/api/v1/verify/age`, `/api/public/mcp`) keep working during migration. The new
architecture must not depend unnecessarily on legacy code.

---

## 6. End-to-end flows

### 6.1 QuickDrop (human) path
```
QuickDrop → POST /api/verification-requests (klaim-api)   [CREATED → PENDING_CONSENT]
klaim-api → Idina: orchestrate request
Identity Wallet ← shows requested claims
User → POST /consent { ALLOW }                            [CONSENT_GRANTED]  (DENY → DENIED)
Idina → klaim-api → protocol: begin payment               [PAYMENT_REQUIRED → 402]
payer/x402 → GoPlausible → Algorand Testnet               [settlement]
protocol → confirmed txId                                 [PAYMENT_SETTLED]
Idina → provider/credential verification                  [VERIFYING]
Idina → zkp: POST /api/zkp/generate                        [PROOF_GENERATED]
klaim-api                                                   [VERIFIED]
QuickDrop ← GET /result  { claims{...}, proofId, txId }
```

### 6.2 AI (Claude) path
```
Claude → MCP service (verify_age / get_verification_status)
MCP → klaim-api → Idina → same lifecycle → same result
```

Both paths converge on **one** lifecycle in `klaim-api`.

---

## 7. Communication & config

- Services talk over **HTTP** using env-provided base URLs:
  `KLAIM_API_URL`, `IDINA_URL`, `PROTOCOL_SERVICE_URL`, `ZKP_SERVICE_URL`,
  `MCP_SERVICE_URL`. **No hardcoded URLs** (no baked-in Cloud Run hostnames).
- Internal service endpoints require a simple secure mechanism (service token /
  Cloud Run identity / signed internal request). Existing `klm_` agent-key auth
  (SHA-256 storage, rotation, revocation) is preserved and not weakened.
- CORS on `klaim-api` allows the QuickDrop and Identity Wallet origins via
  env-configured allowlist; no unrestricted production CORS.

---

## 8. Storage

Business logic depends on a `VerificationRepository` interface, never on a
concrete store. Local dev may use in-memory; deployed multi-service use targets
**Firestore**. Candidate collections: `verificationRequests`, `consents`,
`transactions`, `verificationResults`, `credentials`, `agents`. Kept minimal.

---

## 9. Privacy model (unchanged principle)

Stays private: name, DOB, address, Aadhaar, PAN, document number, raw document,
wallet keys, agent secrets. Returned: verification result, claims, proof
metadata, payment receipt, Algorand txId. Idina and the services operate on
references and booleans, not raw PII.
```