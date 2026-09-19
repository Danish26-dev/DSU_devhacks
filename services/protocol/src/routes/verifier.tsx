import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppShell } from "@/components/app/app-shell";
import { useKlaim } from "@/lib/klaim/store";

export const Route = createFileRoute("/verifier")({
  ssr: false,
  component: VerifierLayout,
});

function VerifierLayout() {
  // DEMO role gate — see human layout. Verifiers can never mutate human
  // credentials: those actions only exist under the /human routes.
  const { user, hydrated } = useKlaim();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hydrated) return;
    if (!user) void navigate({ to: "/login/verifier", replace: true });
    else if (user.role !== "verifier") void navigate({ to: "/human/dashboard", replace: true });
  }, [hydrated, user, navigate]);

  if (!hydrated || !user || user.role !== "verifier") {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Loading verifier console…
        </p>
      </div>
    );
  }

  return (
    <AppShell role="verifier">
      <Outlet />
    </AppShell>
  );
}
