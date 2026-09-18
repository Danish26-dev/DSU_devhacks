import { RoleLogin } from "@/components/app/role-login";

/** Verifier sign-in (ported from login.verifier.tsx). */
export function LoginVerifier() {
  return (
    <RoleLogin
      role="verifier"
      title="Verify Humans. Programmatically."
      subtitle="Give your AI agents access to privacy-preserving human verification through MCP and x402."
      demoLabel="Use Demo Verifier Account"
      demoHint="did:identipi:verifier-4c19"
      defaultEmail="ops@verifier.demo"
    />
  );
}
