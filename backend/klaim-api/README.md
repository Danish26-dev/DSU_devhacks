# @klaim/klaim-api

The central KLAIM V2 backend and **source of truth** for the verification
lifecycle. Owns verification requests, request IDs, request/consent/payment/
verification state, and the final result. Frontends and services never own this
state.

## Phase 1 scope

Foundation only:
- Framework-free HTTP app on Web `Request`/`Response` (runs on Bun and any
  Node/Cloud Run container). Not a copy of the legacy TanStack/Nitro routes.
- `GET /health` → `{ "status": "ok", "service": "klaim-api" }`.
- `VerificationRepository` interface + in-memory implementation (Firestore later,
  without changing handlers).
- Domain model (`domain/verification-request.ts`) kept separate from HTTP.

The verification-request endpoints and the state machine
(`CREATED → … → VERIFIED`) are implemented in a later phase.

## Layout

```
src/
├── index.ts                      entry point (Bun.serve)
├── app.ts                        request router + dependency injection
├── config/                       env-driven config (PORT, ALLOWED_ORIGINS)
├── routes/health.ts              GET /health
├── domain/verification-request.ts   domain entity + constructor
└── repositories/
    ├── verification-repository.ts               interface
    └── in-memory-verification-repository.ts      Phase 1 implementation
tests/
└── health.test.ts
```

## Scripts

```
bun run dev        # watch mode
bun run start      # run once
bun run typecheck  # tsc --noEmit
bun test           # run tests
```

## Dependencies

Workspace packages only: `@klaim/types`, `@klaim/contracts`, `@klaim/utils`.
No payment/ZKP/identity-provider logic lives here — those are separate services
called by the backend in later phases.
