# services/

Independent service boundaries. Each has its own `src/`, `tests/`, `package.json`
and `Dockerfile`. Services communicate over HTTP using env-provided base URLs and
never bypass the backend's verification state machine.

- **idina/** (Danish) — the verification **orchestrator**. Coordinates consent →
  payment → settlement → credential verification → ZKP → result. The LLM
  orchestrates only; it never decides truth. NOT the provider-agent executor.
- **protocol/** (Omkar) — x402, GoPlausible facilitator, Algorand Testnet, USDC
  settlement, transaction metadata. Private keys stay server-side.
- **zkp/** (Omkar) — privacy-preserving proof generation. Local deterministic
  engine + Midnight integration boundary. Local proofs are labelled `engine=local`.
- **mcp/** (Omkar) — Model Context Protocol interface exposing KLAIM to AI agents.
  An interface, not a second verification engine.

See `docs/SERVICE_CONTRACTS.md`.

> Phase 0 status: destination directories only. No service extraction yet.
