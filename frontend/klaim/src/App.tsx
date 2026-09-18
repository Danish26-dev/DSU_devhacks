import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { KlaimProvider, useKlaim } from "@/lib/klaim/store";
import type { KlaimRole } from "@/lib/klaim/types";

import { Activity } from "@/pages/Activity";
import { Credentials } from "@/pages/Credentials";
import { CredentialsAdd } from "@/pages/CredentialsAdd";
import { Dashboard } from "@/pages/Dashboard";
import { Identity } from "@/pages/Identity";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/Login";
import { LoginSelect } from "@/pages/LoginSelect";
import { LoginVerifier } from "@/pages/LoginVerifier";
import { Settings } from "@/pages/Settings";
import { Verify } from "@/pages/Verify";

import { VerifierActivity } from "@/pages/verifier/Activity";
import { VerifierAgentDetail } from "@/pages/verifier/AgentDetail";
import { VerifierAgents } from "@/pages/verifier/Agents";
import { VerifierDashboard } from "@/pages/verifier/Dashboard";
import { VerifierPayments } from "@/pages/verifier/Payments";
import { VerifierSettings } from "@/pages/verifier/Settings";
import { VerifierVerify } from "@/pages/verifier/Verify";

/**
 * Role-gated guard. Mirrors the original human.tsx / verifier.tsx layouts:
 * unauthenticated -> the relevant login; wrong role -> that role's home.
 */
function RequireRole({ role, children }: { role: KlaimRole; children: ReactNode }) {
  const { user, hydrated } = useKlaim();

  if (!hydrated) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Loading {role === "verifier" ? "verifier" : "identity"} console…
        </p>
      </div>
    );
  }
  if (!user) return <Navigate to={role === "verifier" ? "/login/verifier" : "/login"} replace />;
  if (user.role !== role) {
    return <Navigate to={user.role === "verifier" ? "/verifier/dashboard" : "/app/dashboard"} replace />;
  }
  return <>{children}</>;
}

const router = createBrowserRouter([
  // Public marketing landing page.
  { path: "/", element: <Landing /> },

  // Actor selection + role sign-in.
  { path: "/login", element: <LoginSelect /> },
  { path: "/login/human", element: <Login /> },
  { path: "/login/verifier", element: <LoginVerifier /> },

  // Human identity console.
  {
    path: "/app",
    element: (
      <RequireRole role="human">
        <AppShell role="human">
          <Outlet />
        </AppShell>
      </RequireRole>
    ),
    children: [
      { index: true, element: <Navigate to="/app/dashboard" replace /> },
      { path: "dashboard", element: <Dashboard /> },
      { path: "verify", element: <Verify /> },
      { path: "identity", element: <Identity /> },
      { path: "credentials", element: <Credentials /> },
      { path: "credentials/add", element: <CredentialsAdd /> },
      { path: "activity", element: <Activity /> },
      { path: "settings", element: <Settings /> },
    ],
  },

  // Verifier console.
  {
    path: "/verifier",
    element: (
      <RequireRole role="verifier">
        <AppShell role="verifier">
          <Outlet />
        </AppShell>
      </RequireRole>
    ),
    children: [
      { index: true, element: <Navigate to="/verifier/dashboard" replace /> },
      { path: "dashboard", element: <VerifierDashboard /> },
      { path: "verify", element: <VerifierVerify /> },
      { path: "agents", element: <VerifierAgents /> },
      { path: "agents/:agentId", element: <VerifierAgentDetail /> },
      { path: "payments", element: <VerifierPayments /> },
      { path: "activity", element: <VerifierActivity /> },
      { path: "settings", element: <VerifierSettings /> },
    ],
  },

  { path: "*", element: <Navigate to="/" replace /> },
]);

export function App() {
  return (
    <KlaimProvider>
      <RouterProvider router={router} />
      <Toaster />
    </KlaimProvider>
  );
}
