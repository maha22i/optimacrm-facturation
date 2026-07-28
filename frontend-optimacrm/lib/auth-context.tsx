'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { api, isTenantSuspended, resetTenantSuspended } from './api';
import type { User, ApiResponse, PermissionKey } from './types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  // Détecté via le coupe-circuit d'api.ts (403 "Compte suspendu"). Distinct
  // de "déconnecté" : on n'a pas forcément de `user` chargé (le tout premier
  // appel /auth/profile peut lui-même échouer en 403 si le tenant était déjà
  // suspendu avant ce chargement), mais l'écran dédié n'en a pas besoin.
  tenantSuspended: boolean;
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
    tenantSuspended: false,
  });

  const refreshUser = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const hasFlag = !!localStorage.getItem('auth_active');
    const onProtectedPage = window.location.pathname.startsWith('/dashboard')
      || window.location.pathname.startsWith('/super-admin');
    if (!hasFlag && !onProtectedPage) {
      setState({ user: null, isLoading: false, tenantSuspended: false });
      return;
    }
    try {
      const res = await api.get<ApiResponse<User>>('/auth/profile');
      localStorage.setItem('auth_active', '1');
      setState({ user: res.data, isLoading: false, tenantSuspended: false });
    } catch {
      // Si le tenant est déjà suspendu au moment de ce chargement (ex. reload
      // de page), /auth/profile échoue en 403 "Compte suspendu" et le flag
      // module-level d'api.ts est déjà à jour de façon synchrone à ce stade
      // (mis à jour avant le throw). On distingue ce cas d'une vraie
      // déconnexion : pas de `user`, mais on garde le flag localStorage (la
      // session existe toujours côté serveur) et on signale `tenantSuspended`
      // pour que les layouts affichent l'écran dédié plutôt qu'un blanc.
      const suspended = isTenantSuspended();
      if (!suspended) localStorage.removeItem('auth_active');
      setState({ user: null, isLoading: false, tenantSuspended: suspended });
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Prévient en live (sans reload) si la suspension est détectée pendant que
  // l'utilisateur est déjà dans l'app — ex. un super-admin suspend le tenant
  // pendant que l'un de ses utilisateurs navigue. Le prochain poll/fetch qui
  // échoue déclenche cet event depuis api.ts.
  useEffect(() => {
    function handleTenantSuspended() {
      setState((s) => ({ ...s, isLoading: false, tenantSuspended: true }));
    }
    window.addEventListener('tenant-suspended', handleTenantSuspended);
    return () => window.removeEventListener('tenant-suspended', handleTenantSuspended);
  }, []);

  const login = async (email: string, password: string) => {
    // Repart propre : si une session précédente dans cet onglet avait laissé
    // le coupe-circuit armé, il ne doit pas bloquer cette nouvelle tentative
    // (la requête /auth/login elle-même serait sinon court-circuitée).
    resetTenantSuspended();
    const res = await api.post<ApiResponse<{ user: User }>>('/auth/login', { email, password });
    localStorage.setItem('auth_active', '1');
    setState({ user: res.data.user, isLoading: false, tenantSuspended: false });
  };

  const register = async (data: { email: string; password: string; first_name: string; last_name: string }) => {
    resetTenantSuspended();
    const res = await api.post<ApiResponse<{ user: User }>>('/auth/register', data);
    localStorage.setItem('auth_active', '1');
    setState({ user: res.data.user, isLoading: false, tenantSuspended: false });
  };

  const logout = async () => {
    // Le nettoyage local (état + redirection) doit se faire quoi qu'il
    // arrive, même si l'appel serveur échoue ou ne part jamais (le coupe-
    // circuit d'api.ts laisse volontairement passer /auth/logout, mais on
    // ne dépend pas de son succès ici).
    try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
    resetTenantSuspended();
    localStorage.removeItem('auth_active');
    setState({ user: null, isLoading: false, tenantSuspended: false });
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
