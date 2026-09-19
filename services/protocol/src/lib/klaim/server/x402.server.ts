/**
 * x402 payment boundary — official SDK implementation.
 *
 *   MCP → Verification API → [x402 middleware] → GoPlausible → Algorand Testnet
 *
 * Every 402 challenge on this server is produced by @x402/core +
 * @x402/avm (exact scheme, Algorand). Nothing here fabricates a payment
 * requirement, a settlement or a transaction id. When the payer/facilitator
 * configuration is missing the endpoint answers `X402_NOT_CONFIGURED` and no
 * protected logic runs.
 */
import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import type { HTTPAdapter, RouteConfig } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { USDC_DECIMALS, USDC_TESTNET_ASA_ID } from "@x402/avm";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions";

import { env } from "./env.server";

export const DEFAULT_FACILITATOR_URL = "https://facilitator.goplausible.xyz";

/**
 * The GoPlausible facilitator advertises Algorand Testnet with the FULL
 * base64 genesis hash. @x402/avm v2.23 truncates it to 32 chars, so we
 * use the full CAIP-2 identifier the facilitator expects.
 *
 * Facilitator /supported shows:
 *   "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI="
 */
export const ALGORAND_TESTNET_FULL_CAIP2 =
  "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=" as Network;

export const ALGORAND_TESTNET_NETWORK: Network =
  (env("NETWORK") as Network | undefined) ?? ALGORAND_TESTNET_FULL_CAIP2;

export function facilitatorUrl(): string {
  return env("FACILITATOR_URL") ?? env("X402_FACILITATOR_URL") ?? DEFAULT_FACILITATOR_URL;
}

export function providerWallet(): string | undefined {
  return env("PROVIDER_WALLET_ADDRESS") ?? env("X402_PAY_TO_ADDRESS");
}

export function usdcAssetId(): string {
  return env("USDC_ASSET_ID") ?? USDC_TESTNET_ASA_ID;
}

export function verificationPriceUsdc(): number {
  const raw = Number(env("VERIFICATION_PRICE") ?? "0.01");
  return Number.isFinite(raw) && raw > 0 ? raw : 0.01;
}

export function atomicPrice(usdc: number): string {
  return BigInt(Math.round(usdc * 10 ** USDC_DECIMALS)).toString();
}

/** Configuration required before any payment can settle. */
export function x402Configured(): boolean {
  return Boolean(providerWallet());
}

export function missingX402Env(): string[] {
  return providerWallet() ? [] : ["PROVIDER_WALLET_ADDRESS"];
}

export function loraTransactionUrl(txId: string): string {
  return `https://lora.algokit.io/testnet/transaction/${txId}`;
}

/* ------------------------------------------------------------------ server */

// Resource servers are cached PER PATH. Each protected verification route has
// its own x402 route config, so a single shared instance would only match the
// first path registered. Keyed by `${path}` (price is fixed per deploy).
const cache = globalThis as typeof globalThis & {
  __klaimX402?: Map<string, Promise<x402HTTPResourceServer>>;
};

function routeConfig(path: string, price: number): Record<string, RouteConfig> {
  return {
    [`POST ${path}`]: {
      accepts: [
        {
          scheme: "exact" as const,
          network: ALGORAND_TESTNET_NETWORK,
          payTo: providerWallet() ?? "",
          price: { amount: atomicPrice(price), asset: usdcAssetId() },
        },
      ],
      resource: path,
      description: "KLAIM privacy-preserving human verification",
      mimeType: "application/json",
      serviceName: "KLAIM",
      extensions: declareDiscoveryExtension({
        bodyType: "json",
        input: { did: "did:identipi:demo-user-001", claim: "age_over_18" },
        inputSchema: {
          properties: {
            did: {
              type: "string",
              description: "Decentralized identifier of the subject (did:<method>:<id>)",
            },
            claim: {
              type: "string",
              enum: ["age_over_18"],
              description: "Verification claim type",
            },
          },
          required: ["did"],
        },
        output: {
          example: {
            verified: true,
            claim: "age_over_18",
            proof: {
              verified: true,
              engine: "local",
              id: "proof_local_abc123",
              notDisclosed: [
                "date_of_birth",
                "aadhaar_number",
                "pan_number",
                "address",
                "document_image",
              ],
            },
            payment: {
              status: "settled",
              network: "algorand:testnet",
              asset: "USDC",
              amount: 0.01,
              txId: "REAL_TX_ID",
              explorerUrl: "https://lora.algokit.io/testnet/transaction/REAL_TX_ID",
            },
          },
        },
      }),
    },
  };
}

async function resourceServer(path: string, price: number): Promise<x402HTTPResourceServer> {
  if (!cache.__klaimX402) cache.__klaimX402 = new Map();
  const map = cache.__klaimX402;

  let entry = map.get(path);
  if (!entry) {
    entry = (async () => {
      const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl() });
      const core = new x402ResourceServer(facilitator);
      core.register(ALGORAND_TESTNET_NETWORK, new ExactAvmScheme());
      core.registerExtension(bazaarResourceServerExtension);
      const http = new x402HTTPResourceServer(core, routeConfig(path, price));
      await http.initialize();
      return http;
    })().catch((error: unknown) => {
      map.delete(path);
      throw error;
    });
    map.set(path, entry);
  }
  return entry;
}

function adapterFor(request: Request, path: string, body: unknown): HTTPAdapter {
  const url = new URL(request.url);
  return {
    getHeader: (name: string) => request.headers.get(name) ?? undefined,
    getMethod: () => request.method,
    getPath: () => path,
    getUrl: () => url.toString(),
    getAcceptHeader: () => request.headers.get("accept") ?? "application/json",
    getUserAgent: () => request.headers.get("user-agent") ?? "",
    getBody: () => body,
  };
}

export interface PaymentReceipt {
  status: "settled";
  network: string;
  asset: "USDC";
  amount: number;
  facilitator: "GoPlausible";
  txId: string;
  payer: string | null;
  explorerUrl: string;
  timestamp: string;
}

export type PaymentGate =
  | { type: "not_configured"; response: Response }
  | { type: "payment_required"; response: Response }
  | {
      type: "paid";
      payload: PaymentPayload;
      requirements: PaymentRequirements;
      /** Settles through GoPlausible. Must succeed before protected logic runs. */
      settle: () => Promise<
        { ok: true; receipt: PaymentReceipt } | { ok: false; response: Response }
      >;
    };

function instructionsToResponse(instructions: {
  status: number;
  headers: Record<string, string>;
  body?: unknown;
}): Response {
  return new Response(JSON.stringify(instructions.body ?? {}), {
    status: instructions.status,
    headers: { "Content-Type": "application/json", ...instructions.headers },
  });
}

/**
 * The x402 middleware. Returns a 402 (generated by the official SDK) unless a
 * valid payment is attached; on success the caller MUST call `settle()` and
 * only run protected logic when settlement succeeds.
 */
export async function requirePayment(input: {
  request: Request;
  path: string;
  body: unknown;
  amountUsdc: number;
}): Promise<PaymentGate> {
  const { request, path, body, amountUsdc } = input;

  if (!x402Configured()) {
    return {
      type: "not_configured",
      response: Response.json(
        {
          error: "X402_NOT_CONFIGURED",
          message:
            "KLAIM cannot issue an x402 challenge because the provider wallet is not configured. No verification is performed and no payment can settle.",
          missing: missingX402Env(),
          facilitator: facilitatorUrl(),
          network: ALGORAND_TESTNET_NETWORK,
        },
        { status: 503 },
      ),
    };
  }

  const server = await resourceServer(path, amountUsdc);
  const context = {
    adapter: adapterFor(request, path, body),
    path,
    method: "POST",
    ...(request.headers.get("X-PAYMENT")
      ? { paymentHeader: request.headers.get("X-PAYMENT")! }
      : {}),
  };

  const processed = await server.processHTTPRequest(context);

  if (processed.type === "payment-error") {
    return { type: "payment_required", response: instructionsToResponse(processed.response) };
  }
  if (processed.type === "no-payment-required") {
    // Route config always requires payment; treat as a misconfiguration rather
    // than silently granting free access to the protected result.
    return {
      type: "not_configured",
      response: Response.json(
        {
          error: "X402_NOT_CONFIGURED",
          message: "Payment route is not protected — refusing to serve the result.",
        },
        { status: 503 },
      ),
    };
  }

  const { paymentPayload, paymentRequirements, declaredExtensions } = processed;

  return {
    type: "paid",
    payload: paymentPayload,
    requirements: paymentRequirements,
    settle: async () => {
      const settlement = await server.processSettlement(
        paymentPayload,
        paymentRequirements,
        declaredExtensions,
      );
      if (!settlement.success || !settlement.transaction) {
        const failure: SettleResponse = settlement;
        return {
          ok: false as const,
          response: Response.json(
            {
              error: "payment_settlement_failed",
              message:
                failure.errorMessage ?? failure.errorReason ?? "Settlement was not confirmed",
              network: paymentRequirements.network,
              facilitator: facilitatorUrl(),
            },
            { status: 402 },
          ),
        };
      }
      return {
        ok: true as const,
        receipt: {
          status: "settled",
          network: settlement.network ?? paymentRequirements.network,
          asset: "USDC",
          amount: amountUsdc,
          facilitator: "GoPlausible",
          txId: settlement.transaction,
          payer: settlement.payer ?? null,
          explorerUrl: loraTransactionUrl(settlement.transaction),
          timestamp: new Date().toISOString(),
        },
      };
    },
  };
}

/** Facilitator reachability probe used by /api/health. */
export async function facilitatorReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${facilitatorUrl()}/supported`, { method: "GET" });
    if (!res.ok) return false;
    const json = (await res.json()) as { kinds?: { network?: string }[] };
    return Boolean(json.kinds?.some((k) => (k.network ?? "").startsWith("algorand:")));
  } catch {
    return false;
  }
}
