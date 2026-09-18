# KLAIM — Integration Handoff

How the pieces connect, and exactly what each teammate needs to wire their part.
This is a demo/hackathon build; where something is a mock or dev adapter, it says so.

## System topology

```
QuickDrop (Monika)                Identity Wallet (frontend/klaim)
  verifier UI  ─┐                   user consent UI  ─┐
               │                                      │
               ▼                                      ▼
        ┌──────────────────────── KLAIM API (backend/klaim-api) ───────────────────────┐
        │  system of record for the verification-request lifecycle (state machine)      │
        └───────────────┬───────────────────────────────────────────┬──────────────────┘
                        │ (payment settle, when wired)                │ reads consent/state
                        ▼                                             │
        Protocol service (Omkar)  ◀───────────────────────────  Idina orchestrator
        /api/payments/settle                                    (services/idina, Cloud Run)
        /api/zkp/generate                                       drives consent→wallet→payment→zkp
```

Two independent front doors both talk to the **KLAIM API**:
- **QuickDrop** (Monika) creates verification requests and reads results.
- **Identity Wallet** (our frontend) is where the user grants consent and watches the flow.

**Idina** is the orchestrator microservice. It reads authoritative state from the KLAIM API and calls **Omkar's protocol service** for real payment settlement and ZKP generation. Idina is verified working end-to-end (see §5).

---

## 1. KLAIM API (backend/klaim-api) — the contract everyone integrates against

- Runtime: Bun, framework-free. Local: `bun run src/index.ts` → `http://localhost:8080`.
- **Inbound auth: none** (demo). Access is gated only by CORS allowlist.

### Environment variables
| Var | Purpose | Demo value |
|---|---|---|
| `PORT` | Listen port | `8080` |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowlist. **Must include each frontend origin** or the browser call is blocked. | `http://localhost:5174,https://<quickdrop-origin>` |
| `KLAIM_DEV_ADAPTERS` | `true` enables the dev settle/verify routes. **Required for the demo flow to reach VERIFIED** — otherwise a request stalls at `PAYMENT_REQUIRED`. | `true` (demo) / `false` (prod) |
| `PROTOCOL_SERVICE_URL` | Omkar's protocol service. When set (with the token), real settlement replaces the mock. | `https://klaim-protocol-14759700171.asia-south1.run.app` |
| `INTERNAL_SERVICE_TOKEN` | Shared bearer token for the protocol service. | (Omkar's token, out-of-band) |

### Endpoints
| Method + path | Body | Response |
|---|---|---|
| `GET /health` | — | `{ status, ... }` |
| `POST /api/verification-requests` | `{ verifierId: string, userDid: string, claims: ClaimType[] }` | `201 { requestId, status: "PENDING_CONSENT" }` |
| `GET /api/verification-requests/:id` | — | `{ requestId, status, verifierId, userDid, claims, consent:{decision,at}, payment:{status,txId}, createdAt, updatedAt }` |
| `POST /api/verification-requests/:id/consent` | `{ decision: "ALLOW" \| "DENY" }` | `{ requestId, status }` |
| `GET /api/verification-requests/:id/result` | — | not VERIFIED: `{ requestId, status, result: null }`; VERIFIED: `{ requestId, status, claims, proof, payment }` |
| `POST /api/dev/verification-requests/:id/settle` | — (dev-gated) | `{ requestId, status }` |
| `POST /api/dev/verification-requests/:id/verify` | — (dev-gated) | `{ requestId, status }` |

`ClaimType` ∈ `"identity_verified" | "age_over_18" | "license_valid"`.

### Lifecycle (state machine)
```
CREATED → PENDING_CONSENT → CONSENT_GRANTED → PAYMENT_REQUIRED
  → PAYMENT_SETTLED → VERIFYING → PROOF_GENERATED → VERIFIED
```
Terminal failures: `DENIED`, `PAYMENT_FAILED`, `CREDENTIAL_INVALID`, `VERIFICATION_FAILED`.
**Invariant: NO SETTLEMENT → NO VERIFICATION** — verification can only start from `PAYMENT_SETTLED`.

---

## 2. For Monika (QuickDrop) — how to create and track a verification

QuickDrop acts as the **verifier**. It does not need the wallet or Idina — just the KLAIM API.

1. **Create a request** (when QuickDrop wants to verify a user):
   ```
   POST {KLAIM_API}/api/verification-requests
   { "verifierId": "quickdrop", "userDid": "<user did>",
     "claims": ["identity_verified","age_over_18","license_valid"] }
   → 201 { "requestId": "...", "status": "PENDING_CONSENT" }
   ```
2. **Hand the user off to the Identity Wallet** to consent (they see the flow + grant/deny).
3. **Poll for the outcome**:
   ```
   GET {KLAIM_API}/api/verification-requests/{requestId}         // status
   GET {KLAIM_API}/api/verification-requests/{requestId}/result  // claims + proof when VERIFIED
   ```
4. QuickDrop only ever receives **claim answers** (booleans) and a proof reference — never the user's documents or PII.

**What I need from you (Monika):**
- Your QuickDrop web origin (e.g. `https://quickdrop.example.app`) so I add it to the KLAIM API `ALLOWED_ORIGINS`. Without this, browser calls are CORS-blocked.
- Confirm you'll use `verifierId: "quickdrop"` (or tell me the id you want).
- The `userDid` you'll pass — for the demo it's `did:identipi:demo-user-001`.

---

## 3. For the frontend (Identity Wallet) — already wired

- Vite dev server: port **5174**. Build: `tsc --noEmit && vite build` (verified passing).
- Env: **`VITE_KLAIM_API_URL`** (default `http://localhost:8080`). Set it to the deployed KLAIM API for a non-local demo. Copy `.env.example` → `.env.local`.
- The consent + flow experience is at `/app/verify` (page `src/pages/Verify.tsx`), driving the real KLAIM API via `src/lib/klaim/v2-api.ts`.

### The three flow moments (new — `src/components/app/verification-steps.tsx`)
Each dialog renders the **real polled backend status/data** — no fabricated tx/proof ids:
1. **Wallet access** — opens on "Allow"; shows which local demo credentials cover the requested claims before anything is shared.
2. **Payment confirmation** — auto-opens on `PAYMENT_*`; shows amount, network, and the real `txId` + explorer link when settled. Labels a `MOCK-` tx as a dev adapter.
3. **ZKP generation** — auto-opens on `VERIFYING`/`PROOF_GENERATED`; shows the real `proofId`, engine (`local`), and proven claims.

**Honesty note baked into the UI:** with `KLAIM_DEV_ADAPTERS=true` the settlement uses the backend mock (no real USDC) and the dialogs say so. The proof engine is `local` (Midnight-ready), not a Midnight ZK circuit.

---

## 4. Running the demo end-to-end (local)

```bash
# Terminal 1 — backend (needs Bun)
cd backend/klaim-api
ALLOWED_ORIGINS=http://localhost:5174 KLAIM_DEV_ADAPTERS=true bun run src/index.ts

# Terminal 2 — frontend
cd frontend/klaim
# .env.local: VITE_KLAIM_API_URL=http://localhost:8080
npm run dev   # → http://localhost:5174
```
Open `http://localhost:5174`, sign in (demo), go to Verify, click **Open verification request → Allow**. You'll see wallet → payment → ZKP dialogs as the request advances to `VERIFIED`.

To settle **on-chain for real** instead of the mock, also set on the backend:
`PROTOCOL_SERVICE_URL=https://klaim-protocol-14759700171.asia-south1.run.app` and `INTERNAL_SERVICE_TOKEN=<Omkar's token>`.

---

## 5. Deployed services (reference)

| Service | Owner | URL | Notes |
|---|---|---|---|
| Idina orchestrator | Danish | `https://klaim-idina-atnwarjo4q-el.a.run.app` | `POST /orchestrate`; verified `COMPLETED` end-to-end |
| Protocol service | Omkar | `https://klaim-protocol-14759700171.asia-south1.run.app` | `POST /api/payments/settle`, `POST /api/zkp/generate` |
| KLAIM API | Danish | (deploy pending) | needs deploy for a hosted demo |
| QuickDrop | Monika | (Monika's deployment) | verifier UI |

### Idina ↔ Protocol status (verified this session)
- Payment: settles on-chain via Omkar's service (real Algorand testnet txId).
- ZKP: batch `{ requestId, claims[], did }` → `PROOF_GENERATED`, engine `local`, resolves by DID.
- Auth: `Authorization: Bearer <INTERNAL_SERVICE_TOKEN>` (shared secret, same for settle + zkp).
- Full `/orchestrate` returns `COMPLETED` with all claims true, real txId + proofId.

---

## 6. What's still open / honest caveats
- **KLAIM API is not deployed yet** — for a hosted demo it needs a Cloud Run (or similar) deploy, then set `VITE_KLAIM_API_URL` (frontend) and `ALLOWED_ORIGINS` (backend) accordingly.
- **Backend does not call Idina.** Today the backend settles via its own `ProtocolPaymentAdapter` (or mock). Idina is a parallel orchestrator that reads backend state and calls the protocol service. If we want the KLAIM API flow to route through Idina, that wiring is not built yet — flag if we need it for the demo.
- **Dev adapters** (`KLAIM_DEV_ADAPTERS=true`) are what advance a request past `PAYMENT_REQUIRED` in the local demo. Real settlement requires the protocol env vars.
- **Proof engine is `local`**, not Midnight. Describe it as "local proof engine, Midnight-ready."
