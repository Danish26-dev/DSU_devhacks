import { Check, Copy, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <section
      className={cn(
        "border border-border bg-card/40 backdrop-blur-sm transition-colors",
        accent && "border-primary/30 bg-primary/[0.04]",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground">
        {title}
      </h2>
      {hint ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{hint}</span>
      ) : null}
    </header>
  );
}

export function PageHeading({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
      <div>
        {eyebrow ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 text-3xl font-medium tracking-[-0.03em] text-foreground sm:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatusPill({
  children,
  tone = "ok",
}: {
  children: ReactNode;
  tone?: "ok" | "muted" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em]",
        tone === "ok" && "border-primary/35 bg-primary/10 text-primary",
        tone === "muted" && "border-border bg-secondary/40 text-muted-foreground",
        tone === "warn" && "border-border bg-secondary/40 text-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function DemoTag({ label = "Demo" }: { label?: string }) {
  return (
    <span className="inline-flex items-center border border-dashed border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
      {label}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <Panel className="p-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <span className="text-primary/80">{icon}</span>
      </div>
      <p className="mt-5 text-2xl font-medium tracking-[-0.02em] text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Panel>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 py-3 last:border-b-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">{label}</span>
      <span className="text-right font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="group flex w-full items-center justify-between gap-3 border border-border bg-background/60 px-4 py-3 text-left transition-colors hover:border-primary/40"
    >
      <span className="min-w-0">
        {label ? (
          <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        ) : null}
        <span className="block truncate font-mono text-sm text-foreground">{value}</span>
      </span>
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground group-hover:text-primary">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

export function PrivacyNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 border border-primary/20 bg-primary/[0.04] px-4 py-3 text-xs leading-relaxed text-muted-foreground">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{children}</span>
    </p>
  );
}

export function FlowChain({ nodes }: { nodes: string[] }) {
  return (
    <div className="klaim-chain">
      {nodes.map((node, i) => (
        <div key={node} className="klaim-chain-item">
          <div className="klaim-chain-node">{node}</div>
          {i < nodes.length - 1 ? <span className="klaim-chain-arrow" aria-hidden /> : null}
        </div>
      ))}
    </div>
  );
}
