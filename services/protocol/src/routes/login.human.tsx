import { createFileRoute } from "@tanstack/react-router";

import { RoleLogin } from "@/components/app/role-login";

export const Route = createFileRoute("/login/human")({
  head: () => ({
    meta: [
      { title: "Your Identity. Your Proof. — KLAIM Human Sign in" },
      {
        name: "description",
        content:
          "Sign in as a human credential holder to manage your DID and trusted credentials and prove what matters without exposing unnecessary personal data.",
      },
      { property: "og:title", content: "Your Identity. Your Proof. — KLAIM" },
      { property: "og:description", content: "Manage your DID and DigiLocker-issued trusted credentials." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <RoleLogin
      role="human"
      title="Your Identity. Your Proof."
      subtitle="Manage your credentials and prove what matters without exposing unnecessary personal data."
      demoLabel="Use Demo Human Account"
      demoHint="did:identipi:demo-7x82"
      defaultEmail="danish@klaim.demo"
    />
  ),
});
