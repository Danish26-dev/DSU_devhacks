# backend/klaim-api — container image (Cloud Run friendly).
#
# The app is Bun-native (uses Bun.serve), so it runs on the official Bun image.
# Build context is the REPO ROOT (workspace deps @klaim/* are resolved via the
# Bun workspace):  built via cloudbuild.klaim-api.yaml (docker build -f ... .)
#
# Single stage on purpose: Bun workspaces resolve @klaim/* by symlinking into
# node_modules against the ACTUAL package folders. Splitting install (deps
# stage) from the source copy can leave those workspace symlinks pointing at
# paths the final image lays out differently — which produced
# "Cannot find module '@klaim/utils'" at runtime. Copying the full workspace
# THEN installing keeps the symlinks valid.
FROM oven/bun:1
WORKDIR /app

# Full workspace manifests + all workspace package sources, so `bun install`
# can create correct @klaim/* symlinks.
COPY package.json bun.lock bunfig.toml ./
COPY packages ./packages
COPY backend/klaim-api ./backend/klaim-api

# Not using --frozen-lockfile: the committed bun.lock has drifted from the root
# package.json (an old `overrides` entry). A plain install regenerates it and
# links the workspace packages. Restore --frozen once bun.lock is regenerated.
RUN bun install

ENV NODE_ENV=production
# Cloud Run provides PORT; default to 8080.
ENV PORT=8080
# Production safety: keep the dev-only mock settle/verify endpoints OFF by
# default (override at deploy time with KLAIM_DEV_ADAPTERS=true for the demo).
ENV KLAIM_DEV_ADAPTERS=false
EXPOSE 8080

CMD ["bun", "run", "backend/klaim-api/src/index.ts"]
