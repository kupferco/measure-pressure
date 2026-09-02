import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@mp/shared';
import { api, ApiError } from './api';
import { clearToken, saveToken } from './session';

interface AuthState {
  user: User | null;
  /** True until we have checked for an existing session on this device. */
  loading: boolean;
  /**
   * How this person uses the app. There is no role on an account - someone is a
   * doctor because patients shared with them, and may also track their own
   * readings. These counts are what choose the home screen.
   */
  patientCount: number;
  readingCount: number;
  refresh(): Promise<void>;
  signIn(email: string, code: string): Promise<void>;
  signInWithToken(token: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [patientCount, setPatientCount] = useState(0);
  const [readingCount, setReadingCount] = useState(0);

  // A stored token may have expired while the app was closed, so it is not enough
  // to find one - we have to ask the server whether it still works.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then(({ user, patientCount, readingCount }) => {
        if (cancelled) return;
        setUser(user);
        setPatientCount(patientCount);
        setReadingCount(readingCount);
      })
      .catch(async (err) => {
        if (err instanceof ApiError && err.isUnauthorized) await clearToken();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const { user, patientCount, readingCount } = await api.me();
    setUser(user);
    setPatientCount(patientCount);
    setReadingCount(readingCount);
  }, []);

  const signIn = useCallback(
    async (email: string, code: string) => {
      const { user, sessionToken } = await api.verifyCode(email, code);
      await saveToken(sessionToken);
      setUser(user);
      // The counts decide where to land, so they have to be known before routing.
      await refresh().catch(() => {});
    },
    [refresh],
  );

  const signInWithToken = useCallback(
    async (token: string) => {
      const { user, sessionToken } = await api.verifyToken(token);
      await saveToken(sessionToken);
      setUser(user);
      await refresh().catch(() => {});
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {
      // Even if the server call fails, drop the local credential.
    });
    await clearToken();
    setUser(null);
    setPatientCount(0);
    setReadingCount(0);
  }, []);

  const value = useMemo(
    () => ({ user, loading, patientCount, readingCount, refresh, signIn, signInWithToken, signOut }),
    [user, loading, patientCount, readingCount, refresh, signIn, signInWithToken, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
