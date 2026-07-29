'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useEffect, useState, useMemo, useRef, type CSSProperties } from 'react';
import { api, resolveAssetUrl } from '@/lib/api';
import type { ApiResponse, Branding } from '@/lib/types';
import { computeBrandVars } from '@/lib/color';
import { MenuIcon, XIcon, LogoutIcon, ChevronDownIcon } from '@/components/ui';

type NavItem = { href: string; label: string; icon: React.FC<{ className?: string }> };

const ALL_NAV_ITEMS: (NavItem & { requiresCopieur?: boolean })[] = [
  { href: '/portal', label: 'Tableau de bord', icon: DashboardIcon },
  { href: '/portal/factures', label: 'Factures', icon: FacturesIcon },
  { href: '/portal/tickets', label: 'Tickets', icon: TicketsIcon },
  { href: '/portal/parc-machines', label: 'Parc machines', icon: MachinesIcon, requiresCopieur: true },
  { href: '/portal/contrats', label: 'Contrats', icon: ContratsIcon },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [contractTypes, setContractTypes] = useState<string[] | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.get<ApiResponse<string[]>>('/contract-types')
      .then(res => { if (!cancelled) setContractTypes(res.data); })
      .catch(() => { if (!cancelled) setContractTypes([]); });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api.get<ApiResponse<Branding>>('/branding')
      .then(res => { if (!cancelled) setBranding(res.data); })
      .catch(() => { if (!cancelled) setBranding(null); });
    return () => { cancelled = true; };
  }, [user]);

  const brandVars = useMemo(
    () => computeBrandVars(branding?.couleur_principale),
    [branding],
  );
  const companyName = branding?.raison_sociale || 'OptimaCRM';
  const logoUrl = branding?.logo_url ? resolveAssetUrl(branding.logo_url) : null;

  useEffect(() => { setMobileNavOpen(false); }, [pathname]);

  // Attendre la fin de logout() (POST /auth/logout + effacement du cookie)
  // avant de naviguer : sinon le middleware, exécuté en parallèle sur la
  // requête de navigation, voit encore le cookie « token » et renvoie
  // directement vers /portal (déconnexion qui semblait « ne pas marcher »).
  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
    router.push('/login');
  };

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const navItems = useMemo(() => {
    const hasCopieur = contractTypes?.includes('Copieur') ?? false;
    return ALL_NAV_ITEMS.filter(item => !item.requiresCopieur || hasCopieur);
  }, [contractTypes]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-[var(--brand-light)] border-t-[var(--brand)]" />
          <p className="text-xs text-gray-400">Chargement de votre espace...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const initials = `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase();

  const sidebarContent = (
    <>
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={companyName}
              className="h-10 w-10 shrink-0 rounded-2xl bg-white object-contain p-1 shadow-sm"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">Espace Client</p>
            <p className="text-xs text-white/55 truncate">{companyName}</p>
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">Menu</p>
        {navItems.map(item => {
          const active = pathname === item.href || (item.href !== '/portal' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                active
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-white/65 hover:bg-white/10 hover:text-white'
              }`}
            >
              {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-white" />}
              <item.icon className={`w-5 h-5 shrink-0 transition-colors ${active ? 'text-white' : 'text-white/50 group-hover:text-white/80'}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10 relative" ref={userMenuRef}>
        {userMenuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg shadow-black/20 animate-[fadeIn_0.12s_ease-out]">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogoutIcon className="h-4 w-4" />
              Déconnexion
            </button>
          </div>
        )}
        <button
          onClick={() => setUserMenuOpen(v => !v)}
          className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left hover:bg-white/10 transition-colors"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/10 text-xs font-semibold text-white">
            {initials || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{user.first_name} {user.last_name}</p>
            <p className="text-xs text-white/50 truncate">{user.email}</p>
          </div>
          <ChevronDownIcon className={`h-4 w-4 shrink-0 text-white/50 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-gray-50/60" style={brandVars as CSSProperties}>
      {/* Mobile overlay */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-900/30 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Sidebar (desktop) */}
      <aside className="hidden lg:flex w-72 bg-[var(--brand)] flex-col shrink-0 sticky top-0 h-screen shadow-xl shadow-black/5">
        {sidebarContent}
      </aside>

      {/* Sidebar (mobile drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-[var(--brand)] flex flex-col shrink-0 transition-transform duration-200 ease-out lg:hidden ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile topbar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white/80 backdrop-blur px-4 py-3 lg:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="h-7 w-7 shrink-0 rounded-lg border border-gray-100 bg-white object-contain p-0.5" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[linear-gradient(135deg,var(--brand),var(--brand-dark))]">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            )}
            <span className="text-sm font-semibold text-gray-900">Espace Client</span>
          </div>
        </header>

        <main className="flex-1 min-w-0 overflow-auto">
          <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// -- Icons (inline SVG components) --

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function FacturesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function TicketsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
    </svg>
  );
}

function MachinesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
    </svg>
  );
}

function ContratsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  );
}
