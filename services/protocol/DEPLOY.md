# KLAIM Protocol Service — Deployment

This service is the KLAIM **protocol layer** (x402 + Algorand settlement + ZKP + MCP).
It exposes, among others, the payment adapter endpoint the KLAIM API calls:

```
POST /api/payments/settle        (internal-token auth — real Algorand settlement)
POST /api/payments/charge        (internal payment-only x402 route)
GET  /api/payments/:id/status
POST /api/zkp/generate
POST /api/v1/verify/{age,licence,identity}
POST /api/public/mcp             (MCP for AI agents)
GET  /api/health
```

Built with TanStack Start → Nitro. Two deploy targets are supported; pick one.

---

## Required production environment variables

Set these as **secrets** on whichever platform (never commit them):

| Var | Purpose |
|-----|---------|
| `PROVIDER_WALLET_ADDRESS` | Receives verification payments |
| `PAYER_WALLET_ADDRESS` | Pays (server-side signing) |
| `PAYER_PRIVATE_KEY` | 25-word mnemonic — **secret**, stays server-side only |
| `INTERNAL_SERVICE_TOKEN` | Shared secret with the KLAIM API for `/api/payments/settle` — **secret** |
| `FACILITATOR_URL` | `https://facilitator.goplausible.xyz` |
| `NETWORK` | `algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=` |
| `USDC_ASSET_ID` | `10458941` |
| `VERIFICATION_PRICE` | `0.01` |

Generate a strong production `INTERNAL_SERVICE_TOKEN` and share it with the
KLAIM API owner **out-of-band** (not chat). Both services must hold the same value.

---

## Option A — Cloudflare Workers (current default build target)

The build already emits a Workers module (`nitro.json` preset = `cloudflare-module`).

```bash
# 1. Build (default preset is cloudflare-module)
npm run build

# 2. Authenticate wrangler (one-time)
npx wrangler login

# 3. Set secrets (repeat for each secret var)
npx wrangler secret put PAYER_PRIVATE_KEY
npx wrangler secret put INTERNAL_SERVICE_TOKEN
npx wrangler secret put PROVIDER_WALLET_ADDRESS
npx wrangler secret put PAYER_WALLET_ADDRESS
# Non-secret vars can go in wrangler vars or secrets too:
npx wrangler secret put FACILITATOR_URL
npx wrangler secret put NETWORK
npx wrangler secret put USDC_ASSET_ID
npx wrangler secret put VERIFICATION_PRICE

# 4. Deploy from the build output
cd .output/server && npx wrangler deploy
```

Result URL: `https://<name>.<account>.workers.dev` →
`PROTOCOL_SERVICE_URL = https://<name>.<account>.workers.dev`

Notes:
- `nodejs_compat` is already enabled in the generated `wrangler.json` (algosdk needs it).
- Workers is the fastest path since it's the current build output.

---

## Option B — Google Cloud Run (container)

Build with the Node preset, then containerize. Uses the `Dockerfile` in this repo.

```bash
# Build + deploy in one step (Cloud Run builds the image from the Dockerfile):
gcloud run deploy klaim-protocol \
  --source . \
  --region <region> \
  --allow-unauthenticated \
  --set-env-vars FACILITATOR_URL=https://facilitator.goplausible.xyz,NETWORK=algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=,USDC_ASSET_ID=10458941,VERIFICATION_PRICE=0.01,PROVIDER_WALLET_ADDRESS=<addr>,PAYER_WALLET_ADDRESS=<addr> \
  --set-secrets PAYER_PRIVATE_KEY=payer-mnemonic:latest,INTERNAL_SERVICE_TOKEN=internal-token:latest
```

The `Dockerfile` builds with `NITRO_PRESET=node_server` and runs the Node server
entry on `PORT` (Cloud Run injects `PORT`, defaults to 8080).

Store `PAYER_PRIVATE_KEY` and `INTERNAL_SERVICE_TOKEN` in **Secret Manager**
(referenced via `--set-secrets`), not plain env.

---

## After deploy (either option)

1. Smoke test:
   ```bash
   curl https://<PROTOCOL_SERVICE_URL>/api/health
   # expect { "x402": true, "facilitator": true, "algorand": true, "mcp": true, ... }
   ```
2. Hand the KLAIM API owner: `PROTOCOL_SERVICE_URL` + `INTERNAL_SERVICE_TOKEN` (out-of-band).
3. They set both in their KLAIM API env → their `ProtocolPaymentAdapter` goes live
   (mock stays default until both are set).
4. End-to-end: QuickDrop → KLAIM API → `/api/payments/settle` → real Algorand txId.
