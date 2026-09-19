# KLAIM Protocol Service — Cloud Run container (Option B in DEPLOY.md)
#
# Builds the TanStack Start app with Nitro's node_server preset (instead of the
# default cloudflare-module) so it runs as a standard Node HTTP server, then
# runs the Nitro server entry. Cloud Run injects PORT (defaults to 8080).
#
# The project is Bun-native (bun.lock is the authoritative lockfile), so the
# build stage uses the official Bun image + `bun install`. The runtime stage
# runs the compiled Nitro node server with plain Node.
#
# Build from the repo root:
#   docker build -t klaim-protocol .
# or let Cloud Run build it:
#   gcloud run deploy klaim-protocol --source . ...

# ---- build stage ---------------------------------------------------------
FROM oven/bun:1 AS build
WORKDIR /app

# Install deps first (better layer caching). Use the Bun lockfile.
COPY package.json bun.lock ./
RUN bun install

# Copy source and build with the Node preset
COPY . .
ENV NITRO_PRESET=node_server
RUN bun run build

# ---- runtime stage -------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run provides PORT; default to 8080 for local runs.
ENV PORT=8080

# The node_server preset emits a self-contained server in .output/
COPY --from=build /app/.output ./.output

EXPOSE 8080

# Nitro node_server entry
CMD ["node", ".output/server/index.mjs"]
