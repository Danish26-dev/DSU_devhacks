// KLAIM ZK proof microservice (Node).
//
// A standalone Node service so the Midnight Compact runtime (Node-only) runs
// cleanly, separate from klaim-protocol (which deploys to Cloudflare workerd and
// cannot bundle the Midnight runtime). klaim-protocol calls this over HTTP via
// its MIDNIGHT_PROVER_URL branch.
//
//   POST /prove   { claim, birthYear?, credentialRef?, currentYear?, threshold? }
//                 Authorization: Bearer <INTERNAL_SERVICE_TOKEN>
//                 -> { verified, proofId, engine: "midnight" }
//   GET  /health  -> { status, engine, circuits }
//
// Honesty: this executes the real compiled Compact circuit and returns its
// verified result. It is not an on-chain Midnight transaction.

import { createServer } from "node:http";

import {
  proveAgeOver18,
  proveLicenceValid,
  proveIdentityVerified,
} from "./circuit.mjs";

const PORT = Number(process.env.PORT) || 6400;
// Trim: Secret Manager values can carry a trailing newline when injected as env.
const TOKEN = (process.env.INTERNAL_SERVICE_TOKEN || "").trim();

// Demo private values. In a real system these come from the credential layer;
// here they mirror klaim-protocol's seeded demo human so each circuit has a real
// private value to prove over. None are ever disclosed in a response.
const DEMO_BIRTH_YEAR = 1998; // -> age_over_18
const DEMO_LICENCE_EXPIRY_YEAR = 2030; // -> license_valid (not expired)
const DEMO_IDENTITY_ATTESTATION = 1; // -> identity_verified (matches marker 1)

const SUPPORTED_CLAIMS = ["age_over_18", "license_valid", "identity_verified"];

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function authorized(req) {
  if (!TOKEN) return false; // fail closed
  const h = req.headers["authorization"] || "";
  const provided = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  return provided.length === TOKEN.length && provided === TOKEN;
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve(null);
      }
    });
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, {
      status: "ok",
      engine: "midnight",
      circuits: SUPPORTED_CLAIMS,
    });
  }

  if (req.method === "POST" && (req.url === "/prove" || req.url === "/api/zkp/generate")) {
    if (!authorized(req)) {
      return json(res, 401, { error: "unauthorized", message: "Missing or invalid internal service token" });
    }
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: "invalid_request", message: "Body must be JSON" });

    const claim = body.claim;
    if (!SUPPORTED_CLAIMS.includes(claim)) {
      return json(res, 422, {
        error: "unsupported_claim",
        message: `No Midnight circuit for claim '${claim}'. Supported: ${SUPPORTED_CLAIMS.join(", ")}.`,
      });
    }

    try {
      let verified;
      if (claim === "age_over_18") {
        const birthYear = Number(body.birthYear) || DEMO_BIRTH_YEAR;
        ({ verified } = await proveAgeOver18(birthYear, body.currentYear, body.threshold));
      } else if (claim === "license_valid") {
        const expiryYear = Number(body.expiryYear) || DEMO_LICENCE_EXPIRY_YEAR;
        ({ verified } = await proveLicenceValid(expiryYear, body.currentYear));
      } else {
        // identity_verified
        const attestation = Number(body.attestation) || DEMO_IDENTITY_ATTESTATION;
        ({ verified } = await proveIdentityVerified(attestation, body.expectedMarker));
      }
      return json(res, 200, {
        verified,
        claim,
        proofId: `proof_midnight_${cryptoId()}`,
        engine: "midnight",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json(res, 500, { error: "proof_failed", message });
    }
  }

  json(res, 404, { error: "not_found" });
});

function cryptoId() {
  return [...crypto.getRandomValues(new Uint8Array(4))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

server.listen(PORT, () => {
  console.log(`[klaim-zkp] Midnight ZK service listening on :${PORT} (engine=midnight, circuit=age_over_18)`);
  if (!TOKEN) console.warn("[klaim-zkp] WARNING: INTERNAL_SERVICE_TOKEN not set — all requests will 401.");
});
