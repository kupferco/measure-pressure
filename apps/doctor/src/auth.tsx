import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@mp/shared';
import { api, ApiError } from './api';

interface AuthState {
  user: User | null;
  loading: boolean;
  patientCount: number;
  pendingInvitations: number;
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
  const [pendingInvitations, setPendingInvitations] = useState(0);

  const refresh = useCallback(async () => {
    const result = await api.me();
    setUser(result.user);
    setPatientCount(result.patientCount);
    setPendingInvitations(result.pendingInvitations);
  }, []);

  // The cookie may have expired while the tab was closed, so finding one is not
  // enough - the server has to confirm it still works.
  useEffect(() => {
    refresh()
      .catch((err) => {
        if (!(err instanceof ApiError && err.isUnauthorized)) console.error(err);
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, code: string) => {
      await api.verifyCode(email, code);
      await refresh();
    },
    [refresh],
  );

  const signInWithToken = useCallback(
    async (token: string) => {
      await api.verifyToken(token);
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
    setPatientCount(0);
    setPendingInvitations(0);
  }, []);

  const value = useMemo(
    () => ({ user, loading, patientCount, pendingInvitations, refresh, signIn, signInWithToken, signOut }),
    [user, loading, patientCount, pendingInvitations, refresh, signIn, signInWithToken, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
