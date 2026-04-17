'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api } from './api';
import type { SocieteConfig, ApiResponse } from './types';

interface SocieteContextType {
  config: SocieteConfig | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const SocieteContext = createContext<SocieteContextType | null>(null);

export function SocieteProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SocieteConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<SocieteConfig>>('/parametres/societe');
      setConfig(res.data);
    } catch {
      setConfig(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) refresh();
    else setIsLoading(false);
  }, [refresh]);

  return (
    <SocieteContext.Provider value={{ config, isLoading, refresh }}>
      {children}
    </SocieteContext.Provider>
  );
}

export function useSociete() {
  const context = useContext(SocieteContext);
  if (!context) throw new Error('useSociete must be used within a SocieteProvider');
  return context;
}
