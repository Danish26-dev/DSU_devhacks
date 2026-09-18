# packages/

Shared, versioned-together packages. No business-specific UI code.

- **types/** — canonical domain types and the verification state machine
  (`ClaimType`, `VerificationStatus`, `VerificationRequest`, `VerificationResult`,
  `ConsentDecision`, `PaymentStatus`, `ProofResult`). Status strings live here and
  are never duplicated across services.
- **contracts/** — REST + service-to-service request/response schemas (zod),
  using the repository's existing validation approach.
- **utils/** — genuinely shared, non-domain utilities only (request IDs, hashing,
  HTTP helpers). Not a dumping ground.

See `docs/ARCHITECTURE.md` and `docs/SERVICE_CONTRACTS.md`.

> Phase 0 status: destination directories only. No shared code extracted yet.
