import { Link, useNavigate, useRouterState, type LinkProps } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  CircleDollarSign,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanFace,
  Settings,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import klaimLogo from "@/assets/klaim-logo.png";
import { useKlaim } from "@/lib/klaim/store";
import { cn } from "@/lib/utils";

const humanNav = [
  { to: "/human/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/human/identity", label: "My Identity", icon: Fingerprint },
  { to: "/human/credentials", label: "Credentials", icon: WalletCards },
  { to: "/human/activity", label: "Verification Activity", icon: Activity },
  { to: "/human/settings", label: "Settings", icon: Settings },
] as const;

const verifierNav = [
  { to: "/verifier/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/verifier/verify", label: "Verify Human", icon: ScanFace },
  { to: "/verifier/agents", label: "Agents / MCP", icon: Bot },
  { to: "/verifier/payments", label: "Payments", icon: CircleDollarSign },
  { to: "/verifier/activity", label: "Activity", icon: Activity },
  { to: "/verifier/settings", label: "Settings", icon: Settings },
] as const;

type Role = "human" | "verifier";

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navItems: ReadonlyArray<{ to: NonNullable<LinkProps["to"]>; label: string; icon: typeof LayoutDashboard }> =
    role === "verifier" ? verifierNav : humanNav;
  return (
    <nav className="flex flex-col gap-1">
      {navItems.map(({ to, label, icon: Icon }) => {
        const path = String(to);
        const active = pathname === path || pathname.startsWith(`${path}/`);
        return (
          <Link
            key={path}
            to={to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 border border-transparent px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
              active
                ? "border-primary/30 bg-primary/10 text-primary"
                : "text-muted-foreground hover:border-border hover:bg-secondary/40 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function IdentityFooter({ role }: { role: Role }) {
  const { user } = useKlaim();
  const { signOut } = useKlaim();
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div className="border-t border-border p-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {role === "verifier" ? "Verifier account" : "DID"}
      </p>
      <p className="mt-1 truncate font-mono text-[11px] text-foreground">
        {role === "verifier" ? user.email : user.did}
      </p>
      <p className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">
        <span className="status-dot" /> {role === "verifier" ? "Agent connected" : "Active"}
      </p>
      <button
        type="button"
        onClick={() => {
          signOut();
          void navigate({ to: "/login", replace: true });
        }}
        className="mt-4 flex w-full items-center gap-2 border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <LogOut className="size-3.5" /> Sign out
      </button>
    </div>
  );
}

function Brand({ role }: { role: Role }) {
  return (
    <Link to={role === "verifier" ? "/verifier/dashboard" : "/human/dashboard"} className="flex items-center gap-3 border-b border-border px-4 py-5">
      <span className="grid size-8 place-items-center border border-primary/35 bg-primary/10">
        <img src={klaimLogo} alt="" className="size-5 object-contain" />
      </span>
      <span>
        <span className="block text-sm font-semibold tracking-[0.2em] text-foreground">KLAIM</span>
        <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          {role === "verifier" ? "Verifier Console" : "Identity Console"}
        </span>
      </span>
    </Link>
  );
}

export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-background">
      <div className="klaim-app-bg" aria-hidden />
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col justify-between border-r border-border bg-card/30 backdrop-blur-md lg:flex">
        <div>
          <Brand role={role} />
          <div className="p-3">
            <NavLinks role={role} />
          </div>
        </div>
        <IdentityFooter role={role} />
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md lg:hidden">
        <Link to={role === "verifier" ? "/verifier/dashboard" : "/human/dashboard"} className="flex items-center gap-2">
          <span className="grid size-7 place-items-center border border-primary/35 bg-primary/10">
            <img src={klaimLogo} alt="" className="size-4 object-contain" />
          </span>
          <span className="text-sm font-semibold tracking-[0.2em]">KLAIM</span>
        </Link>
        <button
          type="button"
          aria-label="Toggle navigation"
          onClick={() => setOpen((v) => !v)}
          className="grid size-9 place-items-center border border-border text-muted-foreground"
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </header>

      {open ? (
        <div className="fixed inset-x-0 top-[57px] z-40 border-b border-border bg-background/98 p-3 backdrop-blur-md lg:hidden">
          <NavLinks role={role} onNavigate={() => setOpen(false)} />
          <IdentityFooter role={role} />
        </div>
      ) : null}

      <main className="relative lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
          <div className="mb-6 flex items-center gap-2 border border-dashed border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" />
            {role === "verifier"
              ? "Demo environment — simulated agent, MCP and x402 settlement"
              : "Demo environment — mocked credentials and proofs"}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
