'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, resetTenantSuspended } from './api';
import type { ClientUser, ApiResponse } from './types';

interface AuthState {
  user: ClientUser | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  const refreshProfile = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<ClientUser>>('/auth/profile');
      setState({ user: res.data, loading: false });
    } catch {
      setState({ user: null, loading: false });
    }
  }, []);

  // Le cookie « token » est httpOnly (non lisible via document.cookie côté
  // JS) : on ne peut donc pas déduire l'état de connexion depuis le client.
  // On interroge systématiquement /auth/profile, qui répond 401 si le cookie
  // est absent/invalide — refreshProfile gère déjà ce cas (catch → user null).
  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const login = useCallback(async (email: string, password: string) => {
    resetTenantSuspended();
    const res = await api.post<ApiResponse<{ user: ClientUser }>>('/auth/login', { email, password });
    setState({ user: res.data.user, loading: false });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {});
    } catch { /* ignore */ }
    resetTenantSuspended();
    setState({ user: null, loading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
