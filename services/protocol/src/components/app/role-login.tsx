import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useKlaim } from "@/lib/klaim/store";
import type { KlaimRole } from "@/lib/klaim/types";

interface RoleLoginProps {
  role: KlaimRole;
  title: string;
  subtitle: string;
  demoLabel: string;
  demoHint: string;
  defaultEmail: string;
}

export function RoleLogin({ role, title, subtitle, demoLabel, demoHint, defaultEmail }: RoleLoginProps) {
  const { user, hydrated, signInDemo, signInWithPassword } = useKlaim();
  const navigate = useNavigate();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("demo-password");
  const [pending, setPending] = useState<"form" | "demo" | null>(null);

  const home = role === "verifier" ? "/verifier/dashboard" : "/human/dashboard";

  useEffect(() => {
    if (hydrated && user && user.role === role) void navigate({ to: home, replace: true });
  }, [hydrated, user, role, home, navigate]);

  const go = async (mode: "form" | "demo") => {
    setPending(mode);
    try {
      if (mode === "demo") await signInDemo(role);
      else await signInWithPassword(email, password, role);
      await navigate({ to: home, replace: true });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-16">
      <div className="klaim-app-bg" aria-hidden />
      <div className="relative w-full max-w-md">
        <Link to="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center border border-primary/35 bg-primary/10 text-primary">
            <Fingerprint className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-[0.2em] text-foreground">KLAIM</span>
        </Link>

        <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
          {role === "verifier" ? "Verifier sign in" : "Human sign in"}
        </p>
        <h1 className="mt-2 text-3xl font-medium tracking-[-0.03em] text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>

        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void go("form");
          }}
        >
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full border border-border bg-background/70 px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
              required
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full border border-border bg-background/70 px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary/50"
              required
            />
          </label>
          <Button type="submit" className="w-full rounded-none" disabled={pending !== null}>
            {pending === "form" ? <Loader2 className="size-4 animate-spin" /> : null}
            Continue
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={() => void go("demo")}
          disabled={pending !== null}
          className="group flex w-full items-center justify-between border border-primary/30 bg-primary/[0.06] px-4 py-3.5 text-left transition-colors hover:bg-primary/10 disabled:opacity-60"
        >
          <span>
            <span className="block text-sm font-medium text-foreground">{demoLabel}</span>
            <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {demoHint}
            </span>
          </span>
          {pending === "demo" ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : (
            <ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-0.5" />
          )}
        </button>

        <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          Demo authentication only — credentials are not validated.
        </p>

        <Link
          to="/login"
          className="mt-6 inline-block font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Change role
        </Link>
      </div>
    </div>
  );
}
