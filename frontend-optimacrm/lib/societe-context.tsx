'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { useAuth } from './auth-context';
import { api } from './api';
import type { SocieteConfig, ApiResponse } from './types';

interface SocieteContextType {
  config: SocieteConfig | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const SocieteContext = createContext<SocieteContextType | null>(null);

export function SocieteProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [config, setConfig] = useState<SocieteConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setConfig(null);
      setIsLoading(false);
      return;
    }
    try {
      const res = await api.get<ApiResponse<SocieteConfig>>('/parametres/societe');
      setConfig(res.data);
    } catch {
      setConfig(null);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [authLoading, refresh]);

  return (
    <SocieteContext.Provider value={{ config, isLoading: isLoading || authLoading, refresh }}>
      {children}
    </SocieteContext.Provider>
  );
}

export function useSociete() {
  const context = useContext(SocieteContext);
  if (!context) throw new Error('useSociete must be used within a SocieteProvider');
  return context;
}
