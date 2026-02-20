import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

interface User { id: string; email: string; fullName: string; roles: string[] }
interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      api.get('/v1/auth/me')
        .then(r => setUser(r.data.data.actor))
        .catch(() => localStorage.removeItem('accessToken'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/v1/auth/login', { email, password });
    // API shape: { data: { user, tokens: { accessToken, expiresIn } } }
    localStorage.setItem('accessToken', data.data.tokens.accessToken);
    const me = await api.get('/v1/auth/me');
    setUser(me.data.data.actor);
  };

  const logout = async () => {
    await api.post('/v1/auth/logout').catch(() => {});
    localStorage.removeItem('accessToken');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
