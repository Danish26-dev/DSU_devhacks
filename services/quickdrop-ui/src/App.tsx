import { useCallback, useEffect, useRef, useState } from "react";

import { ALL_CLAIMS, ApiError, klaim, type ClaimType, type VerificationStatus } from "@/lib/klaim-api";
import {
  ArrowRight,
  Check,
  Hash,
  Info,
  Loader,
  ScooterIcon,
  ShieldCheck,
} from "@/components/icons";
import { InstallButton } from "@/components/InstallButton";

/* ------------------------------------------------------------- constants */

const CLAIM_META: Record<ClaimType, { title: string; desc: string }> = {
  identity_verified: { title: "Identity verified", desc: "You are a real, verified person" },
  age_over_18: { title: "Age over 18", desc: "Eligible to work as a partner" },
  license_valid: { title: "Valid driving license", desc: "Required to deliver" },
};

/** The tracker steps and which lifecycle statuses map to each. */
const TRACK: { label: string; reached: VerificationStatus[]; activeAt: VerificationStatus[] }[] = [
  { label: "Verification request created", reached: ["PENDING_CONSENT", "CONSENT_GRANTED", "PAYMENT_REQUIRED", "PAYMENT_SETTLED", "VERIFYING", "PROOF_GENERATED", "VERIFIED"], activeAt: ["CREATED"] },
  { label: "Waiting for your authorization", reached: ["CONSENT_GRANTED", "PAYMENT_REQUIRED", "PAYMENT_SETTLED", "VERIFYING", "PROOF_GENERATED", "VERIFIED"], activeAt: ["PENDING_CONSENT"] },
  { label: "Credential verification", reached: ["PAYMENT_SETTLED", "VERIFYING", "PROOF_GENERATED", "VERIFIED"], activeAt: ["CONSENT_GRANTED", "PAYMENT_REQUIRED"] },
  { label: "Proof generation", reached: ["PROOF_GENERATED", "VERIFIED"], activeAt: ["VERIFYING"] },
  { label: "Verification complete", reached: ["VERIFIED"], activeAt: ["PROOF_GENERATED"] },
];

const FAILURES: VerificationStatus[] = ["DENIED", "PAYMENT_FAILED", "CREDENTIAL_INVALID", "VERIFICATION_FAILED"];
const CITIES = ["Bengaluru", "Mumbai", "Delhi", "Hyderabad", "Pune", "Chennai"];
const DEFAULT_DID = "did:identipi:demo-user-001";

type Screen = "landing" | "profile" | "verify" | "tracking";

/* ------------------------------------------------------------- app */

export function App() {
  const [screen, setScreen] = useState<Screen>("landing");

  // profile
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [city, setCity] = useState(CITIES[0]);

  // verify
  const [did, setDid] = useState(DEFAULT_DID);
  const [claims, setClaims] = useState<ClaimType[]>([...ALL_CLAIMS]);

  // tracking
  const [requestId, setRequestId] = useState<string | null>(null);
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof klaim.getResult>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const poll = useRef<number | null>(null);

  const stopPoll = useCallback(() => {
    if (poll.current !== null) {
      window.clearInterval(poll.current);
      poll.current = null;
    }
  }, []);

  const toggleClaim = (c: ClaimType) =>
    setClaims((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...ALL_CLAIMS.filter((a) => cur.includes(a) || a === c)]));

  // Guards so each verifier-driven step fires at most once.
  const settling = useRef(false);
  const verifying = useRef(false);
  const [payPrompt, setPayPrompt] = useState(false); // show the Authorize-payment dialog
  const [paying, setPaying] = useState(false);

  const refresh = useCallback(async (id: string) => {
    try {
      const snap = await klaim.getRequest(id);
      setStatus(snap.status);
      setError(null);

      // VERIFIER PAYS: when the user has consented (PAYMENT_REQUIRED), prompt the
      // verifier to authorize payment. Settlement is NOT automatic — it fires
      // only when the verifier clicks Authorize (see authorizePayment). This is
      // the single deliberate driver, which also avoids any settle/verify race.
      if (snap.status === "PAYMENT_REQUIRED" && !settling.current) {
        setPayPrompt(true);
      }
      // Once payment settles, QuickDrop triggers proof generation (once).
      if (snap.status === "PAYMENT_SETTLED" && !verifying.current) {
        verifying.current = true;
        await klaim.verify(id).catch(() => undefined);
      }

      if (snap.status === "VERIFIED") {
        setResult(await klaim.getResult(id).catch(() => null));
        stopPoll();
      }
      if (FAILURES.includes(snap.status)) stopPoll();
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setError("KLAIM API unreachable — retrying…");
    }
  }, [stopPoll]);

  // Verifier authorizes + pays. Only here is settle() ever called.
  const authorizePayment = useCallback(async () => {
    if (!requestId || settling.current) return;
    settling.current = true;
    setPaying(true);
    try {
      await klaim.settle(requestId).catch(() => undefined);
      setPayPrompt(false);
      void refresh(requestId);
    } finally {
      setPaying(false);
    }
  }, [requestId, refresh]);

  const startVerification = useCallback(async () => {
    if (!did.trim() || claims.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    settling.current = false;
    verifying.current = false;
    setPayPrompt(false);
    try {
      const created = await klaim.createRequest(did.trim(), claims);
      setRequestId(created.requestId);
      setStatus(created.status);
      setScreen("tracking");
      // DEMO mode only: no separate wallet, so QuickDrop also grants consent.
      // The poll loop then drives settle (verifier pays) + verify. In LIVE mode
      // the user's wallet grants consent; QuickDrop only pays + tracks.
      if (klaim.demoMode) void klaim.demoConsent(created.requestId).then(() => refresh(created.requestId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start verification");
    } finally {
      setBusy(false);
    }
  }, [did, claims, refresh]);

  useEffect(() => {
    if (screen !== "tracking" || !requestId) return;
    void refresh(requestId);
    poll.current = window.setInterval(() => void refresh(requestId), 1500);
    return stopPoll;
  }, [screen, requestId, refresh, stopPoll]);

  const restart = () => {
    stopPoll();
    setScreen("landing");
    setRequestId(null);
    setStatus(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="qd-shell">
      <div className="qd-viewport">
        {screen === "landing" && <Landing onStart={() => setScreen("profile")} />}
        {screen === "profile" && (
          <Profile
            name={name} mobile={mobile} city={city}
            setName={setName} setMobile={setMobile} setCity={setCity}
            onContinue={() => setScreen("verify")}
          />
        )}
        {screen === "verify" && (
          <VerifyIdentity
            did={did} setDid={setDid}
            claims={claims} toggleClaim={toggleClaim}
            demoMode={klaim.demoMode}
            busy={busy} error={error}
            onBack={() => setScreen("profile")}
            onVerify={() => void startVerification()}
          />
        )}
        {screen === "tracking" && (
          <Tracking
            requestId={requestId} status={status} result={result} error={error}
            onRefresh={() => requestId && void refresh(requestId)}
            onRestart={restart}
          />
        )}
      </div>

      {payPrompt ? (
        <AuthorizePaymentDialog
          amountUsdc={0.01}
          claims={claims}
          paying={paying}
          onAuthorize={() => void authorizePayment()}
          onClose={() => setPayPrompt(false)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------ verifier payment authorization */

function AuthorizePaymentDialog({
  amountUsdc, claims, paying, onAuthorize, onClose,
}: {
  amountUsdc: number;
  claims: ClaimType[];
  paying: boolean;
  onAuthorize: () => void;
  onClose: () => void;
}) {
  return (
    <div className="qd-modal-backdrop" role="dialog" aria-modal="true">
      <div className="qd-card qd-modal">
        <p className="qd-eyebrow" style={{ textAlign: "left" }}>QuickDrop · Verifier</p>
        <h1 className="qd-title left" style={{ fontSize: 24 }}>Authorize payment</h1>
        <p className="qd-sub left">
          The applicant approved the request in their KLAIM wallet. As the verifier, QuickDrop pays for this
          verification — the applicant never pays.
        </p>
        <div className="qd-readout">
          <div className="k">Amount</div>
          <div className="v">{amountUsdc.toFixed(2)} USDC · Algorand Testnet</div>
        </div>
        <div className="qd-readout" style={{ marginTop: 10 }}>
          <div className="k">Claims</div>
          <div className="v" style={{ fontSize: 13 }}>{claims.length} requested</div>
        </div>
        <button className="qd-btn" disabled={paying} onClick={onAuthorize} style={{ marginTop: 16 }}>
          {paying ? <Loader /> : null} Authorize &amp; Pay {amountUsdc.toFixed(2)} USDC
        </button>
        <button className="qd-back" disabled={paying} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- screen 1 */

function Landing({ onStart }: { onStart: () => void }) {
  const benefits = [
    "Flexible hours — you choose when to work",
    "Weekly payouts, straight to your account",
    "Your ID documents are never shared with QuickDrop",
  ];
  return (
    <div className="qd-card">
      <div className="qd-brand-tile"><ScooterIcon /></div>
      <p className="qd-eyebrow">QuickDrop Partners</p>
      <h1 className="qd-title">Become a Delivery Partner</h1>
      <p className="qd-sub">
        Deliver when you want. Earn on your schedule. Complete a quick, privacy-first verification and start
        delivering with QuickDrop.
      </p>
      {benefits.map((b) => (
        <div className="qd-benefit" key={b}>
          <span className="qd-benefit-icon"><ShieldCheck /></span>
          <span className="qd-benefit-text">{b}</span>
        </div>
      ))}
      <div style={{ marginTop: 18 }}>
        <button className="qd-btn" onClick={onStart}>Start Onboarding</button>
        <InstallButton />
      </div>
      <p className="qd-btn-note">Takes about 2 minutes. Verification is handled securely by KLAIM.</p>
    </div>
  );
}

/* ------------------------------------------------------------- screen 2 */

function Profile({
  name, mobile, city, setName, setMobile, setCity, onContinue,
}: {
  name: string; mobile: string; city: string;
  setName: (v: string) => void; setMobile: (v: string) => void; setCity: (v: string) => void;
  onContinue: () => void;
}) {
  const canContinue = name.trim().length > 0 && mobile.trim().length >= 6;
  return (
    <div className="qd-card">
      <p className="qd-stepcount">Step 1 of 2</p>
      <h1 className="qd-title left">Create your delivery partner profile</h1>
      <p className="qd-sub left">Just a few basics to get started. We'll verify your eligibility in the next step.</p>

      <label className="qd-label" htmlFor="name">Full Name</label>
      <input id="name" className="qd-input" placeholder="e.g. Aarav Sharma" value={name} onChange={(e) => setName(e.target.value)} />

      <label className="qd-label" htmlFor="mobile">Mobile Number</label>
      <input id="mobile" className="qd-input" placeholder="e.g. 98765 43210" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />

      <label className="qd-label" htmlFor="city">City</label>
      <select id="city" className="qd-select" value={city} onChange={(e) => setCity(e.target.value)}>
        {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>

      <div style={{ marginTop: 22 }}>
        <button className="qd-btn" disabled={!canContinue} onClick={onContinue}>Continue</button>
      </div>
      <p className="qd-btn-note">We only collect basic contact details. No identity documents here.</p>
    </div>
  );
}

/* ------------------------------------------------------------- screen 3 */

function VerifyIdentity({
  did, setDid, claims, toggleClaim, demoMode, busy, error, onBack, onVerify,
}: {
  did: string; setDid: (v: string) => void;
  claims: ClaimType[]; toggleClaim: (c: ClaimType) => void;
  demoMode: boolean; busy: boolean; error: string | null;
  onBack: () => void; onVerify: () => void;
}) {
  return (
    <div className="qd-card">
      <div className="qd-steps">
        <span className="qd-step-chip done"><span className="n"><Check /></span> Your details</span>
        <span className="qd-step-sep" />
        <span className="qd-step-chip active"><span className="n">2</span> Verify identity</span>
      </div>

      <h1 className="qd-title left">Verify your identity</h1>
      <p className="qd-sub left">
        Confirm the decentralized identifier (DID) linked to your KLAIM identity wallet. We'll send a verification
        request you can approve from your wallet.
      </p>

      {demoMode ? (
        <div className="qd-callout">
          <b>Demo mode.</b> KLAIM responses are simulated so you can preview the full flow. Set a real{" "}
          <code>VITE_KLAIM_API_URL</code> to connect to the live service.
        </div>
      ) : null}

      <label className="qd-label" htmlFor="did">Your DID</label>
      <div className="qd-input-wrap">
        <span className="qd-hash"><Hash /></span>
        <input id="did" className="qd-input mono" value={did} onChange={(e) => setDid(e.target.value)} placeholder="did:identipi:…" />
      </div>

      <div className="qd-claims" style={{ marginTop: 16 }}>
        {ALL_CLAIMS.map((c) => {
          const on = claims.includes(c);
          return (
            <div key={c} className={`qd-claim ${on ? "on" : ""}`} onClick={() => toggleClaim(c)}>
              <span className="box">{on ? <Check /> : null}</span>
              <span>
                <span className="t">{CLAIM_META[c].title}</span><br />
                <span className="d">{CLAIM_META[c].desc}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="qd-callout info">
        <span className="qd-callout-icon"><Info /></span>
        <span>
          <b>What happens next?</b> KLAIM sends a request to your identity wallet. You approve it there, and QuickDrop
          only receives the verified result — never your documents.
        </span>
      </div>

      {error ? <div className="qd-error">{error}</div> : null}

      <button className="qd-btn" disabled={busy || !did.trim() || claims.length === 0} onClick={onVerify}>
        {busy ? <Loader /> : null}
        Verify with KLAIM <ArrowRight />
      </button>
      <button className="qd-back" onClick={onBack}>← Back</button>
    </div>
  );
}

/* ------------------------------------------------------------- screen 4 */

function Tracking({
  requestId, status, result, error, onRefresh, onRestart,
}: {
  requestId: string | null;
  status: VerificationStatus | null;
  result: Awaited<ReturnType<typeof klaim.getResult>> | null;
  error: string | null;
  onRefresh: () => void;
  onRestart: () => void;
}) {
  const failed = status ? FAILURES.includes(status) : false;
  const done = status === "VERIFIED";
  const proofId = result?.proof?.proofId ?? result?.proofId ?? null;
  const tx = result?.payment?.txId ?? null;
  const explorer = result?.payment?.explorerUrl ?? null;

  return (
    <div className="qd-card">
      <p className="qd-eyebrow" style={{ textAlign: "left" }}>KLAIM Verification</p>
      <h1 className="qd-title left">
        {done ? "You're verified" : failed ? "Verification stopped" : "Verifying your eligibility"}
      </h1>
      <p className="qd-sub left">
        {done
          ? "Your claims were verified without sharing any documents. You can start delivering with QuickDrop."
          : failed
            ? "The verification could not be completed. You can start over and try again."
            : "Your verification request has been sent. Approve it from your KLAIM identity wallet to continue."}
      </p>

      <div className="qd-readout">
        <div className="k">Request</div>
        <div className="v">{requestId ?? "—"}</div>
      </div>

      <div className="qd-track">
        {TRACK.map((step, i) => {
          const reached = status ? step.reached.includes(status) : false;
          const active = status ? step.activeAt.includes(status) : false;
          const lineDone = status
            ? TRACK[i + 1]?.reached.includes(status) ?? step.reached.includes(status)
            : false;
          return (
            <div className="qd-track-item" key={step.label}>
              <div className="qd-track-rail">
                <span className={`qd-track-dot ${reached ? "done" : active ? "active" : ""}`}>
                  {reached ? <Check /> : null}
                </span>
                <span className={`qd-track-line ${lineDone ? "done" : ""}`} />
              </div>
              <div className={`qd-track-label ${reached || active ? "" : "pending"}`}>{step.label}</div>
            </div>
          );
        })}
      </div>

      {!done && !failed ? (
        <p className="qd-note">
          <b>Waiting for authorization.</b> <span className="qd-note muted">Please approve the request from your KLAIM identity wallet.</span>
        </p>
      ) : null}

      {done ? (
        <div className="qd-result">
          <div className="row"><span className="k">Result</span><span className="v ok">Verified ✓</span></div>
          {result?.claims ? Object.entries(result.claims).map(([c, v]) => (
            <div className="row" key={c}><span className="k">{CLAIM_META[c as ClaimType]?.title ?? c}</span><span className="v ok">{v ? "TRUE" : "FALSE"}</span></div>
          )) : null}
          {proofId ? <div className="row"><span className="k">Proof</span><span className="v">{proofId}</span></div> : null}
          {tx ? (
            <div className="row">
              <span className="k">Transaction</span>
              <span className="v">{explorer ? <a className="qd-link" href={explorer} target="_blank" rel="noreferrer">{tx.slice(0, 14)}…</a> : tx}</span>
            </div>
          ) : null}
          <div className="row"><span className="k">Documents shared</span><span className="v">None</span></div>
        </div>
      ) : null}

      {error ? <div className="qd-error">{error}</div> : null}

      <div style={{ marginTop: 18 }}>
        {done || failed ? (
          <button className="qd-btn" onClick={onRestart}>{done ? "Done" : "Start over"}</button>
        ) : (
          <button className="qd-btn secondary" onClick={onRefresh}>Refresh Status</button>
        )}
      </div>

      <div className="qd-powered">
        <span className="pill"><ShieldCheck /> Powered by <b>KLAIM</b></span>
      </div>
    </div>
  );
}
