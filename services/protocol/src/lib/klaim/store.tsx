import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { demoAgents, seedCredentials, seedVerifications } from "./mock-data";
import { authService } from "./services";
import type {
  AgentEvent,
  Credential,
  KlaimRole,
  KlaimState,
  KlaimUser,
  VerificationRecord,
  VerifierAgent,
} from "./types";

const STORAGE_KEY = "klaim.demo.state.v2";

interface KlaimStore extends KlaimState {
  agents: VerifierAgent[];
  hydrated: boolean;
  signInDemo: (role: KlaimRole) => Promise<KlaimUser>;
  signInWithPassword: (email: string, password: string, role: KlaimRole) => Promise<KlaimUser>;
  signOut: () => void;
  addCredential: (credential: Credential) => void;
  removeCredential: (id: string) => void;
  addVerification: (record: VerificationRecord) => void;
  addAgent: (agent: VerifierAgent) => void;
  updateAgent: (id: string, patch: Partial<VerifierAgent>) => void;
  appendAgentEvents: (id: string, events: AgentEvent[]) => void;
}

const initialState: KlaimState & { agents: VerifierAgent[] } = {
  user: null,
  agents: demoAgents,
  credentials: seedCredentials,
  verifications: seedVerifications,
};

const KlaimContext = createContext<KlaimStore | null>(null);

export function KlaimProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<KlaimState & { agents: VerifierAgent[] }>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...initialState, ...(JSON.parse(raw) as typeof initialState) });
    } catch {
      /* ignore corrupt demo state */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  }, [state, hydrated]);

  const signInDemo = useCallback(async (role: KlaimRole) => {
    const user = await authService.loginWithDemoAccount(role);
    setState((s) => ({ ...s, user }));
    return user;
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string, role: KlaimRole) => {
    const user = await authService.loginWithPassword(email, password, role);
    setState((s) => ({ ...s, user }));
    return user;
  }, []);

  const signOut = useCallback(() => {
    void authService.logout();
    setState((s) => ({ ...s, user: null }));
  }, []);

  const addCredential = useCallback((credential: Credential) => {
    setState((s) => ({ ...s, credentials: [credential, ...s.credentials] }));
  }, []);

  const removeCredential = useCallback((id: string) => {
    setState((s) => ({ ...s, credentials: s.credentials.filter((c) => c.id !== id) }));
  }, []);

  const addVerification = useCallback((record: VerificationRecord) => {
    setState((s) => ({ ...s, verifications: [record, ...s.verifications] }));
  }, []);

  const addAgent = useCallback((agent: VerifierAgent) => {
    setState((s) => ({ ...s, agents: [agent, ...s.agents] }));
  }, []);

  const updateAgent = useCallback((id: string, patch: Partial<VerifierAgent>) => {
    setState((s) => ({
      ...s,
      agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }, []);

  const appendAgentEvents = useCallback((id: string, events: AgentEvent[]) => {
    setState((s) => ({
      ...s,
      agents: s.agents.map((a) =>
        a.id === id ? { ...a, events: [...events, ...a.events].slice(0, 40), lastActivity: "Just now" } : a,
      ),
    }));
  }, []);

  const value = useMemo<KlaimStore>(
    () => ({
      ...state,
      hydrated,
      signInDemo,
      signInWithPassword,
      signOut,
      addCredential,
      removeCredential,
      addVerification,
      addAgent,
      updateAgent,
      appendAgentEvents,
    }),
    [
      state,
      hydrated,
      signInDemo,
      signInWithPassword,
      signOut,
      addCredential,
      removeCredential,
      addVerification,
      addAgent,
      updateAgent,
      appendAgentEvents,
    ],
  );

  return <KlaimContext.Provider value={value}>{children}</KlaimContext.Provider>;
}

export function useKlaim() {
  const ctx = useContext(KlaimContext);
  if (!ctx) throw new Error("useKlaim must be used inside <KlaimProvider>");
  return ctx;
}
