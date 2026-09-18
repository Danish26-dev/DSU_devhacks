# DEPLOYMENT.md — KLAIM V2

> Target platform: **Google Cloud Run**. Code boundaries are hard; **deployment
> may be consolidated** to reduce hackathon risk. Every deployable boundary has a
> Dockerfile.

---

## 1. Deployable units

| Unit | Source | Type | Public? |
|---|---|---|---|
| `klaim-api` | `backend/klaim-api` | TanStack Start (Nitro, **Node/container target**) | yes (verifiers, wallet, mcp) |
| `idina` | `services/idina` | Node HTTP service (has Dockerfile; Cloud Run `klaim-idina`) | **internal only** |
| `protocol` | `services/protocol` | Node HTTP service (x402 + algosdk) | internal |
| `zkp` | `services/zkp` | Node HTTP service | internal |
| `mcp` | `services/mcp` | Node HTTP service (MCP Streamable HTTP) | yes (Claude/agents) |
| `quickdrop` | `frontend/quickdrop` | static/Vite (served or on CDN) | yes |
| `identity-wallet` | `frontend/identity-wallet` | static/Vite PWA | yes |

### Consolidation options (allowed)
- `klaim-api` + `idina` in one Cloud Run service (Idina mounted as internal
  routes) to avoid a cross-service network hop for the orchestrator.
- `protocol` + `zkp` together (both Node, both internal).
- Frontends served as static assets (Cloud Run, Firebase Hosting, or a bucket+CDN).

**Regardless of consolidation, the code stays in separate workspaces.** No
consolidation may collapse a code boundary.

---

## 2. Build target note (important)

The current Nitro build defaults to a **Cloudflare Workers** target (see
`vite.config.ts` comment). Cloud Run needs a **Node server** target. For
`klaim-api` (and any TanStack-based deployable) the Nitro preset must be set to a
Node/server build in the Dockerfile build step. Pure services (`idina`,
`protocol`, `zkp`, `mcp`) are plain Node and build normally.

---

## 3. Dockerfile shape (per unit)

Node service (idina / protocol / zkp / mcp):
```dockerfile
FROM node:22-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages ./packages
COPY services/<svc> ./services/<svc>
RUN corepack enable && npm ci --workspaces --include-workspace-root
RUN npm run -w services/<svc> build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "services/<svc>/dist/server.js"]
```

`klaim-api` (TanStack Start, Node preset): same shape but building the TanStack
app with a Node Nitro preset and running its server entry. Frontends: build to
static and serve with a minimal static server or host on a CDN.

Cloud Run listens on `$PORT` (default 8080). All units read `PORT` from env.

---

## 4. Environment / configuration

Service URLs are **always** from env — never hardcoded Cloud Run hostnames.

```
# service discovery
KLAIM_API_URL=
IDINA_URL=
PROTOCOL_SERVICE_URL=
ZKP_SERVICE_URL=
MCP_SERVICE_URL=

# frontends
VITE_KLAIM_API_URL=
VITE_DEMO_DID=did:identipi:demo-user-001

# internal service auth
INTERNAL_SERVICE_TOKEN=

# x402 / Algorand (protocol) — provider (receives), payer (server-side signer)
PROVIDER_WALLET_ADDRESS=
FACILITATOR_URL=https://facilitator.goplausible.xyz
NETWORK=algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=
USDC_ASSET_ID=10458941
VERIFICATION_PRICE=0.01
PAYER_WALLET_ADDRESS=
PAYER_PRIVATE_KEY=            # 25-word mnemonic — protocol service only, never exposed

# zkp
MIDNIGHT_PROVER_URL=          # absent → engine=local

# storage
FIRESTORE_PROJECT_ID=         # deployed multi-service use
# (in-memory repo used only for local single-instance dev)

# provider agent (optional Strands)
STRANDS_MODEL_ID=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1

# digilocker (pending partner creds)
DIGILOCKER_CLIENT_ID=
DIGILOCKER_CLIENT_SECRET=
DIGILOCKER_REDIRECT_URI=

# CORS allowlist (klaim-api)
ALLOWED_ORIGINS=              # QuickDrop + Identity Wallet origins, comma-separated
```

Secrets (`PAYER_PRIVATE_KEY`, `INTERNAL_SERVICE_TOKEN`, AWS, DigiLocker) go in
**Cloud Run secrets / Secret Manager**, never in the image or the repo.

---

## 5. Storage

- Local dev: in-memory `VerificationRepository` (single instance only).
- Deployed: **Firestore** (collections in `MIGRATION_PLAN`/`ARCHITECTURE`). Cloud
  Run scales to multiple instances and cold-starts, so the request lifecycle
  (which spans the consent gap and multiple services) must not rely on
  per-instance memory.

---

## 6. Local development (docker-compose)

`docker-compose.yml` at the root brings up all units with `localhost` URLs:
```
klaim-api        :8080
idina            :8081
protocol         :8082
zkp              :8083
mcp              :8084
quickdrop        :5173
identity-wallet  :5174
```
Ports are indicative; each service reads `PORT`. Service URLs are injected so the
compose network mirrors the Cloud Run env wiring.

---

## 7. Deploy order

1. `protocol`, `zkp` (leaf services).
2. `klaim-api` (+ `idina`, consolidated or separate).
3. `mcp` (needs `KLAIM_API_URL`).
4. `quickdrop`, `identity-wallet` (need `VITE_KLAIM_API_URL`).
5. Set CORS `ALLOWED_ORIGINS` on `klaim-api` to the deployed frontend origins.

---

## 8. CORS & auth at the edge

- `klaim-api` restricts CORS to the QuickDrop + Identity Wallet origins
  (env allowlist). No wildcard in production.
- `mcp` is public but authenticates every call with the `klm_` agent key.
- Internal services reject calls lacking `INTERNAL_SERVICE_TOKEN` / valid
  Cloud Run identity.
```