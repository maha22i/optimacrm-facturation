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
import type { User, AuthResponse, ApiResponse, PermissionKey } from './types';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; first_name: string; last_name: string }) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  hasPermission: (...perms: PermissionKey[]) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
  });

  const refreshUser = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setState({ user: null, token: null, isLoading: false });
        return;
      }

      const res = await api.get<ApiResponse<User>>('/auth/profile');
      setState({ user: res.data, token, isLoading: false });
    } catch {
      localStorage.removeItem('token');
      setState({ user: null, token: null, isLoading: false });
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await api.post<AuthResponse>('/auth/login', { email, password });
    localStorage.setItem('token', res.data.token);
    setState({ user: res.data.user, token: res.data.token, isLoading: false });
  };

  const register = async (data: { email: string; password: string; first_name: string; last_name: string }) => {
    const res = await api.post<AuthResponse>('/auth/register', data);
    localStorage.setItem('token', res.data.token);
    setState({ user: res.data.user, token: res.data.token, isLoading: false });
  };

  const logout = () => {
    localStorage.removeItem('token');
    setState({ user: null, token: null, isLoading: false });
  };

  const hasPermission = useCallback((...perms: PermissionKey[]) => {
    if (!state.user) return false;
    if (state.user.role === 'admin') return true;
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
