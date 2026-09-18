# frontend/klaim — static PWA build served by nginx on Cloud Run.
#
# Build context is the REPO ROOT (the app imports @klaim/types + @klaim/contracts
# from the workspace):  built via cloudbuild.klaim-frontend.yaml.
#
# VITE_KLAIM_API_URL is baked in at BUILD time (Vite inlines import.meta.env).
# Override with --build-arg VITE_KLAIM_API_URL=... ; defaults to the deployed
# KLAIM API. Cloud Run injects PORT at runtime; nginx listens on it.

# ---- build stage (Bun, to match the workspace toolchain) ----
FROM oven/bun:1 AS build
WORKDIR /app

# Bake the API URL for the production bundle.
ARG VITE_KLAIM_API_URL=https://klaim-api-atnwarjo4q-el.a.run.app
ENV VITE_KLAIM_API_URL=${VITE_KLAIM_API_URL}

# Full workspace so @klaim/* resolve, then install + build.
COPY package.json bun.lock bunfig.toml ./
COPY packages ./packages
COPY frontend/klaim ./frontend/klaim
RUN bun install
RUN cd frontend/klaim && bun run build

# ---- serve stage (nginx) ----
FROM nginx:1.27-alpine
# SPA + service-worker aware nginx config (PORT-templated at start).
COPY frontend/klaim/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/klaim/dist /usr/share/nginx/html
ENV PORT=8080
EXPOSE 8080
# nginx:alpine entrypoint runs envsubst over /etc/nginx/templates/*.template.
CMD ["nginx", "-g", "daemon off;"]
