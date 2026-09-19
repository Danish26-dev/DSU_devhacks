/**
 * DigiLocker credential flow.
 *
 *   POST /api/v1/digilocker?action=authorize   -> real DigiLocker OAuth URL
 *   POST /api/v1/digilocker?action=callback    -> exchange code, store reference
 *
 * When partner credentials are absent the authorize call returns
 * state="pending_credentials" and NO credential is created. KLAIM never
 * fabricates a verified government credential.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { digilockerAdapter } from "@/lib/klaim/server/digilocker.server";
import { repository } from "@/lib/klaim/server/store.server";

const authorizeSchema = z.object({
  subjectDid: z.string().min(6).max(200),
  documentType: z.string().min(2).max(80).default("Aadhaar"),
});

const callbackSchema = z.object({
  subjectDid: z.string().min(6).max(200),
  code: z.string().min(4).max(2048),
});

export const Route = createFileRoute("/api/v1/digilocker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const action = new URL(request.url).searchParams.get("action");

        if (action === "authorize") {
          let input: z.infer<typeof authorizeSchema>;
          try {
            input = authorizeSchema.parse(await request.json());
          } catch {
            return Response.json({ error: "invalid_request" }, { status: 400 });
          }
          const state = crypto.randomUUID();
          const authorization = digilockerAdapter.buildAuthorization({ ...input, state });
          repository.audit(input.subjectDid, "digilocker.consent_requested", `Consent requested for ${input.documentType}`);
          return Response.json(authorization, { status: authorization.state === "ready" ? 200 : 503 });
        }

        if (action === "callback") {
          let input: z.infer<typeof callbackSchema>;
          try {
            input = callbackSchema.parse(await request.json());
          } catch {
            return Response.json({ error: "invalid_request" }, { status: 400 });
          }
          if (!digilockerAdapter.configured()) {
            return Response.json(
              { error: "pending_credentials", message: "DigiLocker partner credentials are not configured." },
              { status: 503 },
            );
          }
          try {
            const { accessToken } = await digilockerAdapter.exchangeCode(input.code);
            const documents = await digilockerAdapter.listIssuedDocuments(accessToken);
            const stored = documents.map((doc) =>
              repository.putCredential({
                subjectDid: input.subjectDid,
                provider: "DigiLocker",
                credentialRef: doc.uri,
                documentType: doc.doctype,
                issuer: doc.issuer,
                issuerVerified: doc.issuerVerified,
                issuerSignatureAlg: "RS256",
                status: "verified",
                issuedAt: doc.issuedAt,
                expiresAt: doc.validUntil,
                addedAt: new Date().toISOString(),
                lastVerifiedAt: new Date().toISOString(),
                derivedClaims: {},
                live: true,
              }),
            );
            return Response.json({ credentials: stored });
          } catch (error) {
            return Response.json({ error: "digilocker_error", message: (error as Error).message }, { status: 502 });
          }
        }

        return Response.json({ error: "invalid_action" }, { status: 400 });
      },
    },
  },
});
