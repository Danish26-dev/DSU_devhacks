# services/quickdrop-ui — standalone verifier onboarding UI on nginx (Cloud Run).
#
# Self-contained (no @klaim workspace deps), so the build context is just this
# folder:  built via cloudbuild.quickdrop-ui.yaml.
#
# VITE_KLAIM_API_URL is baked in at BUILD time (Vite inlines import.meta.env).
# Override with --build-arg; defaults to the deployed KLAIM API. If left as an
# empty string, the app runs in self-driving DEMO mode.

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_KLAIM_API_URL=https://klaim-api-atnwarjo4q-el.a.run.app
ENV VITE_KLAIM_API_URL=${VITE_KLAIM_API_URL}
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# ---- serve stage ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV PORT=8080
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
