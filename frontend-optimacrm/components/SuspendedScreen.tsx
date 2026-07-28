'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

// Écran plein écran, sans sidebar ni menus, affiché par les layouts protégés
// (dashboard) et (super-admin) quand tenantSuspended === true. Volontairement
// autonome (pas de dépendance à `user`, qui peut être null dans ce cas — cf.
// auth-context.tsx#refreshUser).
export default function SuspendedScreen() {
  const { logout } = useAuth();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    // logout() nettoie l'état local (user, tenantSuspended, localStorage)
    // même si l'appel serveur /auth/logout échoue — cf. auth-context.tsx.
    await logout();
    router.push('/login');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="max-w-md w-full text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-2">Votre accès est suspendu</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-8">
          L&apos;accès à votre espace a été suspendu. Contactez votre administrateur pour plus d&apos;informations.
        </p>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {loggingOut && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
          </svg>
          Déconnexion
        </button>
      </div>
    </div>
  );
}
