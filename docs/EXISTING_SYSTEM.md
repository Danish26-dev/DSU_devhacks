# EXISTING_SYSTEM.md

> Snapshot of the KLAIM repository **as it exists today**, before the KLAIM V2
> service-oriented migration. This document is descriptive, not aspirational —
> every path below is real and verified in the current tree.
>
> Git baseline at audit time: branch `main`, HEAD `d488a39`, clean working tree.

---

## 1. What KLAIM is today

A **single TanStack Start (React 19 + Nitro) monolith**. One codebase and one
build serve both the frontend UI and the backend REST/JSON-RPC API. The server
modules are invoked **in-process** (direct function calls / imported singletons),
not over HTTP.

There are two parallel "backends" wired to the UI:

| Path | Nature | Flag |
|---|---|---|
| `src/lib/klaim/services.ts` | Browser **mock** — simulates auth, DID, credentials, ZKP, x402, MCP entirely client-side | `IS_MOCK_BACKEND = true` |
| `src/lib/klaim/api.ts` | **Real** client — `fetch`es the app's own `/api/v1/*` server routes | — |

The real verification path is genuinely functional: it performs x402 payment,
GoPlausible settlement on Algorand Testnet, a provider-agent verification step,
and a ZKP abstraction. It is currently **single-claim** (`age_over_18`) and
**synchronous** (one HTTP request in → verified result out). There is **no
persisted verification-request entity, no request IDs, and no consent step.**

---

## 2. Tech stack (from `package.json`)

| Layer | Technology |
|---|---|
| Frontend | React 19, TanStack Router `1.170.18`, TanStack Start `1.168.32` |
| Styling / UI | Tailwind v4, shadcn/ui + Radix, lucide-react |
| Server | Nitro `3.0.260603-beta` via TanStack Start server routes |
| Language / runtime | TypeScript `5.8.3`, Bun (primary) / Node |
| Payments | `@x402/core`, `@x402/avm`, `@x402/extensions` (all `^2.23.0`) |
| Chain | `algosdk ^3.7.0`, Algorand Testnet, USDC ASA `10458941` |
| AI agent | `@strands-agents/sdk ^1.14.0` |
| Validation | `zod ^4.4.3` |
| Build config | `@lovable.dev/vite-tanstack-config ^2.15.0` |
| Test | `vitest ^4.1.11` |

### Scripts (`package.json`)
```
dev              vite dev            (serves on http://localhost:8080)
build            vite build
build:dev        vite build --mode development
preview          vite preview
lint             eslint .
format           prettier --write .
test             vitest run
test:x402        npx tsx scripts/test-x402.ts
test:mcp         npx tsx scripts/test-mcp.ts
test:integration vitest run tests/mcp-x402-flow.test.ts
wallet:generate  npx tsx scripts/generate-wallet.ts
wallet:optin     npx tsx scripts/optin-usdc.ts
agent:provision  npx tsx scripts/provision-agent.ts
```

There are **no Dockerfiles** and **no deployment scripts** in the repo today.

---

## 3. Lovable coupling (must be respected during migration)

- `AGENTS.md` warns: this project is connected to **Lovable**. Do **not** rewrite
  published git history (no force push / rebase / amend / squash of pushed
  commits). Commits pushed to the connected branch sync back to Lovable.
- Build config is `@lovable.dev/vite-tanstack-config`. `vite.config.ts` explicitly
  warns **not** to add TanStack devtools, `tanstackStart`, `viteReact`,
  `tailwindcss`, `tsConfigPaths`, or `nitro` plugins manually — the Lovable config
  already includes them. It also injects `VITE_*` env, the `@` alias, and sandbox
  port/host detection.
- `bunfig.toml` sets a 24h supply-chain guard (`minimumReleaseAge`) and excludes
  the Lovable packages from it.
- `vite.config.ts` also aliases `pkce-challenge` to its browser build so the
  Worker bundle (pulled in transitively via `@strands-agents/sdk` → MCP SDK)
  resolves.

**Implication:** the current app (which becomes `legacy/existing-klaim` and,
in part, `backend/klaim-api`) should keep the Lovable TanStack setup. New,
independent frontends are safer as their own Vite apps that do not inherit this
config.

---

## 4. Directory map (current)

```
src/
├── router.tsx, routeTree.gen.ts, server.ts, start.ts, styles.css
├── assets/
├── hooks/
├── components/
│   ├── klaim-landing.tsx
│   ├── app/         app-shell, verification-flow, agent-ui, settlement-receipts,
│   │                role-login, integration-status, create-agent-modal, primitives
│   └── ui/          shadcn primitives
├── lib/
│   ├── utils.ts, error-capture.ts, error-page.ts, lovable-error-reporting.ts
│   └── klaim/
│       ├── api.ts            REAL browser client → /api/v1/*
│       ├── services.ts       MOCK browser backend (IS_MOCK_BACKEND=true)
│       ├── mock-data.ts      demo seed data
│       ├── store.tsx         client state (uses mock services)
│       ├── types.ts          domain types (ClaimId, VerifierAgent, etc.)
│       ├── mcp-url.ts        MCP URL helper
│       └── server/           ← REAL backend logic (in-process)
│           ├── env.server.ts
│           ├── store.server.ts
│           ├── x402.server.ts
│           ├── x402-client.server.ts
│           ├── zkp.server.ts
│           ├── mcp.server.ts
│           ├── provider-agent.server.ts
│           └── digilocker.server.ts
└── routes/
    ├── __root.tsx, index.tsx
    ├── login.index.tsx, login.human.tsx, login.verifier.tsx
    ├── human.tsx + human.{dashboard,credentials.index,credentials.add,identity,activity,settings}.tsx
    ├── verifier.tsx + verifier.{dashboard,agents.index,agents.$agentId,verify,payments,activity,settings}.tsx
    └── api/
        ├── health.ts
        ├── public/mcp.ts
        └── v1/
            ├── verify/age.ts
            ├── agents.ts, agents.$agentId.ts
            ├── credentials.ts
            ├── digilocker.ts
            ├── integrations.ts
            └── transactions.ts

scripts/  generate-wallet.ts, optin-usdc.ts, provision-agent.ts, test-mcp.ts, test-x402.ts
tests/    mcp-x402-flow.test.ts, helpers/
```

---

## 5. Server modules — responsibilities

| Module | Responsibility | Imports (internal) | External deps |
|---|---|---|---|
| `env.server.ts` | Reads env per-request (never at module scope); derives integration readiness (`live` / `pending_credentials` / `not_configured`) | — (leaf) | — |
| `store.server.ts` | In-memory repository: agents, credentials, audit, transactions. Global singleton `__klaimDb`. Seeds one demo human. SHA-256 key hashing. `storage: "ephemeral"` | — (leaf) | `crypto` |
| `x402.server.ts` | x402 **resource server** boundary: `requirePayment()` → 402 (official SDK) → `settle()` via GoPlausible. Algorand Testnet CAIP-2, Lora URLs, `facilitatorReachable()` | `env` | `@x402/core`, `@x402/avm`, `@x402/extensions` |
| `x402-client.server.ts` | Server-side **payer** signing (`signPaymentFromResponse`), reusing `algosdk`. Payer mnemonic stays server-side | `env` | `@x402/core/client`, `@x402/avm/exact/client`, `algosdk` |
| `zkp.server.ts` | `zkpService.prove()` — engine `local` (deterministic over `derivedClaims`) or `midnight` (via `MIDNIGHT_PROVER_URL`). Honestly labels `engine=local` | `env`, `store` | `crypto`, `fetch` |
| `provider-agent.server.ts` | **Verification executor** behind the payment wall. Tools: `check_did`, `check_credential`, `check_claim`, `generate_zk_proof`, `verify_zk_proof`. Deterministic runner; optional Strands runtime. **NOT the orchestrator (not Idina).** | `env`, `store`, `zkp` | `@strands-agents/sdk` (dynamic import) |
| `mcp.server.ts` | MCP JSON-RPC handler (`initialize`, `ping`, `tools/list`, `tools/call`), tool registry (`verify_human_age`), agent auth. Contains **no** payment/ZK logic | `store` | — |
| `digilocker.server.ts` | DigiLocker OAuth 2.0 adapter. Reports `pending_credentials` without partner creds — never fabricates a credential | `env` | `fetch` |

---

## 6. API routes (current)

| Route file | HTTP | Purpose | Auth |
|---|---|---|---|
| `api/health.ts` | GET | Integration + facilitator health | none |
| `api/public/mcp.ts` | POST/OPTIONS/GET | MCP Streamable HTTP (JSON-RPC 2.0). Bridges to verify/age, signs payment server-side on 402 | agent key (`X-KLAIM-Agent-Id` + `Bearer klm_...`) |
| `api/v1/verify/age.ts` | POST | **x402-protected** `age_over_18` verification. `handleVerifyAge()` exported and reused by the MCP route | agent key |
| `api/v1/agents.ts` | GET/POST | List / create agents (mint `klm_` key, shown once) | — / — |
| `api/v1/agents.$agentId.ts` | POST | Rotate / revoke agent key (`?action=`) | — |
| `api/v1/credentials.ts` | GET/DELETE | List / delete credential references | — |
| `api/v1/digilocker.ts` | POST | DigiLocker authorize / callback | — |
| `api/v1/integrations.ts` | GET | Integration statuses + MCP descriptor | — |
| `api/v1/transactions.ts` | GET | Transaction history | — |

---

## 7. The critical invariant (already enforced)

In `src/routes/api/v1/verify/age.ts`, the order is load-bearing and correct:

```
authenticate agent
  → requirePayment()               (x402.server: 402 via official SDK, or 503 X402_NOT_CONFIGURED)
    → gate.settle()                (GoPlausible → Algorand Testnet; real txId or failure)
      → providerAgentService.verifyAgeOver18()   ← runs ONLY after settlement.ok
        → zkpService.prove()
          → 200 with proof + payment receipt
```

If the gate is not `paid`, or `settle()` fails, the function returns **before**
any verification runs and records the transaction as `requires_payment` / `failed`.
**NO SETTLEMENT → NO VERIFICATION is already true today** — V2 must preserve this
guarantee at the new request-lifecycle level.

---

## 8. Data model (in-memory store)

`store.server.ts` holds four collections in a global `__klaimDb`:

- `agents: Map<id, AgentRecord>` — `keyHash` (SHA-256), `keyPrefix`, `status`, `spending`, `tools`.
- `credentials: Map<id, CredentialRecord>` — **reference + issuer + derived claims only** (no document bytes, no raw Aadhaar/PAN/DOB/address). Seeds `DEMO_HUMAN_DID = did:identipi:demo-user-001` with `derivedClaims: { age_over_18: true }`, `live: false`.
- `audit: AuditEvent[]` — capped at 300.
- `transactions: TransactionRecord[]` — capped at 200. `txId` is `null` until a real settlement returns one; statuses `requires_payment | settled | failed`.

**Ephemeral:** data does not survive a Worker restart. Reported to the UI as
`storage: "ephemeral"`. This is the main blocker for a multi-step, multi-service
lifecycle (see `MIGRATION_PLAN.md`, storage abstraction).

---

## 9. Authentication (current)

- **Agent (verifier) auth:** `klm_...` access key, minted once, stored only as a
  SHA-256 hash (`hashKey`). `authenticateAgent(agentId, key)` compares hashes.
  Supports rotation and revocation. Enforced in `mcp.server.ts`
  (`authenticateMcpRequest`) and in `verify/age.ts`.
- **Human/user auth:** none real. `authService` in `services.ts` is a mock that
  does not check passwords.
- **No internal service-to-service auth** exists yet (everything is in-process).

---

## 10. Tests (current)

- `tests/mcp-x402-flow.test.ts` (vitest): rejects unauthenticated MCP calls;
  asserts `verify_human_age` is listed; asserts `402`/`503` without payment; and
  a **payment-dependent** test that **skips loudly** (`it.skipIf(!PAYER_READY)`)
  when payer config is absent — it never "passes" against a fabricated txId. When
  run, it checks the txId is real on `testnet-idx.algonode.cloud`.
- Requires a running dev server (`KLAIM_BASE_URL`, default `http://localhost:8080`)
  and a provisioned agent key.
- `scripts/test-x402.ts` and `scripts/test-mcp.ts` are standalone manual harnesses.

This "skip loudly rather than fake a pass" model is the template for the V2
`PAYMENT_NOT_SETTLED → verification blocked` test.

---

## 11. Known inconsistencies / gaps to carry into V2

1. **Claim spelling:** `types.ts` uses `licence_valid` (British). V2 standardizes
   the new contract on `license_valid` (American). Old endpoints keep their spelling.
2. **Single claim:** everything real is hardcoded to `age_over_18`
   (route path, `CLAIM` const, MCP tool `verify_human_age`, ZKP claim key).
3. **No consent / no request entity / no request IDs.**
4. **Ephemeral in-memory store** — breaks across the consent gap and across
   multiple service instances.
5. **Provider agent ≠ Idina.** The existing provider agent is a verification
   executor; Idina (the orchestrator) does not exist yet.
6. **Nitro default build target is Cloudflare Workers**, not Node — Cloud Run
   deployment needs a Node/container target.
```