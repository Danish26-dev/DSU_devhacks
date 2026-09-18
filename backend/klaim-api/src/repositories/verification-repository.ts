/**
 * VerificationRepository — persistence boundary for verification state.
 *
 * The API layer depends ONLY on this interface, never on a concrete store. This
 * lets us swap the in-memory implementation for Firestore in a later phase
 * without touching route handlers (see docs/ARCHITECTURE.md §8, docs/DEPLOYMENT.md §5).
 *
 * Phase 1 ships the interface + an in-memory implementation. No Firestore yet.
 */
import type {
  ConsentRecord,
  VerificationRequest,
  VerificationResult,
} from "@klaim/types";

/** A partial patch applied to a stored request. */
export type VerificationRequestPatch = Partial<
  Pick<
    VerificationRequest,
    "status" | "consent" | "payment" | "proof" | "claimResults" | "failure" | "updatedAt"
  >
>;

/** Optional filters for listing requests. */
export interface VerificationRequestQuery {
  userDid?: string;
  status?: VerificationRequest["status"];
}

export interface VerificationRepository {
  /** Persist a newly created request. */
  create(request: VerificationRequest): Promise<VerificationRequest>;

  /** Fetch a request by id, or null if unknown. */
  getById(requestId: string): Promise<VerificationRequest | null>;

  /** List requests matching an optional filter, newest first. */
  list(query?: VerificationRequestQuery): Promise<VerificationRequest[]>;

  /** Apply a partial update. Returns the updated request, or null if unknown. */
  update(requestId: string, patch: VerificationRequestPatch): Promise<VerificationRequest | null>;

  /** Record a consent decision. Returns the updated request, or null if unknown. */
  saveConsent(requestId: string, consent: ConsentRecord): Promise<VerificationRequest | null>;

  /** Persist the final verification result for a request. */
  saveResult(requestId: string, result: VerificationResult): Promise<void>;

  /** Fetch the final result, or null if not yet produced. */
  getResult(requestId: string): Promise<VerificationResult | null>;
}
