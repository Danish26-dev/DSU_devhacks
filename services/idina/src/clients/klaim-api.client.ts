/**
 * KLAIM API client — Idina reads authoritative state (consent) from the KLAIM
 * API and (optionally) reports the final result back. The KLAIM API remains the
 * system of record; Idina orchestrates but does not own state.
 */
import type { VerificationDecision, VerificationRequestStatus } from "@klaim/types";

export interface RequestSnapshot {
  requestId: string;
  status: VerificationRequestStatus;
  consent: { decision: VerificationDecision | null; at: string | null };
}

export class KlaimApiClient {
  private readonly baseUrl: string | undefined;
  private readonly token: string | undefined;

  constructor(baseUrl: string | undefined, token: string | undefined) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  /** Read the current request (for consent gating). null when unavailable. */
  async getRequest(requestId: string): Promise<RequestSnapshot | null> {
    if (!this.baseUrl) return null;
    try {
      const res = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/api/verification-requests/${encodeURIComponent(requestId)}`,
        { headers: this.token ? { Authorization: `Bearer ${this.token}` } : {} },
      );
      if (!res.ok) return null;
      const b = (await res.json()) as RequestSnapshot;
      return b;
    } catch {
      return null;
    }
  }
}
