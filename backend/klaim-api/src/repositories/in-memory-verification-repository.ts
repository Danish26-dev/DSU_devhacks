/**
 * In-memory VerificationRepository.
 *
 * Phase 1 implementation. Suitable for local single-instance development and
 * tests only — data does not survive a restart and is not shared across
 * instances. A Firestore implementation replaces this in a later phase WITHOUT
 * changing the interface or any route handler.
 */
import type {
  ConsentRecord,
  VerificationRequest,
  VerificationResult,
} from "@klaim/types";
import { nowIso } from "@klaim/utils";

import type {
  VerificationRepository,
  VerificationRequestPatch,
  VerificationRequestQuery,
} from "./verification-repository";

export class InMemoryVerificationRepository implements VerificationRepository {
  private readonly requests = new Map<string, VerificationRequest>();
  private readonly results = new Map<string, VerificationResult>();

  create(request: VerificationRequest): Promise<VerificationRequest> {
    this.requests.set(request.requestId, { ...request });
    return Promise.resolve({ ...request });
  }

  getById(requestId: string): Promise<VerificationRequest | null> {
    const found = this.requests.get(requestId);
    return Promise.resolve(found ? { ...found } : null);
  }

  list(query?: VerificationRequestQuery): Promise<VerificationRequest[]> {
    let items = [...this.requests.values()];
    if (query?.userDid) items = items.filter((r) => r.userDid === query.userDid);
    if (query?.status) items = items.filter((r) => r.status === query.status);
    // Newest first.
    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return Promise.resolve(items.map((r) => ({ ...r })));
  }

  update(
    requestId: string,
    patch: VerificationRequestPatch,
  ): Promise<VerificationRequest | null> {
    const current = this.requests.get(requestId);
    if (!current) return Promise.resolve(null);
    const updated: VerificationRequest = {
      ...current,
      ...patch,
      updatedAt: patch.updatedAt ?? nowIso(),
    };
    this.requests.set(requestId, updated);
    return Promise.resolve({ ...updated });
  }

  saveConsent(
    requestId: string,
    consent: ConsentRecord,
  ): Promise<VerificationRequest | null> {
    return this.update(requestId, { consent });
  }

  saveResult(requestId: string, result: VerificationResult): Promise<void> {
    this.results.set(requestId, { ...result });
    return Promise.resolve();
  }

  getResult(requestId: string): Promise<VerificationResult | null> {
    const found = this.results.get(requestId);
    return Promise.resolve(found ? { ...found } : null);
  }

  /** Test/diagnostic helper — not part of the interface. */
  clear(): void {
    this.requests.clear();
    this.results.clear();
  }
}
