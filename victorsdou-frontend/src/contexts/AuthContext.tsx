import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../lib/api';

interface User {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  isActive?: boolean;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>(null!);

/** Map the /me actor payload to our User shape */
function profileToUser(actor: Record<string, any>): User {
  return {
    id: actor.sub ?? actor.id ?? '',
    email: actor.email ?? '',
    fullName: actor.fullName ?? actor.name ?? '',
    roles: actor.roles ?? [actor.type ?? 'B2C'],
    isActive: true,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      api.get('/v1/auth/me')
        .then(r => setUser(profileToUser(r.data.data.actor)))
        .catch(() => {
          localStorage.removeItem('accessToken');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    // Backend returns: { data: { user, tokens: { accessToken, expiresIn } } }
    // RefreshToken is set as HTTP-only cookie (vos_refresh), not in response body
    const { data } = await api.post('/v1/auth/login', { email, password });
    localStorage.setItem('accessToken', data.data.tokens.accessToken);

    // /me returns: { data: { actor: { sub, email, roles, ... } } }
    const me = await api.get('/v1/auth/me');
    setUser(profileToUser(me.data.data.actor));
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
