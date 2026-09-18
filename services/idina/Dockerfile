# services/idina — Cloud Run ready container.
#
# Idina runs TypeScript directly via Node's native type stripping
# (Node >= 22.6, --experimental-strip-types). It has NO required runtime npm
# dependencies: it uses only Node built-ins (node:http, global fetch) and its
# @klaim/* imports are type-only (erased at runtime). @google/genai is optional
# (agent mode) and intentionally not installed in the image — deterministic mode
# needs nothing extra. So there is no `npm install` step and no node_modules.
#
# Build context is the REPO ROOT so packages/* resolve:
#   gcloud builds submit --config cloudbuild.idina.yaml .
#   (or)  docker build -f services/idina/Dockerfile -t klaim-idina .
#
# No secrets are baked in. Cloud Run injects PORT; the server binds 0.0.0.0:$PORT.
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Non-root user (uid within a conventional range).
RUN useradd --system --uid 999 idina || useradd --system idina

# Source only — type-only @klaim imports are stripped at runtime; the shared
# packages are copied so any (future) value imports resolve too.
COPY packages ./packages
COPY services/idina ./services/idina

USER idina
ENV PORT=8082
EXPOSE 8082

CMD ["node", "--experimental-strip-types", "services/idina/src/index.ts"]
