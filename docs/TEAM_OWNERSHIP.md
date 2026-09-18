# TEAM_OWNERSHIP.md — KLAIM V2

> Who owns what. Ownership is by code boundary, so work can proceed in parallel
> with clear interfaces (`packages/contracts`, `SERVICE_CONTRACTS.md`).

---

## Owners

### Danish — Backend, Idina, Identity Wallet, integration
| Area | Path |
|---|---|
| Central backend / source of truth | `backend/klaim-api/` |
| Orchestrator | `services/idina/` |
| User consent PWA | `frontend/identity-wallet/` |
| Verification state machine + storage abstraction | `backend/klaim-api/src/{state,repository}/` |
| Overall integration + GCP coordination | `infra/`, `docker-compose.yml`, deploy wiring |

Danish owns the canonical state machine and the `NO SETTLEMENT → NO VERIFICATION`
enforcement point, so cross-service transition rules land in one place.

### Omkar — Protocol, ZKP, MCP, Claude integration
| Area | Path |
|---|---|
| x402 + GoPlausible + Algorand + USDC settlement | `services/protocol/` |
| Proof generation (local + Midnight boundary) | `services/zkp/` |
| MCP server + tools | `services/mcp/` |
| Claude / AI-agent integration | `services/mcp/` |
| Verification executor (reused) | `provider-agent` code (executor, not Idina) |

Omkar owns the payment/settlement truth and the proof engine — the services that
produce the facts the backend records.

### Monika — QuickDrop
| Area | Path |
|---|---|
| Verifier frontend | `frontend/quickdrop/` |
| QuickDrop ↔ KLAIM API integration | `frontend/quickdrop/src/` (API client) |
| QuickDrop deployment | `frontend/quickdrop/Dockerfile` + Cloud Run |

Monika's frontend talks **only** to `klaim-api` and never decides verification.

---

## Shared (coordinated, changed together)

| Area | Path | Coordination |
|---|---|---|
| Domain types + state machine | `packages/types/` | Danish leads; Omkar + Monika consume |
| REST + service schemas | `packages/contracts/` | Danish leads; all consume |
| Shared utilities | `packages/utils/` | anyone; keep minimal |
| Docs | `docs/` | all |
| Legacy monolith | `legacy/existing-klaim/` | preserve; no active feature work |

---

## Interfaces between owners

| Boundary | Owners | Contract source |
|---|---|---|
| QuickDrop → klaim-api | Monika ↔ Danish | `API_CONTRACT.md` |
| Identity Wallet → klaim-api | Danish | `API_CONTRACT.md` |
| klaim-api ↔ Idina | Danish | `SERVICE_CONTRACTS.md §1` |
| Idina ↔ Protocol | Danish ↔ Omkar | `SERVICE_CONTRACTS.md §2` |
| Idina ↔ ZKP | Danish ↔ Omkar | `SERVICE_CONTRACTS.md §3` |
| MCP ↔ klaim-api | Omkar ↔ Danish | `SERVICE_CONTRACTS.md §4` |

Rule: a change to any cross-owner boundary is made in `packages/contracts` first,
agreed by both owners, then implemented on each side.

---

## Working agreement

- Branch: `restructure/klaim-v2`; `main` stays the safe checkpoint.
- No history rewrites (Lovable sync).
- Keep the branch in a working state (legacy endpoints stay green).
- Land the `PAYMENT_NOT_SETTLED → verification blocked` test before wiring the
  full happy path.
```