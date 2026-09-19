# KLAIM Protocol Service — Demo Navigation Map (Omkar)

Fast lookup for judges. "If they ask about X → open this file."
Do NOT rename route files: their paths ARE the live API URLs.

Live service: https://klaim-protocol-atnwarjo4q-el.a.run.app
(alias: https://klaim-protocol-14759700171.asia-south1.run.app)

---

## 1. "Show me the x402 payment / how you settle on-chain"
→ `src/lib/klaim/server/x402.server.ts`
   - Real @x402/core + @x402/avm, GoPlausible facilitator, Algorand Testnet USDC.
   - `requirePayment()` = the 402 gate. `settle()` = real settlement, returns real txId.
   - Nothing fabricates a txId; unconfigured → X402_NOT_CONFIGURED.

→ `src/lib/klaim/server/x402-client.server.ts`
   - Server-side payer signing (payer key never leaves the server).

## 2. "Show me the NO SETTLEMENT → NO VERIFICATION invariant"
→ `src/lib/klaim/server/verify.server.ts`
   - `handleVerifyClaim()`: auth → 402 → settle() → ONLY THEN provider agent + ZKP.
   - Provider agent / proof literally cannot run before settlement confirms.

## 3. "Show me the payment adapter endpoint the KLAIM API calls"
→ `src/routes/api/payments/settle.ts`   → POST /api/payments/settle
   - Internal-token auth, idempotent on requestId, returns {status:"SETTLED", txId,...}.
→ `src/routes/api/payments/charge.ts`   → POST /api/payments/charge
   - Internal payment-only x402 route the settle flow pays.
→ `src/routes/api/payments/$requestId.status.ts` → GET /api/payments/:id/status

## 4. "Show me the ZKP / privacy-preserving proof"
→ `src/lib/klaim/server/zkp.server.ts`
   - Honest engine label: "local" (Midnight-ready via MIDNIGHT_PROVER_URL). Never faked.
   - Only booleans + proof id leave; NOT_DISCLOSED lists what stays private.
→ `src/routes/api/zkp/generate.ts`      → POST /api/zkp/generate
   - Batch { claims[], credentialRefs?, did } + single shape; DID-fallback resolution.

## 5. "Show me the MCP server / how Claude connects"
→ `src/lib/klaim/server/mcp.server.ts`
   - Real MCP JSON-RPC 2.0, tool registry: verify_human_age, verify_driving_licence,
     verify_identity, get_verification_status. NO payment/zk logic here (thin interface).
→ `src/routes/api/public/mcp.ts`        → POST /api/public/mcp
   - Public MCP endpoint + server-side auto-pay on 402.

## 6. "Show me agent authentication / API keys"
→ `src/lib/klaim/server/store.server.ts`
   - klm_ keys minted server-side, SHA-256 hashed, revocable, masked. Never logged.
   - Also: the seeded demo credential (did:identipi:demo-user-001) + transaction ledger.

## 7. "Show me the claim definitions / spelling boundary"
→ `src/lib/klaim/server/claims.ts`
   - Contract claims: identity_verified, age_over_18, license_valid.
   - Maps internal licence_valid ↔ contract license_valid at one boundary.

## 8. "Show me the provider verification pipeline"
→ `src/lib/klaim/server/provider-agent.server.ts`
   - check_did → check_credential → check_claim → generate_zk_proof → verify_zk_proof.
   - Strands runtime + deterministic fallback. No raw PII leaves.

## 9. "Show me the per-claim verify endpoints"
→ `src/routes/api/v1/verify/age.ts`      → POST /api/v1/verify/age
→ `src/routes/api/v1/verify/licence.ts`  → POST /api/v1/verify/licence
→ `src/routes/api/v1/verify/identity.ts` → POST /api/v1/verify/identity

## 10. "Show me config / secrets handling / deployment"
→ `src/lib/klaim/server/env.server.ts`  - env reads, integration status, internal-token auth.
→ `.env.example`                        - documented vars (no secrets committed).
→ `Dockerfile`                          - Cloud Run container (Bun build → Node runtime).
→ `DEPLOY.md`                           - deploy runbook (Workers + Cloud Run).

---

## Live demo proof (open in browser)
- Claude → MCP settlement txId:
  https://lora.algokit.io/testnet/transaction/FYBNQME56OEZ6SNH2NN6MCX7OUN5W3NLJBE77MYHYBOHI7PDSHOQ
- Settle-endpoint txId:
  https://lora.algokit.io/testnet/transaction/7SJNS6VFD7J4FHIXMDFLVK3DFS4U2VWOHP4PKBPK3AQGM4PL7YQQ

## The one-line architecture
QuickDrop / Claude → KLAIM API → Idina → [ x402+Algorand · ZKP ] → proof → result
Invariant: NO SETTLEMENT → NO VERIFICATION.
