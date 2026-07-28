'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import SuspendedScreen from '@/components/SuspendedScreen';

// ── Portail super-admin ──────────────────────────────────────────────────
//
// Layout volontairement séparé de (dashboard) : ce dernier est structuré
// pour un tenant (sidebar métier, useSociete(), permissions liées à un
// tenant). Un super_admin (tenant_id NULL) a besoin de son propre espace,
// cross-tenant, sans aucune de ces dépendances.
//
// Palette délibérément différente (slate/ambre plutôt que la couleur de la
// société courante) pour qu'on identifie IMMÉDIATEMENT qu'on est dans le
// portail plateforme, et pas dans l'espace d'un client.
//
// 2e garde de rôle (la 1ère est dans (dashboard)/layout.tsx qui redirige un
// super_admin vers /super-admin) : défense en profondeur — un non
// super_admin qui arriverait ici par un autre chemin est aussi bloqué.

const NAV_ITEMS = [
  {
    href: '/super-admin/tenants',
    label: 'Tenants',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
  },
];

function SuperAdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout, tenantSuspended } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      // Cas théorique pour un super_admin (tenant_id NULL, jamais concerné
      // par une suspension de tenant), mais on garde la même défense en
      // profondeur que le layout (dashboard) : pas de redirection si
      // tenantSuspended, pour laisser le rendu afficher l'écran dédié.
      if (!tenantSuspended) router.replace('/login');
      return;
    }
    if (user.role !== 'super_admin') { router.replace('/dashboard'); return; }
  }, [user, isLoading, router, tenantSuspended]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-[3px] border-amber-500/20" />
            <div className="absolute inset-0 h-12 w-12 rounded-full border-[3px] border-transparent border-t-amber-400 animate-spin" />
          </div>
          <p className="text-amber-200/70 text-sm font-medium tracking-wide">Chargement...</p>
        </div>
      </div>
    );
  }

  if (tenantSuspended) return <SuspendedScreen />;

  if (!user || user.role !== 'super_admin') return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 h-screen z-50 flex w-[240px] flex-col bg-slate-950">
        {/* Logo / bandeau */}
        <div className="flex items-center h-16 border-b border-white/10 shrink-0 px-5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
              <svg className="w-4.5 h-4.5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-white tracking-tight leading-tight">OptimaCRM</p>
              <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider leading-tight">Super Admin</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-2 mb-3 text-[10px] uppercase tracking-[0.12em] font-semibold text-white/30">Plateforme</p>
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200 ${
                    active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-amber-400" />
                  )}
                  <span className={`shrink-0 transition-colors duration-200 ${active ? 'text-amber-400' : 'text-white/40 group-hover:text-white/70'}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User card */}
        <div className="shrink-0 border-t border-white/10 p-3">
          <div className="rounded-lg p-2.5">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 text-[11px] font-bold shrink-0 ring-2 ring-white/5">
                {user.first_name[0]}{user.last_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate">{user.first_name} {user.last_name}</p>
                <p className="text-[11px] text-white/40 truncate">{user.email}</p>
              </div>
            </div>
            <button
              onClick={() => { logout(); router.push('/login'); }}
              className="mt-2.5 w-full flex items-center justify-center gap-2 rounded-md bg-white/5 hover:bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/60 hover:text-white transition-all duration-200 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
              Déconnexion
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col ml-[240px]">
        <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
          <div className="flex items-center justify-between h-16 px-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              Portail plateforme — accès cross-tenant
            </span>
            <span className="text-sm text-gray-400">Connecté en tant que <span className="font-medium text-gray-700">{user.first_name} {user.last_name}</span></span>
          </div>
        </header>

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <SuperAdminLayoutInner>{children}</SuperAdminLayoutInner>;
}
