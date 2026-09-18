# backend/

- **klaim-api/** — the central KLAIM API and **source of truth** (Danish).

Responsibilities:
- verification request creation + request IDs
- the verification state machine and all state transitions
- consent state, payment state, verification results, audit metadata
- coordination with the services (Idina, protocol, ZKP, MCP)
- the public REST API consumed by the frontends

The backend owns the `NO SETTLEMENT → NO VERIFICATION` invariant. See
`docs/API_CONTRACT.md` and `docs/ARCHITECTURE.md`.

> Phase 0 status: destination directory only. No implementation yet.
