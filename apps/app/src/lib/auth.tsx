import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@mp/shared';
import { api, ApiError } from './api';
import { clearToken, saveToken } from './session';

interface AuthState {
  user: User | null;
  /** True until we have checked for an existing session on this device. */
  loading: boolean;
  signIn(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // A stored token may have expired while the app was closed, so it is not enough
  // to find one - we have to ask the server whether it still works.
  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then(({ user }) => {
        if (!cancelled) setUser(user);
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

  const signIn = useCallback(async (email: string, code: string) => {
    const { user, sessionToken } = await api.verifyCode(email, code);
    await saveToken(sessionToken);
    setUser(user);
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => {
      // Even if the server call fails, drop the local credential.
    });
    await clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
