'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { api } from './api';
import type { User, ApiResponse, PermissionKey } from './types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; first_name: string; last_name: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasPermission: (...perms: PermissionKey[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
  });

  const refreshUser = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const hasFlag = !!localStorage.getItem('auth_active');
    const onProtectedPage = window.location.pathname.startsWith('/dashboard');
    if (!hasFlag && !onProtectedPage) {
      setState({ user: null, isLoading: false });
      return;
    }
    try {
      const res = await api.get<ApiResponse<User>>('/auth/profile');
      localStorage.setItem('auth_active', '1');
      setState({ user: res.data, isLoading: false });
    } catch {
      localStorage.removeItem('auth_active');
      setState({ user: null, isLoading: false });
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await api.post<ApiResponse<{ user: User }>>('/auth/login', { email, password });
    localStorage.setItem('auth_active', '1');
    setState({ user: res.data.user, isLoading: false });
  };

  const register = async (data: { email: string; password: string; first_name: string; last_name: string }) => {
    const res = await api.post<ApiResponse<{ user: User }>>('/auth/register', data);
    localStorage.setItem('auth_active', '1');
    setState({ user: res.data.user, isLoading: false });
  };

  const logout = async () => {
    try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
    localStorage.removeItem('auth_active');
    setState({ user: null, isLoading: false });
  };

  const hasPermission = useCallback((...perms: PermissionKey[]) => {
    if (!state.user) return false;
    if (state.user.role === 'admin') return true;
    if (state.user.role === 'admin_technique') {
      const adminTechPerms = new Set([
        'tickets_read', 'tickets_write', 'tickets_admin', 'techniciens_manage',
        'clients_read', 'parc_read', 'dashboard', 'users_manage',
      ]);
      const allAllowed = perms.every(p => adminTechPerms.has(p));
      if (allAllowed) return true;
    }
    const userPerms = state.user.permissions || [];
    return perms.some(p => userPerms.includes(p));
  }, [state.user]);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refreshUser, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
