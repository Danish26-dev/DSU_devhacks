# KLAIM ZK proof microservice — plain Node container for Cloud Run.
# Runs the compiled Midnight Compact age_over_18 circuit. No bundler: the
# @midnight-ntwrk/compact-runtime and its .wasm are used as-is from node_modules,
# which is exactly why this runs where the Cloudflare-bundled klaim-protocol cannot.

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Install production deps (compact-runtime + its wasm) against the lockfile.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy the service source + the compiled circuit module.
COPY src ./src

EXPOSE 8080
CMD ["node", "src/server.mjs"]
