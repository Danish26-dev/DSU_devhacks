# STATE_MACHINE.md — KLAIM V2 verification lifecycle

The canonical verification request state machine. Implemented in
`backend/klaim-api/src/domain/verification-state-machine.ts`; status strings are
defined once in `packages/types` (`VerificationRequestStatus`).

## States

Happy path:
```
CREATED
  → PENDING_CONSENT
    → CONSENT_GRANTED
      → PAYMENT_REQUIRED
        → PAYMENT_SETTLED
          → VERIFYING
            → PROOF_GENERATED
              → VERIFIED
```

Failure / terminal branches:
```
PENDING_CONSENT   → DENIED
PAYMENT_REQUIRED  → PAYMENT_FAILED
VERIFYING         → CREDENTIAL_INVALID
VERIFYING         → VERIFICATION_FAILED
```

Terminal states (no outgoing transitions): `VERIFIED`, `DENIED`,
`PAYMENT_FAILED`, `CREDENTIAL_INVALID`, `VERIFICATION_FAILED`.

## Transition table (the only legal edges)

| From | Allowed → To |
|---|---|
| CREATED | PENDING_CONSENT |
| PENDING_CONSENT | CONSENT_GRANTED, DENIED |
| CONSENT_GRANTED | PAYMENT_REQUIRED |
| PAYMENT_REQUIRED | PAYMENT_SETTLED, PAYMENT_FAILED |
| PAYMENT_SETTLED | VERIFYING |
| VERIFYING | PROOF_GENERATED, CREDENTIAL_INVALID, VERIFICATION_FAILED |
| PROOF_GENERATED | VERIFIED |
| VERIFIED / DENIED / PAYMENT_FAILED / CREDENTIAL_INVALID / VERIFICATION_FAILED | (none — terminal) |

Any transition not in this table is rejected with
`INVALID_STATE_TRANSITION` (HTTP 409). Examples that MUST fail:
`PENDING_CONSENT → VERIFIED`, `PAYMENT_REQUIRED → VERIFIED`,
`CREATED → VERIFIED`, `CONSENT_GRANTED → VERIFIED`,
`VERIFYING → PAYMENT_SETTLED`.

## The invariant — NO SETTLEMENT → NO VERIFICATION

A request may enter `VERIFYING`, `PROOF_GENERATED`, or `VERIFIED` **only when**
`payment.status === "SETTLED"`.

Enforced two ways:
1. **Structurally** — the table only allows `VERIFYING` from `PAYMENT_SETTLED`.
2. **Defensively** — `assertTransition` re-checks `payment.status === "SETTLED"`
   before any settlement-gated transition and throws `SETTLEMENT_REQUIRED`
   (HTTP 409) otherwise. The backend never trusts frontend state, request-body
   status, payment intent, a 402 acknowledgement, or a client-supplied txId.

Verified in tests: attempting verification from `PAYMENT_REQUIRED` (or earlier)
fails and the request does **not** advance.

## Mapping to endpoints (Phase 2)

| Transition | Trigger |
|---|---|
| CREATED → PENDING_CONSENT | `POST /api/verification-requests` |
| PENDING_CONSENT → CONSENT_GRANTED → PAYMENT_REQUIRED | `POST /api/verification-requests/:id/consent` `{ "ALLOW" }` |
| PENDING_CONSENT → DENIED | `POST /api/verification-requests/:id/consent` `{ "DENY" }` |
| PAYMENT_REQUIRED → PAYMENT_SETTLED / PAYMENT_FAILED | mock `POST /api/dev/verification-requests/:id/settle` (→ services/protocol later) |
| PAYMENT_SETTLED → VERIFYING → PROOF_GENERATED → VERIFIED | mock `POST /api/dev/verification-requests/:id/verify` (→ Idina + services/zkp later) |

Dev trigger endpoints are gated by `KLAIM_DEV_ADAPTERS=true` and never mounted in
production. They invoke server-side mock adapters only — clients cannot inject a
payment status, txId, or claim result.

## Idina orchestration mapping

The Idina orchestrator (`services/idina`) drives the middle of the lifecycle
through its three harnesses, and its outcomes map onto these statuses:

| Idina result | Lifecycle status |
|---|---|
| `DENIED` (consent not granted) | `DENIED` |
| `CREDENTIAL_INVALID` | `CREDENTIAL_INVALID` |
| `PAYMENT_FAILED` (no settlement) | `PAYMENT_FAILED` |
| `VERIFICATION_FAILED` (proof failed) | `VERIFICATION_FAILED` |
| `COMPLETED` (proof + txId) | `PROOF_GENERATED → VERIFIED` |

Idina enforces the same invariant internally: proof generation is unreachable
unless the payment harness returns a real `SETTLED` txId.
