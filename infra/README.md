# infra/

Deployment and infrastructure configuration. Target platform: Google Cloud Run.
Code boundaries stay separate; deployment may be consolidated where useful.

- **docker/** — per-deployable Dockerfiles and compose fragments.
- **gcp/** — Cloud Run service configuration.

See `docs/DEPLOYMENT.md`.

> Phase 0 status: destination directories only. No Dockerfiles or Cloud Run
> configs authored yet (that belongs to the deployment phase).
