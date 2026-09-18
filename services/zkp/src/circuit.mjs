// KLAIM ZK service — runs the compiled Midnight Compact circuits.
// Each circuit takes a PRIVATE witness value that never leaves this module;
// the circuit's own assert enforces the rule. Only the boolean result leaves.
//
//   age_over_18      private birthYear      → assert (currentYear - birthYear) >= 18
//   license_valid    private expiryYear     → assert expiryYear >= currentYear
//   identity_verified private attestation   → assert attestation == expectedMarker

import * as RT from "@midnight-ntwrk/compact-runtime";

import { Contract as AgeContract, ledger as ageLedger } from "./age/index.js";
import { Contract as LicenceContract, ledger as licenceLedger } from "./licence/index.js";
import { Contract as IdentityContract, ledger as identityLedger } from "./identity/index.js";

const COIN = "0".repeat(64);

/** Build the constructor + circuit context for a contract with one witness. */
async function makeCtx(contract, circuitId) {
  const ctor = await contract.initialState({
    initialPrivateState: {},
    initialZswapLocalState: { coinPublicKey: COIN },
  });
  return RT.createCircuitContext(
    circuitId,
    RT.sampleContractAddress(),
    COIN,
    ctor.currentContractState.data,
    {},
  );
}

function isAssertRejection(err) {
  const m = err instanceof Error ? err.message : String(err);
  return (
    m.includes("age threshold") ||
    m.includes("licence has expired") ||
    m.includes("identity attestation")
  );
}

/** age_over_18: prove (currentYear - birthYear) >= threshold. */
export async function proveAgeOver18(birthYear, currentYear, threshold) {
  const year = Number(currentYear) || new Date().getFullYear();
  const min = Number(threshold) || 18;
  const contract = new AgeContract({
    subjectBirthYear: ({ privateState }) => [privateState, BigInt(birthYear)],
  });
  const ctx = await makeCtx(contract, "verify_age");
  try {
    const call = await contract.impureCircuits.verify_age(ctx, BigInt(year), BigInt(min));
    const state = ageLedger(call.context.callContext.currentQueryContext.state);
    return { verified: Boolean(state.verified && call.result) };
  } catch (err) {
    if (isAssertRejection(err)) return { verified: false };
    throw err;
  }
}

/** license_valid: prove expiryYear >= currentYear (licence not expired). */
export async function proveLicenceValid(expiryYear, currentYear) {
  const year = Number(currentYear) || new Date().getFullYear();
  const contract = new LicenceContract({
    licenceExpiryYear: ({ privateState }) => [privateState, BigInt(expiryYear)],
  });
  const ctx = await makeCtx(contract, "verify_licence");
  try {
    const call = await contract.impureCircuits.verify_licence(ctx, BigInt(year));
    const state = licenceLedger(call.context.callContext.currentQueryContext.state);
    return { verified: Boolean(state.valid && call.result) };
  } catch (err) {
    if (isAssertRejection(err)) return { verified: false };
    throw err;
  }
}

/** identity_verified: prove attestation == expectedMarker. */
export async function proveIdentityVerified(attestation, expectedMarker) {
  const marker = BigInt(expectedMarker ?? 1);
  const contract = new IdentityContract({
    identityAttestation: ({ privateState }) => [privateState, BigInt(attestation)],
  });
  const ctx = await makeCtx(contract, "verify_identity");
  try {
    const call = await contract.impureCircuits.verify_identity(ctx, marker);
    const state = identityLedger(call.context.callContext.currentQueryContext.state);
    return { verified: Boolean(state.verified && call.result) };
  } catch (err) {
    if (isAssertRejection(err)) return { verified: false };
    throw err;
  }
}
