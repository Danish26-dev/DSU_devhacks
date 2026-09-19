# KLAIM smart contracts — Midnight Compact ZK circuits

These are KLAIM's smart contracts. On Midnight, a smart contract and a
zero-knowledge circuit are the same thing: you write it in **Compact**, and the
compiler produces a ZK circuit (proving/verifying keys) plus a JavaScript module
that runs the same logic.

| Contract | Circuit | Proves | Private input (never disclosed) |
|----------|---------|--------|----------------------------------|
| `age.compact` | `verify_age` | age ≥ threshold (18) | birth year |
| `licence.compact` | `verify_licence` | licence not expired (expiry ≥ current year) | licence expiry year |
| `identity.compact` | `verify_identity` | attestation matches issuer marker | identity attestation code |

## How they work

Each contract:
1. declares a **`witness`** — the private value supplied off-chain (birth year,
   licence expiry, attestation). It never leaves the prover.
2. runs an **`assert`** that enforces the rule. If it fails, no valid proof is
   produced — an invalid subject cannot fake a passing result.
3. **`disclose`**s only the boolean outcome. No date of birth, licence number,
   Aadhaar, PAN, address, or document ever crosses the boundary.

## Compiled output

`compact compile` turns each `.compact` source into the module used at runtime:

```
contracts/age.compact   →  src/age/index.js      (+ ZK circuit + proving keys)
contracts/licence.compact → src/licence/index.js
contracts/identity.compact → src/identity/index.js
```

The ZK service (`src/server.mjs`) loads these compiled modules and runs the
circuits to produce real proofs. Compiler: Compact 0.34.0 (language 0.26).

## Note on Algorand

The x402 settlement layer uses **standard USDC asset transfers** on Algorand
Testnet (via the GoPlausible facilitator) — there is no custom Algorand smart
contract by design. The smart-contract logic lives entirely in these Midnight
Compact circuits.
