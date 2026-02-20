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

/** Map the /me profile response (which uses `name`) to our User shape */
function profileToUser(profile: Record<string, any>): User {
  return {
    id:       profile.id,
    email:    profile.email,
    fullName: profile.name ?? '',
    roles:    [profile.type ?? 'B2C'],
    isActive: true,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      api.get('/v1/auth/me')
        .then(r => setUser(profileToUser(r.data)))
        .catch(() => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    // API returns: { accessToken, refreshToken, expiresIn }
    const { data } = await api.post('/v1/auth/login', { email, password });
    localStorage.setItem('accessToken',  data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);

    // /me returns: { id, name, email, phone, type, ... }
    const me = await api.get('/v1/auth/me');
    setUser(profileToUser(me.data));
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      await api.post('/v1/auth/logout', { refreshToken }).catch(() => {});
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
