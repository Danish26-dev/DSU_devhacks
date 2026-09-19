# KLAIM

Pay-per-use, privacy-preserving **human** identity verification for AI agents.
Humans hold the credentials; AI agents are the consumers that request and pay
for a single verified claim — never a document, never raw PII.

## Architecture

```text
Verifier AI agent (Claude / GPT / Strands / custom)
        │  MCP (JSON-RPC over HTTP)
        ▼
KLAIM MCP server            POST /api/public/mcp        (agent key auth)
        │  tool: verify_human_age { did }
        ▼
KLAIM Verification API      POST /api/v1/verify/age
        │
        ├─► x402 middleware  (@x402/core + @x402/avm, exact scheme)
        │        │ 402 Payment Required  ← no payment
        │        ▼ X-PAYMENT supplied
        │   GoPlausible facilitator  →  Algorand Testnet settlement
        │        │  real transaction id
        ▼        ▼
Strands provider agent  (check_did → check_credential → check_claim
        │                → generate_zk_proof → verify_zk_proof)
        ▼
zkpService (engine=local, swappable to Midnight)
        ▼
200  { verified, claim, proof, payment: { txId, explorerUrl } }
```

Protected verification logic **never** runs before settlement confirms.

## Local setup

```bash
bun install
cp .env.example .env      # fill in the values you have
npm run dev               # http://localhost:8080
```

### Environment variables

See [`.env.example`](./.env.example). Key ones:

| Variable | Purpose |
| --- | --- |
| `PROVIDER_WALLET_ADDRESS` | Algorand address that receives verification payments. Without it the API answers `X402_NOT_CONFIGURED`. |
| `FACILITATOR_URL` | GoPlausible facilitator (default `https://facilitator.goplausible.xyz`). |
| `NETWORK` | `algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDe` (Testnet CAIP-2). |
| `USDC_ASSET_ID` | `10458941` (Testnet USDC ASA). |
| `VERIFICATION_PRICE` | USDC per verification (default `0.01`). |
| `PAYER_WALLET_ADDRESS` / `PAYER_PRIVATE_KEY` | Test-client wallet only. Server never reads these. |
| `KLAIM_AGENT_ID` / `KLAIM_AGENT_KEY` | Agent credential provisioned in the Verifier console. |
| `STRANDS_MODEL_ID` | Enables the Strands provider-agent runtime (otherwise deterministic). |
| `DIGILOCKER_*` | Pending official partner credentials. |
| `MIDNIGHT_PROVER_URL` | Switches zkpService from the local proof adapter to Midnight. |

**Private keys never leave the backend/test client.** They are not committed,
not returned by any API, not sent to the frontend, not stored in localStorage,
not shown in the UI, and not part of any MCP configuration.

### Testnet wallet setup

1. Create an Algorand Testnet account (Pera Wallet in Testnet mode, or algosdk).
2. Fund ALGO: <https://bank.testnet.algorand.network/>
3. Opt the account in to USDC (ASA `10458941`).
4. Get Testnet USDC: <https://faucet.circle.com/> (choose Algorand Testnet).
5. Check balances on <https://lora.algokit.io/testnet>.

### MCP setup

Provision an agent key in **Verifier → Agents**, then:

```bash
claude mcp add --transport http klaim https://<your-host>/api/public/mcp \
  --header "X-KLAIM-Agent-Id: agent_..." \
  --header "Authorization: Bearer klm_..."
```

Tool contract:

```jsonc
// verify_human_age  { "did": "did:identipi:demo-user-001" }
{
  "verified": true,
  "claim": "age_over_18",
  "proof": { "verified": true, "engine": "local" },
  "payment": { "status": "settled", "network": "algorand:...", "txId": "..." }
}
```

No DOB, Aadhaar, PAN, address, document or full VC is ever returned.

## Commands

```bash
npm run dev               # dev server
npm run test:mcp          # Local MCP Test Client → MCP → 402 path
npm run test:x402         # real 402 → sign → GoPlausible → Algorand → 200
npm run test:integration  # MCP → x402 → provider agent integration test
npm run test              # all tests
```

`npm run test:x402` exits with `X402_NOT_CONFIGURED` (and names the missing
variable) rather than falling back to a mock payment.

## Health

```bash
curl http://localhost:8080/api/health
```

Reports actual runtime configuration for `mcp`, `x402`, `facilitator`,
`algorand`, `providerAgent`, `zkp`, `digilocker`.

## Honesty rules baked into this codebase

- 402 challenges are produced by the official x402 SDK, never hand-written.
- A transaction id exists only when GoPlausible confirms a settlement.
- Proofs are labelled `engine: local` until `MIDNIGHT_PROVER_URL` is set — the
  app never claims "Midnight ZK verified".
- DigiLocker stays `pending_credentials` until official partner credentials
  exist; the demo human (`did:identipi:demo-user-001`) is labelled
  **Demo Credential** and is never presented as real DigiLocker data.
- The in-app terminal is labelled **Local MCP Test Client**, not Claude.

## Real Algorand Testnet transaction

_To be added here once a funded Testnet wallet completes `npm run test:x402`._
