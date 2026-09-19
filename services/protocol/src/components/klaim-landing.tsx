import { Button } from "@/components/ui/button";
import {
  ArrowDown,
  ArrowRight,
  Binary,
  Blocks,
  Check,
  ChevronRight,
  CircleDollarSign,
  Code2,
  Fingerprint,
  Github,
  KeyRound,
  LockKeyhole,
  Network,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserCheck,
  WalletCards,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import klaimLogo from "@/assets/klaim-logo.png";
import { useEffect, useState, type ReactNode } from "react";

const navItems = [
  ["Product", "#product"],
  ["How It Works", "#how-it-works"],
  ["Privacy", "#privacy"],
  ["Developers", "#developers"],
] as const;

function Wordmark() {
  return (
    <a href="#top" className="group flex items-center gap-3" aria-label="KLAIM home">
      <span className="grid size-8 place-items-center border border-primary/35 bg-primary/10 transition-colors group-hover:bg-primary/15">
        <img src={klaimLogo} alt="KLAIM logo" className="size-5 object-contain" />
      </span>
      <span>
        <span className="block text-sm font-semibold tracking-[0.2em] text-foreground">KLAIM</span>
        <span className="hidden text-[9px] uppercase tracking-[0.16em] text-muted-foreground sm:block">
          Human Verification for Agents
        </span>
      </span>
    </a>
  );
}

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 20);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={`site-nav ${scrolled ? "site-nav-scrolled" : ""}`}>
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8" aria-label="Main navigation">
        <Wordmark />
        <div className="hidden items-center gap-7 lg:flex">
          {navItems.map(([label, href]) => (
            <a key={href} href={href} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
              {label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <a href="https://github.com" target="_blank" rel="noreferrer"><Github />GitHub</a>
          </Button>
          <Button asChild size="sm" className="shadow-glow">
            <a href="/login">Launch Console <ArrowRight /></a>
          </Button>

        </div>
      </nav>
    </header>
  );
}

function ProofCapsule() {
  return (
    <div className="proof-scene" aria-label="Animated cryptographic proof capsule">
      <div className="scene-grid" />
      <div className="light-ray light-ray-one" />
      <div className="light-ray light-ray-two" />
      <div className="orbit orbit-one"><span /></div>
      <div className="orbit orbit-two"><span /></div>
      <div className="capsule-wrap">
        <div className="capsule-top" />
        <div className="capsule">
          <div className="capsule-reflection" />
          <div className="proof-core">
            <div className="fingerprint-lines" />
            <div className="check-mark"><Check /></div>
          </div>
          <div className="data-node node-one" />
          <div className="data-node node-two" />
          <div className="data-node node-three" />
        </div>
        <div className="capsule-bottom" />
      </div>
      <div className="tech-label label-payment"><CircleDollarSign /> x402</div>
      <div className="tech-label label-zk"><LockKeyhole /> ZK PROOF</div>
      <div className="tech-label label-verified"><ShieldCheck /> AGE &gt; 18</div>
      <div className="tech-label label-algo"><Network /> ALGORAND</div>
      <div className="tech-label label-mcp"><Blocks /> MCP</div>
      <div className="signal-strip" aria-hidden="true">
        {['HUMAN', 'CREDENTIAL', 'ZK PROOF', 'VERIFIED CLAIM'].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span className="signal-dot" style={{ animationDelay: `${i * 1.2}s` }} />
            <span>{label}</span>{i < 3 && <ChevronRight className="size-3" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ eyebrow, title, copy, center = false }: { eyebrow?: string; title: ReactNode; copy?: string; center?: boolean }) {
  return (
    <div className={`section-title reveal ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2>{title}</h2>
      {copy && <p>{copy}</p>}
    </div>
  );
}

function StepFlow({ steps, dominant = false }: { steps: string[]; dominant?: boolean }) {
  return (
    <div className={`vertical-flow ${dominant ? "vertical-flow-dominant" : ""}`}>
      {steps.map((step, index) => (
        <div key={step} className="contents">
          <div className="flow-node">
            <span className="flow-index">{String(index + 1).padStart(2, "0")}</span>
            <span>{step}</span>
            {step.includes("CLAIM") && <Check className="ml-auto size-4 text-primary" />}
          </div>
          {index < steps.length - 1 && <ArrowDown className="flow-arrow" />}
        </div>
      ))}
    </div>
  );
}

function TerminalPanel() {
  return (
    <div className="terminal-panel reveal" aria-label="Example x402 terminal output">
      <div className="terminal-bar"><span /><span /><span /><p>klaim-cli — example</p></div>
      <div className="terminal-body">
        <p><span className="terminal-method">MCP</span> verify_age()</p>
        <p><span className="terminal-method">POST</span> /verify/age</p>
        <p className="terminal-warning">402 Payment Required</p>
        <div className="terminal-data">
          <p><span>amount:</span> 0.01 USDC</p>
          <p><span>network:</span> Algorand Testnet</p>
          <p><span>status:</span> payment signed</p>
        </div>
        <div className="terminal-rule" />
        <p className="terminal-success">ZK PROOF VERIFIED <Check /></p>
        <div className="terminal-data">
          <p><span>claim:</span> AGE &gt; 18 ✓</p>
          <p><span>privacy:</span> DOB not disclosed</p>
          <p><span>receipt:</span> TX 7K...X92</p>
        </div>
        <span className="terminal-cursor" />
      </div>
      <div className="terminal-foot"><span>Example x402 flow</span><span>Illustrative</span></div>
    </div>
  );
}

const problems = [
  ["TOO MUCH DATA", "Applications often receive dates of birth, document images, addresses and other personal information when they only need one fact.", ScanFace],
  ["FRAGMENTED", "Businesses repeatedly integrate and handle sensitive identity workflows across products and credential providers.", Network],
  ["NOT AGENT-NATIVE", "AI agents can perform tasks, but lack a simple way to request and pay for trusted human verification.", Binary],
] as const;

const technologies = [
  ["MCP", "AI agent interface", Blocks],
  ["x402", "Pay-per-use autonomous payments", CircleDollarSign],
  ["Algorand", "USDC settlement layer", Network],
  ["Zero-Knowledge Proofs", "Privacy-preserving verification", LockKeyhole],
  ["Trusted Credentials", "DigiLocker and credential providers", Fingerprint],
] as const;

const useCases = [
  ["AI ONBOARDING", "Agents can verify customer identity during automated onboarding.", Sparkles],
  ["FINTECH", "Verify human eligibility without exposing unnecessary identity data.", WalletCards],
  ["GIG ECONOMY", "Verify worker credentials and licenses.", UserCheck],
  ["AGE-GATED SERVICES", "Prove age eligibility without revealing date of birth.", ShieldCheck],
  ["WEB3", "Verify human identity claims while minimizing exposed data.", KeyRound],
] as const;

const paymentSteps: ReadonlyArray<readonly [string, string, LucideIcon]> = [
  ["AI AGENT → KLAIM MCP", "verify_age() · POST /verify/age", Code2],
  ["402 PAYMENT REQUIRED", "Agent signs 0.01 USDC payment", CircleDollarSign],
  ["SETTLE", "USDC · Algorand Testnet", Network],
  ["VERIFY + PROVE", "Credential check · ZK proof", LockKeyhole],
  ["RESPOND", "Age > 18 · DOB not disclosed · TX receipt", Check],
];

const howSteps: ReadonlyArray<readonly [string, string]> = [
  ["CONSENT", "The human authorizes use of their trusted credential."],
  ["VERIFY", "KLAIM verifies the credential with its trusted provider."],
  ["PROVE", "A Zero-Knowledge Proof proves the required claim."],
  ["PAY", "The AI agent pays per request using x402."],
  ["RESPOND", "KLAIM returns the verified claim and payment receipt."],
];

const whyKlaim = [
  ["AGENT-NATIVE", "AI agents can request human verification through MCP.", Blocks],
  ["PRIVACY-FIRST", "ZK proofs reveal claims, not unnecessary identity data.", LockKeyhole],
  ["PAY-PER-USE", "x402 enables verification to be paid for per request.", CircleDollarSign],
  ["ALGORAND SETTLEMENT", "Payments settle using USDC on Algorand.", Network],
] as const;

export function KlaimLanding() {
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("revealed"));
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <main id="top" className="overflow-hidden bg-background text-foreground">
      <Navbar />

      <section className="hero-section">
        <div className="hero-grid-bg" />
        <div className="mx-auto grid min-h-[780px] max-w-7xl items-center gap-6 px-5 pb-16 pt-28 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:pt-20">
          <div className="relative z-10 max-w-2xl">
            <div className="hero-badge"><span />PAY-PER-USE HUMAN IDENTITY VERIFICATION</div>
            <h1>Human Identity Verification,<br /><span>Built for AI Agents.</span></h1>
            <p className="hero-copy">Let AI agents verify human identity claims, pay per verification with x402, and receive only the proof they need.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-12 px-6 shadow-glow"><a href="#agent-experience">Try KLAIM <ArrowRight /></a></Button>
              <Button asChild variant="outline" size="lg" className="h-12 border-border/80 bg-secondary/30 px-6 backdrop-blur"><a href="#how-it-works">See How It Works</a></Button>
            </div>
            <p className="mt-8 font-mono text-[11px] tracking-[0.14em] text-muted-foreground">x402 • ALGORAND • MCP • ZERO-KNOWLEDGE</p>
          </div>
          <ProofCapsule />
        </div>
        <div className="scroll-cue"><span>SCROLL TO TRACE THE PROOF</span><ArrowDown /></div>
      </section>

      <section id="product" className="section-shell border-t border-border/50">
        <SectionTitle eyebrow="THE PROBLEM" title="One fact shouldn't require an entire identity." copy="A service may only need to know whether a person is over 18. Traditional verification can still force businesses to receive and process the person's date of birth, government ID, document images and address." />
        <div className="mt-14 grid gap-px overflow-hidden border border-border bg-border md:grid-cols-3">
          {problems.map(([title, copy, Icon], index) => (
            <article key={title} className="feature-card reveal">
              <div className="card-number">0{index + 1}</div><Icon className="size-6 text-primary" />
              <h3>{title}</h3><p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="section-shell section-tint">
        <SectionTitle eyebrow="HUMAN + AGENT FLOW" title="The human proves. The agent requests." copy="KLAIM verifies human claims from trusted credentials. The AI agent is the requester — and receives the verified claim, never the human's document." />
        <div className="mt-14 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="flow-column reveal"><p className="flow-label">HUMAN · THE PERSON BEING VERIFIED</p><StepFlow steps={["HUMAN CONSENT", "TRUSTED CREDENTIAL", "KLAIM VERIFICATION", "ZERO-KNOWLEDGE PROOF", "VERIFIED CLAIM"]} /></div>
          <div className="flow-column flow-column-primary reveal"><div className="flex items-center justify-between"><p className="flow-label text-primary">AI AGENT · THE REQUESTER</p><span className="live-chip"><span />NO DOCUMENT SHARED</span></div><StepFlow dominant steps={["AI AGENT", "MCP · verify_age()", "x402 · PAY PER REQUEST", "KLAIM", "RECEIVE VERIFIED CLAIM ONLY"]} /></div>
        </div>
        <p className="flow-outcome reveal"><ShieldCheck /> The AI agent receives “Age &gt; 18 ✓” — not the credential, document, or date of birth.</p>
      </section>

      <section className="section-shell">
        <SectionTitle eyebrow="HOW KLAIM WORKS" title="Only what is needed. Nothing more." copy="A consent-led verification flow designed for humans, agents and machine-readable outcomes." />
        <div className="how-grid reveal mt-14">
          {howSteps.map(([title, copy], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className="section-shell section-tint">
        <SectionTitle eyebrow="AUTONOMOUS SETTLEMENT" title="Pay only when verification happens." copy="KLAIM uses x402 to turn identity verification into an autonomous pay-per-request service." />
        <div className="mt-14 grid items-center gap-12 lg:grid-cols-2">
          <div className="payment-flow reveal">
            {paymentSteps.map(([title, text, Icon], i) => (
              <div className="payment-step" key={title}><span className="payment-line" /><div className="payment-icon"><Icon /></div><div><p>{title}</p><span>{text}</span></div><b>{String(i + 1).padStart(2, "0")}</b></div>
            ))}
          </div>
          <TerminalPanel />
        </div>
      </section>

      <section id="privacy" className="section-shell">
        <SectionTitle eyebrow="PRIVACY BY DESIGN" title={<>Prove the claim.<br /><span className="text-muted-foreground">Don't expose the identity.</span></>} copy="KLAIM uses privacy-preserving verification and Zero-Knowledge Proofs to prove specific claims without unnecessarily exposing the underlying identity data." />
        <div className="comparison-grid mt-14">
          <div className="comparison-panel muted-panel reveal"><div className="comparison-head"><ScanFace /><span>TRADITIONAL</span></div><StepFlow steps={["HUMAN", "UPLOAD / SHARE DOCUMENT", "VERIFIER RECEIVES IDENTITY DATA", "STORE / PROCESS PII", "VERIFY"]} /><div className="attribute-cloud">{["Date of Birth", "Government ID", "Document Image", "Address"].map(x => <span key={x}>{x}</span>)}</div></div>
          <div className="comparison-divider"><span>VS</span></div>
          <div className="comparison-panel secure-panel reveal"><div className="comparison-head"><ShieldCheck /><span>KLAIM</span></div><StepFlow dominant steps={["HUMAN", "CONSENT", "TRUSTED CREDENTIAL", "ZK PROOF", "VERIFIED CLAIM"]} /><div className="claim-status"><p>REQUIRED CLAIM</p><strong>AGE &gt; 18 <Check /></strong></div><div className="secure-row"><span>Date of birth</span><b>NOT DISCLOSED</b></div><div className="secure-row"><span>Document</span><b>NOT DISCLOSED</b></div></div>
        </div>
        <p className="mt-7 flex items-center gap-2 font-mono text-xs text-primary"><LockKeyhole className="size-4" /> INPUT: trusted date of birth · OUTPUT: Age &gt; 18 ✓ · DOB not disclosed</p>
      </section>

      <section id="agent-experience" className="section-shell">
        <SectionTitle eyebrow="AGENT EXPERIENCE" title="Let AI agents verify the people they serve." copy="KLAIM exposes human verification capabilities through MCP so AI agents can request identity claims programmatically." />
        <div className="agent-console reveal mt-14">
          <div className="console-sidebar"><div><span className="status-dot" />KLAIM MCP</div><p>Tools</p><button className="active-tool" type="button"><ShieldCheck />verify_age()</button><button type="button"><UserCheck />verify_identity()</button><button type="button"><WalletCards />verify_license()</button></div>
          <div className="console-main"><div className="console-top"><span>Agent session</span><span className="mcp-label">MCP-ENABLED</span></div><div className="conversation"><div className="message"><span>USER</span><p>Check if this customer is eligible for an age-restricted service.</p></div><div className="message"><span>AI AGENT</span><p>I'll verify their age.</p></div><div className="tool-call"><div><Terminal /><span>MCP TOOL · KLAIM ZK VERIFICATION</span></div><code>verify_age()</code><div className="tool-payment"><span>x402 · Algorand</span><b>0.01 USDC</b></div></div><div className="result-row"><div className="success-check"><Check /></div><div><span>VERIFIED HUMAN CLAIM</span><p>Human verified · Age &gt; 18 · No DOB disclosed</p></div></div></div></div>
        </div>
      </section>

      <section className="section-shell section-tint">
        <SectionTitle eyebrow="TECHNOLOGY" title="Built on open infrastructure." />
        <div className="mt-12 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
          {technologies.map(([title, copy, Icon]) => <article className="tech-card reveal" key={title}><Icon /><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className="section-shell">
        <SectionTitle eyebrow="USE CASES" title="Verification for the agentic economy." />
        <div className="use-case-grid mt-12">
          {useCases.map(([title, copy, Icon], i) => <article className={`use-card reveal use-card-${i + 1}`} key={title}><div><Icon /><span>0{i + 1}</span></div><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section className="section-shell section-tint">
        <SectionTitle eyebrow="WHY KLAIM" title="Verification infrastructure for the agentic economy." />
        <div className="mt-12 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {whyKlaim.map(([title, copy, Icon], index) => <article className={`tech-card reveal ${index === 1 || index === 2 ? "tech-card-emphasis" : ""}`} key={title}><Icon /><h3>{title}</h3><p>{copy}</p></article>)}
        </div>
      </section>

      <section id="developers" className="section-shell">
        <SectionTitle eyebrow="DEVELOPER VALUE" title={<>One verification capability.<br /><span className="text-primary">Any agent.</span></>} />
        <div className="capability-rail reveal mt-14">
          {[['MCP','verify_age()'],['API','POST /verify/age'],['PAYMENT','x402'],['SETTLEMENT','Algorand'],['RESULT','Verified Claim']].map(([k,v], i) => <div className="contents" key={k}><div className="capability"><span>{k}</span><strong>{v}</strong></div>{i < 4 && <ChevronRight className="rail-arrow" />}</div>)}
        </div>
        <Button asChild variant="outline" className="mt-8"><a href="#agent-experience">Build with KLAIM <ArrowRight /></a></Button>
      </section>

      <section className="final-cta">
        <div className="final-grid" />
        <div className="relative z-10 mx-auto max-w-5xl px-5 text-center">
          <p className="eyebrow justify-center">IDENTITY, MINIMIZED</p>
          <h2>Let agents verify humans.<br /><span>Without exposing them.</span></h2>
          <p>Programmable human identity verification with Zero-Knowledge Proofs and autonomous x402 payments.</p>
          <div className="mt-9 flex flex-wrap justify-center gap-3"><Button asChild size="lg" className="h-12 px-6 shadow-glow"><a href="#agent-experience">Try KLAIM <ArrowRight /></a></Button><Button asChild variant="outline" size="lg" className="h-12 px-6"><a href="https://github.com" target="_blank" rel="noreferrer"><Github />View GitHub</a></Button></div>
          <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Built for the x402 Global Challenge · Algorand Testnet</p>
        </div>
      </section>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8"><div className="flex flex-col justify-between gap-8 md:flex-row"><div><Wordmark /><p className="mt-4 max-w-xs text-sm text-muted-foreground">Pay-per-use human identity verification for AI agents.</p></div><div className="flex flex-wrap gap-x-7 gap-y-3">{navItems.map(([l,h]) => <a className="text-xs text-muted-foreground hover:text-foreground" href={h} key={h}>{l}</a>)}<a href="https://github.com" className="text-xs text-muted-foreground hover:text-foreground">GitHub</a></div></div><div className="mt-12 flex flex-col justify-between gap-3 border-t border-border pt-6 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:flex-row"><span>© 2026 KLAIM</span><span>x402 · Algorand · MCP · Zero-Knowledge Proofs</span></div></div>
      </footer>
    </main>
  );
}