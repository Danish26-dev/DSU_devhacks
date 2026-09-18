/**
 * Idina entry point — Node HTTP server (Cloud Run ready). Listens on
 * 0.0.0.0:$PORT (Cloud Run injects PORT). Adapts Node req/res to the Web
 * Request/Response app handler in app.ts.
 *
 * Wires the three harnesses:
 *   - wallet/credential: DEMO fixture (PII-free metadata)
 *   - payment:           REAL HTTP client → PROTOCOL_SERVICE_URL
 *   - zkp:               REAL HTTP client → ZKP_SERVICE_URL
 * When a service URL is absent, that harness reports unavailable/FAILED — Idina
 * never fabricates settlement or proofs.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createApp } from "./app.ts";
import { KlaimApiClient } from "./clients/klaim-api.client.ts";
import { loadConfig } from "./config.ts";
import type { Harnesses } from "./harnesses/types.ts";
import { DemoWalletCredentialHarness } from "./harnesses/wallet-credential.harness.ts";
import { ProtocolPaymentHarness } from "./harnesses/payment.harness.ts";
import { ServiceZkpHarness } from "./harnesses/zkp.harness.ts";
import { log } from "./logger.ts";

const config = loadConfig();

const harnesses: Harnesses = {
  wallet: new DemoWalletCredentialHarness(),
  payment: new ProtocolPaymentHarness(config.protocolServiceUrl, config.internalServiceToken),
  zkp: new ServiceZkpHarness(config.zkpServiceUrl, config.internalServiceToken),
};

const handle = createApp({
  config,
  harnesses,
  klaimApi: new KlaimApiClient(config.klaimApiUrl, config.internalServiceToken),
});

async function nodeToWeb(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? `localhost:${config.port}`;
  const url = `http://${host}${req.url ?? "/"}`;
  const method = req.method ?? "GET";
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(", "));
  }
  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    body = Buffer.concat(chunks).toString("utf8");
  }
  return new Request(url, { method, headers, ...(body ? { body } : {}) });
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  void (async () => {
    try {
      const webReq = await nodeToWeb(req);
      const webRes = await handle(webReq);
      res.statusCode = webRes.status;
      webRes.headers.forEach((value, key) => res.setHeader(key, value));
      const text = await webRes.text();
      res.end(text);
    } catch (err) {
      log.error("server.error", { reason: String(err) });
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "internal_error" }));
    }
  })();
});

server.listen(config.port, "0.0.0.0", () => {
  log.info("idina.listening", {
    port: config.port,
    mode: config.mode,
    protocol: config.protocolServiceUrl ? "configured" : "unset",
    zkp: config.zkpServiceUrl ? "configured" : "unset",
    klaimApi: config.klaimApiUrl ? "configured" : "unset",
  });
});
