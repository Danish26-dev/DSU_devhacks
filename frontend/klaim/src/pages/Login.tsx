import { RoleLogin } from "@/components/app/role-login";

export function Login() {
  return (
    <RoleLogin
      role="human"
      title="Your Identity. Your Proof."
      subtitle="Manage your credentials and prove what matters without exposing unnecessary personal data."
      demoLabel="Use Demo Account"
      demoHint="did:identipi:demo-7x82"
      defaultEmail="danish@klaim.demo"
    />
  );
}
