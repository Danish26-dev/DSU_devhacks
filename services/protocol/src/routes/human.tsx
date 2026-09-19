import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AppShell } from "@/components/app/app-shell";
import { useKlaim } from "@/lib/klaim/store";

export const Route = createFileRoute("/human")({
  ssr: false,
  component: HumanLayout,
});

function HumanLayout() {
  // DEMO role gate: session + role live in local demo state only. Replace with
  // a real server-side session/role check when auth is wired up.
  const { user, hydrated } = useKlaim();
  const navigate = useNavigate();

  useEffect(() => {
    if (!hydrated) return;
    if (!user) void navigate({ to: "/login/human", replace: true });
    else if (user.role !== "human") void navigate({ to: "/verifier/dashboard", replace: true });
  }, [hydrated, user, navigate]);

  if (!hydrated || !user || user.role !== "human") {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Loading identity console…
        </p>
      </div>
    );
  }

  return (
    <AppShell role="human">
      <Outlet />
    </AppShell>
  );
}
