import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  getCurrentUser,
  signin,
  signout,
  signup,
  type CurrentUser,
} from "../lib/api";
import { setAuthSnapshot } from "./AuthSnapshot";

export type AuthState = {
  user: CurrentUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (email: string, password: string, name?: string) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const u = await getCurrentUser();
      setUser(u);
      setError(null);
    } catch (e) {
      setError(String(e));
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Mirror auth state into the module-level snapshot so TanStack Router's
  // beforeLoad guards (which run outside React) read the same value.
  useEffect(() => {
    setAuthSnapshot({ user, loading });
  }, [user, loading]);

  const doSignIn = useCallback(
    async (email: string, password: string) => {
      await signin(email, password);
      await refresh();
    },
    [refresh],
  );

  const doSignOut = useCallback(async () => {
    try {
      await signout();
    } catch {
      // ignore - clear local state regardless
    }
    setUser(null);
  }, []);

  const doSignUp = useCallback(
    async (email: string, password: string, name = "") => {
      await signup(email, password, name);
      // Backend may auto-login on register (cookie set). Either way refresh.
      await refresh();
    },
    [refresh],
  );

  // Memoise so consumers depending on `auth` (the whole object) in their
  // effect deps don't see a new identity on every parent render. Identity
  // only changes when user / loading / error actually change.
  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      error,
      refresh,
      signIn: doSignIn,
      signOut: doSignOut,
      signUp: doSignUp,
    }),
    [user, loading, error, refresh, doSignIn, doSignOut, doSignUp],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
