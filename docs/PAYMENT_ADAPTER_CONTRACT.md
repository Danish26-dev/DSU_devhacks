# PAYMENT_ADAPTER_CONTRACT.md — KLAIM API ↔ Protocol Service

> **Purpose:** the exact HTTP contract that replaces `MockPaymentAdapter` in
> `backend/klaim-api` with a real call to Omkar's protocol service (x402 +
> GoPlausible + Algorand Testnet settlement).
>
> **Owners:** KLAIM API + adapter = Danish. Protocol service = Omkar.
>
> **Status today:** NOT wired. `backend/klaim-api` settles via
> `src/adapters/payment-adapter.ts` → `MockPaymentAdapter`, which returns
> `txId: "MOCK-<requestId>"`. The protocol service is not called. This document
> is the agreed spec to close that seam.

---

## 0. The seam (grounded in existing code)

The KLAIM API depends only on this interface (`backend/klaim-api/src/adapters/payment-adapter.ts`):

```ts
export interface SettlementInput { requestId: string; amountUsdc: number; }
export interface PaymentAdapter { settle(input: SettlementInput): Promise<PaymentState>; }
```

and `PaymentState` (`packages/types`):

```ts
interface PaymentState {
  status: "REQUIRED" | "SETTLED" | "FAILED";
  txId: string | null;          // real Algorand txId — never fabricated
  network: string | null;       // e.g. "algorand:testnet"
  asset: "USDC" | null;
  amount: number | null;
  explorerUrl: string | null;   // Lora URL when settled
  timestamp: string | null;     // ISO-8601
}
```

To integrate, Danish adds a `ProtocolPaymentAdapter implements PaymentAdapter`
whose `settle()` makes ONE HTTP call to the protocol service and maps the JSON
response into a `PaymentState`. Nothing else in the lifecycle changes — the
`SETTLEMENT_REQUIRED` invariant already blocks `VERIFYING` unless
`payment.status === "SETTLED"`.

```
klaim-api  (VerificationRequestService.settlePayment, at PAYMENT_REQUIRED)
    │  ProtocolPaymentAdapter.settle({ requestId, amountUsdc })
    ▼
protocol   POST {PROTOCOL_SERVICE_URL}/api/payments/settle
    │  x402 → GoPlausible verify+settle → Algorand Testnet
    ▼
klaim-api  maps response → PaymentState → PAYMENT_SETTLED | PAYMENT_FAILED
```

---

## 1. Endpoint (what Danish's adapter POSTs to Omkar)

```
POST {PROTOCOL_SERVICE_URL}/api/payments/settle
Content-Type: application/json
Authorization: Bearer {INTERNAL_SERVICE_TOKEN}
```

Request body:

```json
{
  "requestId": "REQ-AB12CD34",
  "amountUsdc": 0.01,
  "asset": "USDC",
  "network": "algorand:testnet"
}
```

- `requestId` — KLAIM's request id (`REQ-<id>`), used for idempotency + status lookup.
- `amountUsdc` — price for this verification (default 0.01).
- `asset` / `network` — fixed for the demo; sent so protocol validates, not guesses.

**Idempotency:** if the same `requestId` is POSTed twice, protocol MUST return the
same settled result (same `txId`) rather than paying twice.

---

## 2. Response (what Omkar's protocol service returns)

### 2.1 Success — settled on-chain (`200`)

```json
{
  "requestId": "REQ-AB12CD34",
  "status": "SETTLED",
  "txId": "3GERT4YDE7VASAP4IOUGRBZLUPAFLHCYDVFMAD6JMCVDZNWIONBA",
  "network": "algorand:testnet",
  "asset": "USDC",
  "amount": 0.01,
  "explorerUrl": "https://lora.algokit.io/testnet/transaction/3GERT4YDE7VASAP4IOUGRBZLUPAFLHCYDVFMAD6JMCVDZNWIONBA",
  "timestamp": "2026-09-18T10:00:20.000Z"
}
```

### 2.2 Failure — not settled (`402` or `200` with FAILED)

```json
{
  "requestId": "REQ-AB12CD34",
  "status": "FAILED",
  "txId": null,
  "reason": "settlement_not_confirmed",
  "network": "algorand:testnet",
  "asset": "USDC",
  "amount": 0.01,
  "explorerUrl": null,
  "timestamp": "2026-09-18T10:00:20.000Z"
}
```

### 2.3 Not configured (`503`)

```json
{ "error": "X402_NOT_CONFIGURED", "message": "provider wallet not set", "requestId": "REQ-AB12CD34" }
```

**Hard rule:** `txId` is present **only** when a real Algorand settlement occurred.
Never a placeholder. (This is why `MOCK-` exists on the KLAIM side today — so no
one mistakes a stub for real. The real service replaces it with a genuine txId.)

---

## 3. Field → PaymentState mapping (adapter side, Danish)

| Protocol response | → PaymentState |
|---|---|
| `status: "SETTLED"` | `status: "SETTLED"` |
| `status: "FAILED"` / `402` / `X402_NOT_CONFIGURED` | `status: "FAILED"` |
| `txId` | `txId` (or `null` on failure) |
| `network`, `asset`, `amount`, `explorerUrl`, `timestamp` | copied through 1:1 |

The adapter then hands the `PaymentState` back to `settlePayment()`, which runs
the existing state-machine transition: `SETTLED` → `PAYMENT_SETTLED`, anything
else → `PAYMENT_FAILED`. **No lifecycle code changes.**

Reference adapter skeleton (to add as `backend/klaim-api/src/adapters/protocol-payment-adapter.ts`):

```ts
export class ProtocolPaymentAdapter implements PaymentAdapter {
  constructor(private readonly baseUrl: string, private readonly token: string) {}
  async settle(input: SettlementInput): Promise<PaymentState> {
    const res = await fetch(`${this.baseUrl}/api/payments/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ ...input, asset: "USDC", network: "algorand:testnet" }),
    });
    const b = await res.json();
    if (b.status !== "SETTLED" || !b.txId) {
      return { status: "FAILED", txId: null, network: b.network ?? "algorand:testnet",
               asset: "USDC", amount: input.amountUsdc, explorerUrl: null, timestamp: b.timestamp ?? new Date().toISOString() };
    }
    return { status: "SETTLED", txId: b.txId, network: b.network, asset: "USDC",
             amount: input.amountUsdc, explorerUrl: b.explorerUrl ?? null, timestamp: b.timestamp };
  }
}
```

Then `src/index.ts` swaps `new MockPaymentAdapter()` for
`new ProtocolPaymentAdapter(env.PROTOCOL_SERVICE_URL, env.INTERNAL_SERVICE_TOKEN)`
when those env vars are set (keep the mock as the fallback for local dev).

---

## 4. Status read (optional, for polling / reconciliation)

Already sketched in `SERVICE_CONTRACTS.md §2.3`:

```
GET {PROTOCOL_SERVICE_URL}/api/payments/:requestId/status  → same shape as §2.1
```

Used if the KLAIM API wants to re-check settlement out of band. Not required for
the synchronous `settle()` path above.

---

## 5. Auth

`Authorization: Bearer {INTERNAL_SERVICE_TOKEN}` — a shared internal service
token (env on both sides). Payer mnemonic (`PAYER_PRIVATE_KEY`) never leaves the
protocol service; the KLAIM API never sees signing keys.

---

## 6. Open decisions (need Danish + Omkar to confirm)

1. **Deploy target for the protocol service** — Cloudflare Workers or Cloud Run?
   (Determines the public `PROTOCOL_SERVICE_URL` the adapter points at.)
2. **Sync vs async settle** — does `POST /api/payments/settle` block until the
   Algorand tx confirms and return the txId (simplest, assumed above), or return
   `202` immediately and require the KLAIM API to poll §4? Assumed **sync** here.
3. **Who signs the payment** — does the protocol service hold the payer wallet
   and settle server-side (assumed here, matches the existing
   `x402-client.server.ts` server-side signer), or is there an external payer?

---

## 7. What this does NOT change

- The KLAIM API stays the source of truth; protocol returns facts, not state.
- `NO SETTLEMENT → NO VERIFICATION` stays enforced in the state machine — a real
  `txId` is required before `VERIFYING`.
- ZKP / proof generation is a separate seam (`SERVICE_CONTRACTS.md §3`); `proofId`
  comes from the ZKP service after settlement, surfaced via
  `GET /api/verification-requests/:id/result`, not from this payment call.
```