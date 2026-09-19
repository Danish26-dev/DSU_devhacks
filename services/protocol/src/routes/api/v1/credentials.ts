/**
 * Credential management API (human / credential holder).
 *
 *   GET    /api/v1/credentials?did=...   list credential references
 *   DELETE /api/v1/credentials?id=...    delete a credential from KLAIM
 *
 * Deleting removes the credential reference and its cached derived claims from
 * KLAIM. Future proofs can no longer be derived from it. The credential itself
 * still exists with DigiLocker / the issuer — KLAIM does not and cannot delete
 * a government-issued document.
 */
import { createFileRoute } from "@tanstack/react-router";

import { repository } from "@/lib/klaim/server/store.server";

export const Route = createFileRoute("/api/v1/credentials")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const did = new URL(request.url).searchParams.get("did") ?? undefined;
        return Response.json({ credentials: repository.listCredentials(did), storage: repository.storage });
      },
      DELETE: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return Response.json({ error: "invalid_request", message: "id is required" }, { status: 400 });
        const removed = repository.deleteCredential(id);
        if (!removed) return Response.json({ error: "not_found" }, { status: 404 });
        return Response.json({
          deleted: true,
          credentialId: id,
          effects: {
            klaim: "Credential reference and cached derived claims removed. No future proofs can be derived.",
            issuer: "The document remains in DigiLocker / with the issuer. KLAIM cannot delete it there.",
            pastProofs: "Previously issued proofs are historical records and are not retroactively withdrawn.",
          },
        });
      },
    },
  },
});
