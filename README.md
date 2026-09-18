# KLAIM V2

### Privacy-first identity verification platform/API

> Verify specific human claims — without receiving the user's underlying
> identity documents.

KLAIM lets applications, organizations, backend systems and AI agents verify
claims such as `identity_verified`, `age_over_18`, or `license_valid` about a
person. The user grants consent, KLAIM verifies the required credentials,
payment settles on-chain (x402 + Algorand), a privacy-preserving proof is
generated, and the verifier receives only the claim results + proof/payment
metadata — never raw documents.

Primary demo verifier: **QuickDrop**, a fictional delivery/gig platform.

---

## Architecture

```
FRONTEND            BACKEND                 SERVICES
────────            ───────                 ────────
quickdrop     ─┐                        ┌─  idina      (orchestrator)
identity-wallet├──►  klaim-api  ───────►├─  protocol   (x402 + Algorand)
               ┘   (source of truth)    ├─  zkp        (proofs)
                                        └─  mcp         (AI-agent interface)
```

- **Frontend** renders backend state; it never decides verification.
- **backend/klaim-api** owns the verification-request lifecycle, request IDs,
  the state machine, consent/payment/verification state, and results. It is the
  single source of truth.
- **Services** perform specialized functions and are called by the backend.

The most important invariant is **NO SETTLEMENT → NO VERIFICATION**: a request
can only be verified after a confirmed on-chain settlement. See
[`docs/STATE_MACHINE.md`](docs/STATE_MACHINE.md).

---

## Repository structure

```
KLAIM/
├── frontend/
│   ├── quickdrop/         verifier client                    (placeholder)
│   └── identity-wallet/   user consent PWA                   (placeholder)
├── backend/
│   └── klaim-api/         central API + state machine        (implemented)
├── services/
│   ├── idina/             orchestrator                       (placeholder)
│   ├── protocol/          x402 + Algorand settlement         (placeholder)
│   ├── zkp/               proof generation                   (placeholder)
│   └── mcp/               AI-agent interface                 (placeholder)
├── packages/
│   ├── types/             @klaim/types — domain + state machine
│   ├── contracts/         @klaim/contracts — API contracts
│   └── utils/             @klaim/utils — shared helpers
├── docs/                  architecture + API + migration docs
├── infra/                 docker/ + gcp/ deployment boundaries (placeholder)
├── .env.example
├── bun.lock · bunfig.toml · package.json (workspace root)
└── README.md
```

This is a **Bun workspace monorepo**. Workspaces: `packages/*`, `backend/*`,
`services/*`, `frontend/*`.

---

## Implementation status

| Component | Status |
|---|---|
| `@klaim/types`, `@klaim/contracts`, `@klaim/utils` | implemented |
| `backend/klaim-api` verification lifecycle + 4 REST endpoints | implemented |
| State machine + `NO SETTLEMENT → NO VERIFICATION` invariant | implemented + tested |
| Payment / verification | **mock adapters** (dev-only), real services pending |
| `services/{idina,protocol,zkp,mcp}` | placeholders (not implemented) |
| `frontend/{quickdrop,identity-wallet}` | placeholders (not implemented) |
| Deployment (`infra/`) | not implemented |

Implemented API (see [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)):

```
POST /api/verification-requests
GET  /api/verification-requests/:id
POST /api/verification-requests/:id/consent
GET  /api/verification-requests/:id/result
GET  /health
```

Mock lifecycle triggers (only when `KLAIM_DEV_ADAPTERS=true`):

```
POST /api/dev/verification-requests/:id/settle
POST /api/dev/verification-requests/:id/verify
```

---

## Development

Requires [Bun](https://bun.sh).

```bash
bun install

# type-check every workspace
bun run typecheck

# run all workspace tests
bun run test

# run the backend
bun run --filter '@klaim/klaim-api' start        # or: dev (watch)
```

Environment variables are documented in [`.env.example`](.env.example).

---

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — target architecture
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — public API
- [`docs/SERVICE_CONTRACTS.md`](docs/SERVICE_CONTRACTS.md) — inter-service contracts
- [`docs/STATE_MACHINE.md`](docs/STATE_MACHINE.md) — lifecycle + invariant
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Cloud Run plan
- [`docs/TEAM_OWNERSHIP.md`](docs/TEAM_OWNERSHIP.md) — ownership
- [`docs/MIGRATION_PLAN.md`](docs/MIGRATION_PLAN.md) — migration from the previous system
- [`docs/EXISTING_SYSTEM.md`](docs/EXISTING_SYSTEM.md) — reference: the previous implementation

---

## License

MIT
