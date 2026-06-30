'use client';

import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';

import type { PermissionKey, ApiResponse, TicketStats, UserRole } from '@/lib/types';

interface NavChild {
  label: string;
  href: string;
  requiredPermission?: PermissionKey;
}

interface NavItem {
  key?: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  children?: NavChild[];
  requiredPermission?: PermissionKey;
}

const MENU_KEYS_BY_ROLE: Record<UserRole, string[] | null> = {
  admin: null,
  user: null,
  admin_technique: ['dashboard', 'tickets', 'planning', 'users', 'parametres'],
  technicien: ['tickets', 'planning'],
};

const ALLOWED_PATHS_BY_ROLE: Record<UserRole, RegExp[] | null> = {
  admin: null,
  user: null,
  admin_technique: null,
  technicien: [
    /^\/dashboard\/tickets(\/|$)/,
    /^\/dashboard\/planning(\/|$)/,
    /^\/dashboard\/clients\/\d+(\/|$)/,
  ],
};

function getRedirectForRole(role: UserRole): string {
  if (role === 'technicien') return '/dashboard/tickets';
  return '/dashboard';
}

const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    requiredPermission: 'dashboard',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
      </svg>
    ),
  },
  {
    key: 'journal',
    label: 'Journal',
    href: '/dashboard/journal',
    requiredPermission: 'activity_logs',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  {
    key: 'tickets',
    label: 'Tickets',
    href: '/dashboard/tickets',
    requiredPermission: 'tickets_read',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
      </svg>
    ),
    children: [
      { label: 'Réglages', href: '/dashboard/tickets/reglages', requiredPermission: 'tickets_admin' },
    ],
  },
  {
    key: 'planning',
    label: 'Planning',
    href: '/dashboard/planning',
    requiredPermission: 'tickets_read',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z" />
      </svg>
    ),
  },
  {
    key: 'clients',
    label: 'Clients',
    href: '/dashboard/clients',
    requiredPermission: 'clients_read',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
    children: [
      { label: 'Importer', href: '/dashboard/clients/import', requiredPermission: 'clients_import' },
    ],
  },
  {
    key: 'devis',
    label: 'Devis',
    href: '/dashboard/devis',
    requiredPermission: 'devis_read',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
    children: [
      { label: 'Champs devis', href: '/dashboard/devis/champs-devis', requiredPermission: 'champs_templates' },
    ],
  },
  {
    key: 'factures',
    label: 'Factures',
    href: '/dashboard/factures',
    requiredPermission: 'factures_read',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 15.75h-4.5m0 0V12m0 3.75L12 13.5" />
      </svg>
    ),
    children: [
      { label: 'Fact. copieur', href: '/dashboard/factures/copieur', requiredPermission: 'factures_read' },
      { label: 'Fact. téléphonie', href: '/dashboard/factures/facturation-telephonie', requiredPermission: 'factures_read' },
      { label: 'Fact. informatique', href: '/dashboard/factures/facturation-informatique', requiredPermission: 'factures_read' },
      { label: 'Avoirs', href: '/dashboard/factures/avoirs', requiredPermission: 'factures_read' },
      { label: 'Prélèvements SEPA', href: '/dashboard/factures/prelevements-sepa', requiredPermission: 'factures_write' },
    ],
  },
  {
    key: 'contrats',
    label: 'Contrats',
    href: '/dashboard/contrats',
    requiredPermission: 'contrats_read',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75h6m-6 3h4" />
      </svg>
    ),
    children: [
      { label: 'Importer (Capasoft)', href: '/dashboard/contrats/import', requiredPermission: 'contrats_import' },
      { label: 'Import Téléphonie', href: '/dashboard/contrats/import-telephonie', requiredPermission: 'contrats_write' },
      { label: 'Import Informatique', href: '/dashboard/contrats/import-informatique', requiredPermission: 'contrats_write' },
    ],
  },
  {
    key: 'parc-machines',
    label: 'Parc Machine',
    href: '/dashboard/parc-machines',
    requiredPermission: 'parc_read',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M9.75 8.25h.008v.008H9.75V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
    ),
    children: [
      { label: 'Importer relevés', href: '/dashboard/parc-machines/import-releves', requiredPermission: 'parc_import' },
      { label: 'Historique imports', href: '/dashboard/parc-machines/imports', requiredPermission: 'parc_read' },
    ],
  },
  {
    key: 'catalogue',
    label: 'Catalogue',
    href: '/dashboard/catalogue',
    requiredPermission: 'catalogue_read',
    icon: (
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
    children: [
      { label: 'Importer', href: '/dashboard/catalogue/import', requiredPermission: 'catalogue_import' },
      { label: 'Fournisseurs', href: '/dashboard/catalogue/fournisseurs', requiredPermission: 'fournisseurs' },
      { label: 'Marques', href: '/dashboard/catalogue/marques', requiredPermission: 'marques' },
      { label: 'Familles & Unités', href: '/dashboard/catalogue/familles-unites', requiredPermission: 'familles_unites' },
    ],
  },
];

const CHAMPS_PERSO_NAV: NavItem = {
  key: 'champs-perso',
  label: 'Champs perso',
  href: '/dashboard/champs-personnalises',
  requiredPermission: 'champs_personnalises',
  icon: (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
    </svg>
  ),
};

const SETTINGS_NAV: NavItem = {
  key: 'parametres',
  label: 'Paramètres',
  href: '/dashboard/parametres',
  requiredPermission: 'parametres_societe',
  icon: (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
};

const ADMIN_NAV: NavItem = {
  key: 'users',
  label: 'Utilisateurs',
  href: '/dashboard/users',
  requiredPermission: 'users_manage',
  icon: (
    <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout, hasPermission } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [ticketsNouveaux, setTicketsNouveaux] = useState(0);

  const fetchTicketsBadge = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<TicketStats>>('/tickets/stats');
      setTicketsNouveaux(res.data?.par_statut?.nouveau || 0);
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => {
    if (!user || !hasPermission('tickets_read')) return;
    fetchTicketsBadge();
    const interval = setInterval(fetchTicketsBadge, 60000);
    return () => clearInterval(interval);
  }, [user, hasPermission, fetchTicketsBadge]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.push('/login'); return; }

    const allowedPaths = ALLOWED_PATHS_BY_ROLE[user.role as UserRole];
    if (allowedPaths && !allowedPaths.some(re => re.test(pathname))) {
      router.replace(getRedirectForRole(user.role as UserRole));
      return;
    }

    if (pathname === '/dashboard') {
      const roleRedirect = getRedirectForRole(user.role as UserRole);
      if (roleRedirect !== '/dashboard') {
        router.replace(roleRedirect);
        return;
      }
      if (!hasPermission('dashboard')) {
        const showUsersNav = user.role === 'admin' || user.role === 'admin_technique';
        const rawItems: NavItem[] = [...NAV_ITEMS, ...(showUsersNav ? [ADMIN_NAV] : []), CHAMPS_PERSO_NAV, SETTINGS_NAV];
        const first = rawItems.find(
          (item) => item.href !== '/dashboard' && (!item.requiredPermission || hasPermission(item.requiredPermission)),
        );
        if (first) {
          router.replace(first.href);
        }
      }
    }
  }, [user, isLoading, router, pathname, hasPermission]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0f1e]">
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-[3px] border-blue-500/20" />
            <div className="absolute inset-0 h-12 w-12 rounded-full border-[3px] border-transparent border-t-blue-400 animate-spin" />
          </div>
          <p className="text-blue-300/70 text-sm font-medium tracking-wide">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const showUsers = user.role === 'admin' || user.role === 'admin_technique';
  const rawNav: NavItem[] = [...NAV_ITEMS, ...(showUsers ? [ADMIN_NAV] : []), CHAMPS_PERSO_NAV, SETTINGS_NAV];

  const allowedKeys = MENU_KEYS_BY_ROLE[user.role as UserRole] ?? null;

  const allNav: NavItem[] = rawNav
    .filter((item) => {
      if (allowedKeys && item.key && !allowedKeys.includes(item.key)) return false;
      return !item.requiredPermission || hasPermission(item.requiredPermission);
    })
    .map((item) => ({
      ...item,
      children: item.children?.filter(
        (child) => !child.requiredPermission || hasPermission(child.requiredPermission),
      ),
    }));

  const hrefPath = (href: string) => href.split('?')[0];

  const isActive = (href: string) => {
    const p = hrefPath(href);
    if (p === '/dashboard') return pathname === '/dashboard';
    return pathname === p || pathname.startsWith(p + '/');
  };

  const isParentActive = (item: NavItem) => {
    if (isActive(item.href)) return true;
    return item.children?.some(child => {
      const cp = hrefPath(child.href);
      return pathname === cp || pathname.startsWith(cp + '/');
    }) ?? false;
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={`flex items-center h-16 border-b border-white/[0.06] shrink-0 ${sidebarCollapsed ? 'justify-center px-2' : 'px-5'}`}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
            <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          {!sidebarCollapsed && (
            <span className="text-[15px] font-bold text-white tracking-tight">OptimaCRM</span>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 sidebar-scroll">
        <p className={`px-2 mb-3 text-[10px] uppercase tracking-[0.12em] font-semibold text-slate-500 ${sidebarCollapsed ? 'text-center' : ''}`}>
          {sidebarCollapsed ? '···' : 'Menu'}
        </p>
        <div className="space-y-0.5">
          {allNav.map(item => {
            const active = isParentActive(item);
            const hasChildren = item.children && item.children.length > 0;
            const childrenOpen = active && hasChildren;

            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={`group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-200 ${
                    active
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                  } ${sidebarCollapsed ? 'justify-center' : ''}`}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-blue-400" />
                  )}
                  <span className={`shrink-0 transition-colors duration-200 ${active ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                    {item.icon}
                  </span>
                  {!sidebarCollapsed && (
                    <>
                      <span>{item.label}</span>
                      {item.label === 'Tickets' && ticketsNouveaux > 0 && (
                        <span className="ml-auto mr-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-1.5 text-[10px] font-bold text-white">
                          {ticketsNouveaux}
                        </span>
                      )}
                      {hasChildren && (
                        <svg
                          className={`ml-auto h-3.5 w-3.5 transition-transform duration-200 ${childrenOpen ? 'rotate-180' : ''} ${active ? 'text-blue-400/60' : 'text-slate-600'}`}
                          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      )}
                    </>
                  )}
                </Link>

                {childrenOpen && !sidebarCollapsed && (
                  <div className="mt-0.5 ml-[18px] pl-3 border-l border-white/[0.06] space-y-0.5">
                    {item.children!.map(child => {
                      const childPath = hrefPath(child.href);
                      const childQuery = child.href.includes('?') ? new URLSearchParams(child.href.split('?')[1]) : null;
                      const childActive = (pathname === childPath || pathname.startsWith(childPath + '/')) && (
                        !childQuery || [...childQuery.entries()].every(([k, v]) => searchParams.get(k) === v)
                      );
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`block rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-all duration-200 ${
                            childActive
                              ? 'text-blue-400 bg-blue-500/[0.08]'
                              : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* User Card */}
      <div className={`shrink-0 border-t border-white/[0.06] ${sidebarCollapsed ? 'p-2' : 'p-3'}`}>
        <div className={`rounded-lg ${sidebarCollapsed ? 'p-1.5' : 'p-2.5'}`}>
          <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-[11px] font-bold shrink-0 ring-2 ring-blue-500/20">
              {user.first_name[0]}{user.last_name[0]}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-slate-200 truncate">{user.first_name} {user.last_name}</p>
                <p className="text-[11px] text-slate-500 capitalize">{{ admin: 'Administrateur', user: 'Utilisateur', admin_technique: 'Admin Technique', technicien: 'Technicien' }[user.role] || user.role}</p>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <button
              onClick={() => { logout(); router.push('/login'); }}
              className="mt-2.5 w-full flex items-center justify-center gap-2 rounded-md bg-white/[0.04] hover:bg-red-500/10 px-3 py-1.5 text-[11px] font-medium text-slate-500 hover:text-red-400 transition-all duration-200 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
              Déconnexion
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen z-50 flex flex-col bg-[#0c1021] transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'w-[68px]' : 'w-[250px]'
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        {sidebarContent}

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden lg:flex absolute -right-3 top-[72px] h-6 w-6 rounded-full bg-[#0c1021] border border-white/10 items-center justify-center text-slate-500 hover:text-white hover:border-white/20 transition-all duration-200 cursor-pointer shadow-lg shadow-black/20"
        >
          <svg className={`h-3 w-3 transition-transform duration-300 ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
      </aside>

      {/* Main content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'lg:ml-[68px]' : 'lg:ml-[250px]'}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-100">
          <div className="flex items-center justify-between h-16 px-4 lg:px-6">
            <div className="flex items-center gap-3">
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 -ml-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all duration-200 cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>

              {/* Search */}
              <div className="relative hidden sm:block">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  type="text"
                  placeholder="Rechercher..."
                  className="w-64 lg:w-72 rounded-lg bg-gray-50 border border-gray-100 py-2 pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:bg-white focus:border-blue-200 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all duration-200"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Notifications */}
              <button className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all duration-200 cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
                </svg>
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-blue-500 ring-2 ring-white" />
              </button>

              <div className="h-6 w-px bg-gray-100 mx-1" />

              {/* User dropdown */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2.5 p-1.5 pr-3 rounded-lg hover:bg-gray-50 transition-all duration-200 cursor-pointer"
                >
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-[11px] font-bold shadow-sm shadow-blue-500/20">
                    {user.first_name[0]}{user.last_name[0]}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="text-[13px] font-semibold text-gray-800 leading-tight">{user.first_name} {user.last_name}</p>
                    <p className="text-[11px] text-gray-400 capitalize leading-tight">{{ admin: 'Admin', user: 'Utilisateur', admin_technique: 'Admin Technique', technicien: 'Technicien' }[user.role] || user.role}</p>
                  </div>
                  <svg className={`h-3.5 w-3.5 text-gray-400 hidden sm:block transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl bg-white border border-gray-100 shadow-xl shadow-black/[0.08] py-1.5 z-50">
                    <div className="px-3 py-2 border-b border-gray-50">
                      <p className="text-[13px] font-semibold text-gray-800">{user.first_name} {user.last_name}</p>
                      <p className="text-[11px] text-gray-400">{user.email}</p>
                    </div>
                    <div className="py-1">
                      <Link
                        href="/dashboard/parametres"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
                      >
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                        Paramètres
                      </Link>
                    </div>
                    <div className="border-t border-gray-50 pt-1">
                      <button
                        onClick={() => { setUserMenuOpen(false); logout(); router.push('/login'); }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                        </svg>
                        Déconnexion
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
