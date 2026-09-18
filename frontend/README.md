# frontend/

User-facing KLAIM V2 applications.

- **quickdrop/** — the QuickDrop verifier application (Monika). Delivery-partner
  onboarding, creates verification requests, shows status and the final result.
- **identity-wallet/** — the user's KLAIM identity/consent PWA (Danish). Shows
  incoming requests and requested claims, offers Allow/Deny.

Rules:
- Frontends consume the backend contracts (`packages/contracts`) and talk **only**
  to the KLAIM API (`backend/klaim-api`).
- Frontends must **not** implement verification logic and must never independently
  decide whether a user is verified. Backend state is authoritative.
- Frontends must never receive or display raw identity documents.

> Phase 0 status: destination directories only. No implementation yet.
