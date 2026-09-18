# MIGRATION_PLAN.md — KLAIM V2

> How we get from the current TanStack Start monolith (`EXISTING_SYSTEM.md`) to
> the target service architecture (`ARCHITECTURE.md`) **incrementally, without
> breaking the running app or rewriting git history.**
>
> Baseline: branch `main`, HEAD `d488a39`, clean tree.

---

## 1. Guiding rules

1. **Preserve working functionality.** `/api/v1/verify/age` and `/api/public/mcp`
   keep working throughout. The new request-based system coexists with the old.
2. **No destructive git.** No `reset --hard`, force push, rebase, amend, or
   squash of pushed commits (Lovable sync). Work on branch
   **`restructure/klaim-v2`**; keep `main` as a safe checkpoint.
3. **Code boundaries hard; deployment may consolidate** (see `DEPLOYMENT.md`).
4. **Copy, don't delete.** During migration we duplicate code into new
   packages/services and leave the monolith intact under `legacy/existing-klaim`.
   Old code is deleted only after V2 is proven.
5. **Reuse proven logic** (x402, settlement, ZKP, provider agent) rather than
   rewriting it.

---

## 2. Dependency graph (verified)

```
env.server ─────────────────┐  (leaf; read env per-request)
                            ├─◄ x402.server ─◄ verify/age, transactions, health
                            ├─◄ x402-client.server ─◄ public/mcp route
                            ├─◄ zkp.server ─◄ provider-agent.server
                            ├─◄ digilocker.server ─◄ v1/digilocker
                            └─◄ provider-agent.server ─◄ verify/age
store.server ───────────────┐  (leaf; crypto only; global __klaimDb, ephemeral)
                            ├─◄ all v1 routes
                            ├─◄ mcp.server ─◄ public/mcp route, integrations
                            ├─◄ zkp.server
                            └─◄ provider-agent.server
public/mcp.ts route ─► mcp.server + x402-client.server + calls handleVerifyAge()  ← in-process coupling to break
```

**Key coupling to break for service split:** `public/mcp.ts` calls
`handleVerifyAge()` directly. When MCP becomes its own service, that becomes an
HTTP call into `klaim-api`.

---

## 3. Exact migration map

Format: `CURRENT → TARGET → ACTION → DEPENDENCIES → RISK`.

Actions: **copy-to-legacy** (preserve), **extract/wrap** (move logic into a
service behind an HTTP interface), **reference** (import from a shared package),
**new** (net-new code), **keep** (leave in place for backward compat).

### 3.1 Shared foundation → `packages/*`

| Current | Target | Action | Depends on | Risk |
|---|---|---|---|---|
| `src/lib/klaim/types.ts` | `packages/types/src/` | extract + extend (add state machine, `ClaimType`, request/result/consent/payment/proof types) | — | **low** |
| `src/lib/klaim/api.ts` (client contract shapes) | `packages/contracts/src/` | extract request/response schemas as zod | `zod` | low |
| `src/lib/utils.ts`, `src/lib/klaim/mcp-url.ts` | `packages/utils/src/` | extract genuinely shared helpers only | — | low |
| `store.server.ts` `hashKey`, `mintAccessKey`, `maskKey`, `rid` | `packages/utils/src/` | extract (hashing + id helpers) | `crypto` | low |

### 3.2 Backend → `backend/klaim-api`

| Current | Target | Action | Depends on | Risk |
|---|---|---|---|---|
| `src/routes/api/v1/verify/age.ts` | `backend/klaim-api/src/routes/` + reused core | **keep** live; extract `handleVerifyAge` settlement→verify core to be called behind `PAYMENT_SETTLED → VERIFYING` | provider-agent, x402, store | **medium** (must not break invariant) |
| `src/routes/api/v1/agents*.ts` | `backend/klaim-api/src/routes/` | extract/wrap | store | low |
| `src/routes/api/v1/credentials.ts` | `backend/klaim-api/src/routes/` | extract/wrap | store | low |
| `src/routes/api/v1/digilocker.ts` | `backend/klaim-api/src/routes/` | extract/wrap | digilocker.server, store | low |
| `src/routes/api/v1/integrations.ts` | `backend/klaim-api/src/routes/` | extract/wrap | env, mcp.server, store | low |
| `src/routes/api/v1/transactions.ts` | `backend/klaim-api/src/routes/` | extract/wrap | store, x402 | low |
| `src/routes/api/health.ts` | `backend/klaim-api/src/routes/` | extract/wrap | env, x402 | low |
| `src/lib/klaim/server/store.server.ts` | `backend/klaim-api/src/repository/` behind `VerificationRepository` | **extract + abstract** (in-memory impl + Firestore impl); add `verificationRequests`, `consents`, `verificationResults` collections | crypto | **high** (state machine correctness, multi-instance) |
| `src/lib/klaim/server/env.server.ts` | `backend/klaim-api/src/config/` (+ shared bits) | extract/wrap | — | low |
| **NEW** verification-request lifecycle + state machine + consent endpoints | `backend/klaim-api/src/` | **new** | types, repository | **high** (core new work) |

### 3.3 Services

| Current | Target | Action | Depends on | Risk |
|---|---|---|---|---|
| `src/lib/klaim/server/x402.server.ts` | `services/protocol/src/` | **extract/wrap** behind HTTP (`/api/payments/:id/begin`, `/status`) | env | **medium** (in-process → HTTP) |
| `src/lib/klaim/server/x402-client.server.ts` | `services/protocol/src/` | extract/wrap (payer signing stays server-side) | env, algosdk | medium |
| `scripts/{test-x402,generate-wallet,optin-usdc}.ts` | `services/protocol/scripts/` | move | algosdk | low |
| `src/lib/klaim/server/zkp.server.ts` | `services/zkp/src/` | **extract/wrap** → `POST /api/zkp/generate` (multi-claim) | env, store→refs | **medium** (single→multi claim) |
| `src/lib/klaim/server/mcp.server.ts` | `services/mcp/src/` | extract/wrap; add `verify_age`, `get_verification_status` | store→klaim-api | **medium** |
| `src/routes/api/public/mcp.ts` | `services/mcp/src/` | extract; **replace in-process `handleVerifyAge()` call with HTTP call to klaim-api** | mcp.server, klaim-api | **medium/high** (break coupling) |
| `scripts/{test-mcp,provision-agent}.ts` | `services/mcp/scripts/` | move | — | low |
| `src/lib/klaim/server/provider-agent.server.ts` | `services/zkp/` or `backend` (verification executor) | extract/wrap; **remains an executor, NOT Idina** | env, store, zkp | medium |
| `src/lib/klaim/server/digilocker.server.ts` | `backend/klaim-api/src/adapters/` (or a credential service later) | extract/wrap | env | low |
| **NEW** orchestrator | `services/idina/src/` | **new** (deterministic fallback first; ADK/Vertex optional) | contracts, HTTP clients | **high** (net-new) |

### 3.4 Frontend

| Current | Target | Action | Depends on | Risk |
|---|---|---|---|---|
| `src/routes/verifier.*` + related `components/app/*` | `frontend/quickdrop/src/` | rebuild as verifier client on **real** klaim-api (drop mock) | api client | **medium** |
| `src/routes/human.*` + related `components/app/*` | `frontend/identity-wallet/src/` | rebuild as consent PWA on **real** klaim-api | api client | **medium** |
| `src/components/ui/*` (shadcn) | duplicated per frontend (or `packages/ui` later) | copy | — | low |
| `src/components/klaim-landing.tsx`, `login.*`, `index.tsx`, `__root.tsx` | split across frontends | copy/adapt | — | low |

### 3.5 Legacy (preserve)

| Current | Target | Action | Depends on | Risk |
|---|---|---|---|---|
| entire current app (`src/`, `scripts/`, `tests/`, config) | `legacy/existing-klaim/` | **copy-to-legacy** (keep runnable & recoverable) | — | low |
| `src/lib/klaim/services.ts` (mock) | `legacy/existing-klaim/` | keep as legacy; not used by new frontends | mock-data | low |
| `src/lib/klaim/mock-data.ts` | `legacy/existing-klaim/` | keep as legacy | — | low |
| `src/lib/klaim/store.tsx` | `legacy/existing-klaim/` | keep as legacy | services | low |

### 3.6 Tests

| Current | Target | Action | Depends on | Risk |
|---|---|---|---|---|
| `tests/mcp-x402-flow.test.ts` + `tests/helpers/` | `backend/klaim-api/tests/` + `services/mcp/tests/` | extract/adapt; keep "skip loudly, never fake a pass" | running services | medium |
| **NEW** lifecycle tests (create → consent → payment-not-settled blocks → settled → verified) | `backend/klaim-api/tests/` | **new** — the `PAYMENT_NOT_SETTLED → verification blocked` test is priority #1 | state machine | **high** |

---

## 4. Phased sequence (matches the brief)

| Phase | Work | Depends on | Deliverable |
|---|---|---|---|
| 0 | Git checkpoint: branch `restructure/klaim-v2` off `main` | — | safe branch |
| 1 | Repo structure: workspaces root `package.json`, empty `frontend/ backend/ services/ packages/ legacy/ infra/`; copy monolith → `legacy/existing-klaim` | 0 | scaffold |
| 2 | `packages/types` + `packages/contracts` + `packages/utils` (state machine + schemas) | 1 | shared packages |
| 3 | `backend/klaim-api` verification-request lifecycle + state machine + consent endpoints | 2 | request API |
| 4 | Storage abstraction (`VerificationRepository`: in-memory + Firestore) | 3 | pluggable store |
| 5 | Extract `services/protocol` (x402 + Algorand), wrap in HTTP | 2 | protocol svc |
| 6 | Extract `services/zkp` (multi-claim `POST /api/zkp/generate`) | 2 | zkp svc |
| 7 | Extract `services/mcp`; replace in-process `handleVerifyAge` call with HTTP | 3 | mcp svc |
| 8 | `services/idina` orchestrator (deterministic fallback first) | 3,5,6 | orchestrator |
| 9 | `frontend/identity-wallet` on real klaim-api | 3 | wallet |
| 10 | `frontend/quickdrop` on real klaim-api | 3 | verifier UI |
| 11 | End-to-end integration + tests (payment-not-settled block first) | 3–10 | green E2E |
| 12 | Cloud Run: Dockerfiles + consolidated deploy | 11 | deployment |

Backward-compat gate (phase 11): the legacy `/api/v1/verify/age` and
`/api/public/mcp` must still pass their existing tests before any old code is
removed.

---

## 5. Proposed repository tree (target)

```
KLAIM/
├── frontend/
│   ├── quickdrop/            src/ public/ Dockerfile package.json
│   └── identity-wallet/      src/ public/ Dockerfile package.json
├── backend/
│   └── klaim-api/            src/{routes,repository,config,adapters,state}/ tests/ Dockerfile package.json
├── services/
│   ├── idina/                src/ tests/ Dockerfile package.json
│   ├── protocol/             src/ scripts/ tests/ Dockerfile package.json
│   ├── zkp/                  src/ tests/ Dockerfile package.json
│   └── mcp/                  src/ scripts/ tests/ Dockerfile package.json
├── packages/
│   ├── types/                src/ package.json
│   ├── contracts/            src/ package.json
│   └── utils/                src/ package.json
├── legacy/
│   └── existing-klaim/       (verbatim copy of today's app, runnable)
├── docs/                     ARCHITECTURE API_CONTRACT SERVICE_CONTRACTS DEPLOYMENT TEAM_OWNERSHIP EXISTING_SYSTEM MIGRATION_PLAN (.md)
├── infra/
│   ├── docker/               per-service Dockerfiles / compose fragments
│   └── gcp/                  Cloud Run service configs
├── .env.example
├── docker-compose.yml
├── package.json              (workspaces: frontend/*, backend/*, services/*, packages/*)
└── README.md
```

---

## 6. Conflicts & mitigations (carried from audit)

| Conflict | Mitigation |
|---|---|
| Monolith co-locates FE + API; server modules are in-process | Keep code boundaries via packages/services with HTTP-shaped interfaces; allow consolidated deployment. Break only the `mcp → handleVerifyAge` in-process call. |
| Lovable owns Vite/Nitro config; no history rewrites | `klaim-api` + `legacy` keep the Lovable TanStack setup. New frontends are standalone Vite apps not inheriting the Lovable config. Work on a branch; never rewrite pushed history. |
| Single claim → three claims | New multi-claim request model in `klaim-api` + `services/zkp`; legacy `age_over_18` path untouched. |
| No consent / no request entity | Net-new in phase 3 (additive, low risk to existing code). |
| Ephemeral in-memory store breaks across consent gap / instances | `VerificationRepository` abstraction (phase 4); Firestore for deployed use. |
| Provider agent ≠ Idina | Provider agent stays an executor; Idina is new and calls it as a tool. |
| Nitro default target = Cloudflare Workers | Configure Node/container target for Cloud Run per deployable (see `DEPLOYMENT.md`). |

---

## 7. What is explicitly NOT done in this planning step

No files moved, deleted, renamed, or restructured. No branch created yet. No
dependencies installed. This document + the other six docs are the only output of
the audit/planning phase. Implementation begins at Phase 0 only after sign-off.
```