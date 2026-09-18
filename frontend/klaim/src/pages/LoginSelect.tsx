/**
 * Actor selection — "How are you using KLAIM?"
 * Ported from the original app (src/routes/login.index.tsx), TanStack Link ->
 * react-router-dom Link. Human -> /login/human, Verifier -> /login/verifier.
 */
import { Link } from "react-router-dom";
import { ArrowRight, Bot, Fingerprint, ShieldCheck, UserRound } from "lucide-react";

const roles = [
  {
    to: "/login/human",
    icon: UserRound,
    eyebrow: "Human",
    title: "Verify your identity privately.",
    body: "Manage your DID and trusted credentials. Prove only what a verifier asks for — nothing else.",
    cta: "Continue as Human",
    points: ["Owns the DID", "Owns trusted credentials", "Never pays for verification"],
  },
  {
    to: "/login/verifier",
    icon: Bot,
    eyebrow: "Verifier",
    title: "Verify humans through AI agents.",
    body: "Request privacy-preserving verification via MCP and pay per verification with x402 on Algorand Testnet.",
    cta: "Continue as Verifier",
    points: ["Runs the AI agent", "Requests a claim", "Pays 0.01 USDC per verification"],
  },
] as const;

export function LoginSelect() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-16">
      <div className="klaim-app-bg" aria-hidden />
      <div className="relative w-full max-w-4xl">
        <Link to="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center border border-primary/35 bg-primary/10 text-primary">
            <Fingerprint className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-[0.2em] text-foreground">KLAIM</span>
        </Link>

        <h1 className="mt-10 text-3xl font-medium tracking-[-0.03em] text-foreground sm:text-4xl">
          How are you using KLAIM?
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          KLAIM has two distinct actors. Humans hold the identity. Verifiers, through their AI agents, request and pay
          for a single proven claim.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {roles.map(({ to, icon: Icon, eyebrow, title, body, cta, points }) => (
            <Link
              key={to}
              to={to}
              className="group flex flex-col justify-between border border-border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-primary/[0.05]"
            >
              <div>
                <span className="grid size-10 place-items-center border border-primary/35 bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
                <h2 className="mt-2 text-xl font-medium tracking-[-0.02em] text-foreground">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                <ul className="mt-5 space-y-1.5">
                  {points.map((p) => (
                    <li key={p} className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      · {p}
                    </li>
                  ))}
                </ul>
              </div>
              <span className="mt-8 flex items-center justify-between border-t border-border pt-4 text-sm text-foreground">
                {cta}
                <ArrowRight className="size-4 text-primary transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-8 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          Demo authentication only. No real account system is connected yet.
        </p>
      </div>
    </div>
  );
}
