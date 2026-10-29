import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import api, { ensureCsrf, sanitizeUser } from '../api/client';

export type AuthUser = {
  id: number;
  username: string;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  employeeId: number | null;
  status?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (
    username: string,
    password: string,
    rememberMe?: boolean,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      await ensureCsrf();
      const { data } = await api.get('/auth/me');
      setUser(sanitizeUser(data.user) as AuthUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (username: string, password: string, rememberMe = false) => {
      const { data } = await api.post('/auth/login', {
        username,
        password,
        rememberMe,
      });
      setUser(sanitizeUser(data.user) as AuthUser);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}
