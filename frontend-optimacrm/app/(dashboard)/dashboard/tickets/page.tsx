'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type {
  Ticket,
  TicketStats,
  TicketCategorie,
  PaginatedResponse,
  ApiResponse,
  User,
  Client,
  StatutTicket,
  PrioriteTicket,
  SlaStatus,
} from '@/lib/types';

const STATUT_FALLBACK = { label: 'Inconnu', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };

const STATUT_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  nouveau: { label: 'Nouveau', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  assigne: { label: 'Assigné', bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  en_cours: { label: 'En cours', bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  en_attente: { label: 'En attente', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  resolu: { label: 'Terminé', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cloture: { label: 'Clôturé', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
};

const PRIORITE_CONFIG: Record<PrioriteTicket, { label: string; bg: string; text: string }> = {
  basse: { label: 'Basse', bg: 'bg-gray-100', text: 'text-gray-600' },
  normale: { label: 'Normale', bg: 'bg-blue-50', text: 'text-blue-700' },
  haute: { label: 'Haute', bg: 'bg-amber-50', text: 'text-amber-700' },
  urgente: { label: 'Urgente', bg: 'bg-red-50', text: 'text-red-700' },
};

const KANBAN_COLUMNS: { statut: StatutTicket; label: string; color: string }[] = [
  { statut: 'nouveau', label: 'Nouveau', color: 'border-blue-400' },
  { statut: 'assigne', label: 'Assigné', color: 'border-indigo-400' },
  { statut: 'en_cours', label: 'En cours', color: 'border-yellow-400' },
  { statut: 'en_attente', label: 'En attente', color: 'border-orange-400' },
  { statut: 'resolu', label: 'Terminé', color: 'border-emerald-400' },
];

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-purple-500 to-pink-600',
];

function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

function getGradient(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `il y a ${diffMins}min`;
  if (diffHours < 24) return `il y a ${diffHours}h`;
  if (diffDays === 1) return 'hier';
  if (diffDays < 7) return `il y a ${diffDays}j`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function SlaIndicator({ sla }: { sla?: { prise_en_charge: SlaStatus; resolution: SlaStatus } }) {
  if (!sla) return <span className="text-xs text-gray-300">—</span>;
  const worst: SlaStatus =
    sla.resolution === 'depasse' || sla.prise_en_charge === 'depasse'
      ? 'depasse'
      : sla.resolution === 'warning' || sla.prise_en_charge === 'warning'
        ? 'warning'
        : 'ok';
  if (worst === 'ok') return <span className="text-emerald-500 text-sm" title="SLA respecté">✅</span>;
  if (worst === 'warning') return <span className="text-orange-500 text-sm" title="SLA attention">⚠️</span>;
  return <span className="text-red-500 text-sm" title="SLA dépassé">🔴</span>;
}

export default function TicketsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const isTechnicien = user?.role === 'technicien';
  const isAdminTechnique = user?.role === 'admin_technique';
  const canDeleteTicket = !isTechnicien;
  const canManageCategories = !isTechnicien;

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [categories, setCategories] = useState<TicketCategorie[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutTicket | ''>('');
  const [prioriteFilter, setPrioriteFilter] = useState<PrioriteTicket | ''>('');
  const [categorieFilter, setCategorieFilter] = useState<string>('');
  const [technicienFilter, setTechnicienFilter] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<string>('');
  const [slaDepasseFilter, setSlaDepasseFilter] = useState(false);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  const [view, setView] = useState<'liste' | 'kanban'>('liste');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const clientIdParam = searchParams.get('client_id');
    if (clientIdParam) setClientFilter(clientIdParam);
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    loadFiltersData();
  }, []);

  const loadFiltersData = async () => {
    try {
      const promises: Promise<unknown>[] = [
        api.get<ApiResponse<TicketCategorie[]>>('/tickets/categories'),
      ];

      if (!isTechnicien) {
        promises.push(api.get<PaginatedResponse<User>>('/auth/users?limit=100'));
        promises.push(api.get<PaginatedResponse<Client>>('/clients?limit=100'));
      }

      const results = await Promise.all(promises);
      setCategories((results[0] as { data: TicketCategorie[] }).data);

      if (!isTechnicien) {
        setTechnicians((results[1] as { data: User[] }).data);
        setClients((results[2] as { data: Client[] }).data);
      }
    } catch {
      // silently fail
    }
  };

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<TicketStats>>('/tickets/stats');
      setStats(res.data);
    } catch {
      // silently fail
    }
  }, []);

  const fetchTickets = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statutFilter) params.set('statut', statutFilter);
      if (prioriteFilter) params.set('priorite', prioriteFilter);
      if (categorieFilter) params.set('categorie_id', categorieFilter);
      if (technicienFilter) params.set('technicien_id', technicienFilter);
      if (clientFilter) params.set('client_id', clientFilter);
      if (searchDebounce) params.set('search', searchDebounce);
      if (slaDepasseFilter) params.set('sla_depasse', 'true');
      params.set('sort_by', sortBy);
      params.set('sort_order', sortOrder);

      const res = await api.get<PaginatedResponse<Ticket>>(`/tickets?${params}`);
      setTickets(res.data);
      setPagination(res.pagination);
    } catch {
      setTickets([]);
      setToast({ message: 'Erreur lors du chargement des tickets', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [statutFilter, prioriteFilter, categorieFilter, technicienFilter, clientFilter, searchDebounce, slaDepasseFilter, sortBy, sortOrder]);

  useEffect(() => {
    fetchTickets(1);
    fetchStats();
  }, [fetchTickets, fetchStats]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(prev => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(column);
      setSortOrder('DESC');
    }
  };

  const handleKpiClick = (type: string) => {
    setStatutFilter('');
    setSlaDepasseFilter(false);
    if (type === 'sla_depasse') {
      setSlaDepasseFilter(true);
    } else if (type === 'total') {
      // reset all
    } else {
      setStatutFilter(type as StatutTicket);
    }
  };

  const pageNumbers = () => {
    const pages: (number | string)[] = [];
    const { page, totalPages } = pagination;
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <svg className="h-3 w-3 text-gray-300 ml-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15 12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" /></svg>;
    return sortOrder === 'ASC'
      ? <svg className="h-3 w-3 text-blue-600 ml-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
      : <svg className="h-3 w-3 text-blue-600 ml-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>;
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{isTechnicien ? 'Mes Tickets' : 'Tickets'}</h1>
            <p className="mt-0.5 text-sm text-gray-500">{isTechnicien ? 'Tickets qui vous sont assignés' : 'Gestion des tickets support'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isTechnicien && (
            <button
              onClick={() => router.push('/dashboard/tickets/statistiques')}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
              </svg>
              Statistiques
            </button>
          )}
          <button
            onClick={() => { fetchTickets(pagination.page); fetchStats(); }}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            Actualiser
          </button>
          <button
            onClick={() => router.push('/dashboard/tickets/nouveau')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-700 hover:to-indigo-700 transition-all cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nouveau ticket
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { key: 'nouveau', label: 'Nouveaux', value: stats?.par_statut?.nouveau || 0, borderColor: 'border-l-blue-500', textColor: 'text-blue-600' },
          { key: 'en_cours', label: 'En cours', value: stats?.par_statut?.en_cours || 0, borderColor: 'border-l-yellow-500', textColor: 'text-yellow-600' },
          { key: 'en_attente', label: 'En attente', value: stats?.par_statut?.en_attente || 0, borderColor: 'border-l-orange-500', textColor: 'text-orange-600' },
          { key: 'resolu', label: 'Terminés', value: stats?.par_statut?.resolu || 0, borderColor: 'border-l-emerald-500', textColor: 'text-emerald-600' },
          { key: 'sla_depasse', label: 'SLA dépassé', value: stats?.sla_depasses || 0, borderColor: 'border-l-red-500', textColor: 'text-red-600' },
          { key: 'total', label: 'Total', value: stats?.total || 0, borderColor: 'border-l-gray-400', textColor: 'text-gray-700' },
        ].map(kpi => (
          <button
            key={kpi.key}
            onClick={() => handleKpiClick(kpi.key)}
            className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${kpi.borderColor} shadow-sm hover:shadow-md transition-shadow p-5 text-left cursor-pointer ${
              (kpi.key === 'sla_depasse' && slaDepasseFilter) || (kpi.key !== 'sla_depasse' && kpi.key !== 'total' && statutFilter === kpi.key)
                ? 'ring-2 ring-blue-500/30 shadow-md'
                : ''
            }`}
          >
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{kpi.label}</p>
            <p className={`mt-1 text-2xl font-bold ${kpi.textColor}`}>{kpi.value}</p>
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-3 items-start lg:items-center flex-wrap">
          {/* Search */}
          <div className="flex-1 relative w-full lg:max-w-sm">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher (n° ticket, sujet...)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl bg-gray-50/80 border border-gray-200 py-2.5 pl-10 pr-4 text-sm placeholder-gray-400 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
            />
          </div>

          {/* Statut */}
          <div className="relative">
            <select
              value={statutFilter}
              onChange={e => { setStatutFilter(e.target.value as StatutTicket | ''); setSlaDepasseFilter(false); }}
              className="appearance-none rounded-xl bg-gray-50/80 border border-gray-200 py-2.5 pl-4 pr-10 text-sm font-medium text-gray-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition cursor-pointer"
            >
              <option value="">Tous les statuts</option>
              <option value="nouveau">Nouveau</option>
              <option value="assigne">Assigné</option>
              <option value="en_cours">En cours</option>
              <option value="en_attente">En attente</option>
              <option value="resolu">Terminé</option>
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>

          {/* Priorité */}
          <div className="relative">
            <select
              value={prioriteFilter}
              onChange={e => setPrioriteFilter(e.target.value as PrioriteTicket | '')}
              className="appearance-none rounded-xl bg-gray-50/80 border border-gray-200 py-2.5 pl-4 pr-10 text-sm font-medium text-gray-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition cursor-pointer"
            >
              <option value="">Toutes priorités</option>
              <option value="basse">Basse</option>
              <option value="normale">Normale</option>
              <option value="haute">Haute</option>
              <option value="urgente">Urgente</option>
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>

          {/* Catégorie */}
          <div className="relative">
            <select
              value={categorieFilter}
              onChange={e => setCategorieFilter(e.target.value)}
              className="appearance-none rounded-xl bg-gray-50/80 border border-gray-200 py-2.5 pl-4 pr-10 text-sm font-medium text-gray-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition cursor-pointer"
            >
              <option value="">Toutes catégories</option>
              {categories.filter(c => c.actif).map(cat => (
                <option key={cat.id} value={String(cat.id)}>{cat.nom}</option>
              ))}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>

          {/* Technicien — masqué pour les techniciens */}
          {!isTechnicien && (
            <div className="relative">
              <select
                value={technicienFilter}
                onChange={e => setTechnicienFilter(e.target.value)}
                className="appearance-none rounded-xl bg-gray-50/80 border border-gray-200 py-2.5 pl-4 pr-10 text-sm font-medium text-gray-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition cursor-pointer"
              >
                <option value="">Tous techniciens</option>
                {technicians.map(tech => (
                  <option key={tech.id} value={tech.id}>{tech.first_name} {tech.last_name}</option>
                ))}
              </select>
              <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          )}

          {/* Client */}
          <div className="relative">
            <select
              value={clientFilter}
              onChange={e => setClientFilter(e.target.value)}
              className="appearance-none rounded-xl bg-gray-50/80 border border-gray-200 py-2.5 pl-4 pr-10 text-sm font-medium text-gray-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition cursor-pointer"
            >
              <option value="">Tous clients</option>
              {clients.map(c => (
                <option key={c.id} value={String(c.id)}>{c.raison_sociale}</option>
              ))}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>

        {/* Active filter chips */}
        {(search || statutFilter || prioriteFilter || categorieFilter || technicienFilter || clientFilter || slaDepasseFilter) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
            <span className="text-xs text-gray-400 font-medium">Filtres actifs :</span>
            {search && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                &quot;{search}&quot;
                <button onClick={() => setSearch('')} className="hover:text-blue-900 cursor-pointer">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </span>
            )}
            {statutFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                {STATUT_CONFIG[statutFilter].label}
                <button onClick={() => setStatutFilter('')} className="hover:text-blue-900 cursor-pointer">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </span>
            )}
            {prioriteFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                {PRIORITE_CONFIG[prioriteFilter].label}
                <button onClick={() => setPrioriteFilter('')} className="hover:text-blue-900 cursor-pointer">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </span>
            )}
            {categorieFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                {categories.find(c => String(c.id) === categorieFilter)?.nom}
                <button onClick={() => setCategorieFilter('')} className="hover:text-blue-900 cursor-pointer">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </span>
            )}
            {technicienFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                {technicians.find(t => t.id === technicienFilter)?.first_name} {technicians.find(t => t.id === technicienFilter)?.last_name}
                <button onClick={() => setTechnicienFilter('')} className="hover:text-blue-900 cursor-pointer">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </span>
            )}
            {clientFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                {clients.find(c => String(c.id) === clientFilter)?.raison_sociale}
                <button onClick={() => setClientFilter('')} className="hover:text-blue-900 cursor-pointer">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </span>
            )}
            {slaDepasseFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                SLA dépassé
                <button onClick={() => setSlaDepasseFilter(false)} className="hover:text-red-900 cursor-pointer">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </span>
            )}
            <button
              onClick={() => { setSearch(''); setStatutFilter(''); setPrioriteFilter(''); setCategorieFilter(''); setTechnicienFilter(''); setClientFilter(''); setSlaDepasseFilter(false); }}
              className="text-xs text-gray-400 hover:text-gray-600 font-medium ml-1 cursor-pointer"
            >
              Tout effacer
            </button>
          </div>
        )}
      </div>

      {/* View Toggle + Results count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-700">{pagination.total}</span> ticket{pagination.total > 1 ? 's' : ''} trouvé{pagination.total > 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
          <button
            onClick={() => setView('liste')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              view === 'liste' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
            Liste
          </button>
          <button
            onClick={() => setView('kanban')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
              view === 'kanban' ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125Z" />
            </svg>
            Kanban
          </button>
        </div>
      </div>

      {/* Table View */}
      {view === 'liste' && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort('numero')}>
                      <span className="inline-flex items-center">N° Ticket <SortIcon column="numero" /></span>
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort('sujet')}>
                      <span className="inline-flex items-center">Sujet <SortIcon column="sujet" /></span>
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Catégorie</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort('priorite')}>
                      <span className="inline-flex items-center">Priorité <SortIcon column="priorite" /></span>
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort('statut')}>
                      <span className="inline-flex items-center">Statut <SortIcon column="statut" /></span>
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Technicien</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">SLA</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort('created_at')}>
                      <span className="inline-flex items-center">Créé le <SortIcon column="created_at" /></span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
                          <p className="text-sm text-gray-400">Chargement des tickets...</p>
                        </div>
                      </td>
                    </tr>
                  ) : tickets.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-4">
                          <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
                            <svg className="h-12 w-12 text-blue-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-base font-semibold text-gray-700">Aucun ticket trouvé</p>
                            <p className="text-sm text-gray-400 mt-1">Modifiez vos filtres ou créez un nouveau ticket</p>
                          </div>
                          <button
                            onClick={() => router.push('/dashboard/tickets/nouveau')}
                            className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-700 hover:to-indigo-700 transition-all cursor-pointer"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                            Créer un ticket
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : tickets.map(ticket => (
                    <tr
                      key={ticket.id}
                      onClick={() => router.push(`/dashboard/tickets/${ticket.id}`)}
                      className="group hover:bg-blue-50/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-bold text-blue-600 font-mono">{ticket.numero}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[200px] group-hover:text-blue-700 transition-colors">
                          {ticket.sujet.length > 50 ? `${ticket.sujet.substring(0, 50)}…` : ticket.sujet}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-gray-700">{ticket.client_nom || '—'}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        {ticket.categorie_nom ? (
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                            style={{
                              backgroundColor: `${ticket.categorie_couleur}15`,
                              color: ticket.categorie_couleur || '#6b7280',
                            }}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full mr-1.5"
                              style={{ backgroundColor: ticket.categorie_couleur || '#6b7280' }}
                            />
                            {ticket.categorie_nom}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${PRIORITE_CONFIG[ticket.priorite].bg} ${PRIORITE_CONFIG[ticket.priorite].text} ${ticket.priorite === 'urgente' ? 'animate-pulse' : ''}`}>
                          {PRIORITE_CONFIG[ticket.priorite].label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${(STATUT_CONFIG[ticket.statut] || STATUT_FALLBACK).bg} ${(STATUT_CONFIG[ticket.statut] || STATUT_FALLBACK).text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${(STATUT_CONFIG[ticket.statut] || STATUT_FALLBACK).dot}`} />
                          {(STATUT_CONFIG[ticket.statut] || STATUT_FALLBACK).label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {ticket.technicien_prenom && ticket.technicien_nom_famille ? (
                          <div className="flex items-center gap-2">
                            <div className={`h-7 w-7 rounded-lg bg-gradient-to-br ${getGradient(ticket.technicien_prenom + ticket.technicien_nom_famille)} flex items-center justify-center text-white text-[10px] font-bold shadow-sm shrink-0`}>
                              {getInitials(ticket.technicien_prenom, ticket.technicien_nom_famille)}
                            </div>
                            <span className="text-xs text-gray-700">{ticket.technicien_prenom} {ticket.technicien_nom_famille}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Non assigné</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <SlaIndicator sla={ticket.sla} />
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-gray-400">{formatRelativeTime(ticket.created_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
                <p className="text-sm text-gray-500">
                  Affichage de <span className="font-medium text-gray-700">{(pagination.page - 1) * pagination.limit + 1}</span> à{' '}
                  <span className="font-medium text-gray-700">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> sur{' '}
                  <span className="font-medium text-gray-700">{pagination.total}</span>
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => fetchTickets(pagination.page - 1)}
                    className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  {pageNumbers().map((p, i) =>
                    typeof p === 'string' ? (
                      <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm">...</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => fetchTickets(p)}
                        className={`h-9 min-w-[36px] rounded-xl text-sm font-medium transition cursor-pointer ${
                          p === pagination.page
                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/25'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                  <button
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => fetchTickets(pagination.page + 1)}
                    className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Kanban View */}
      {view === 'kanban' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {KANBAN_COLUMNS.map(col => {
              const colTickets = tickets.filter(t => t.statut === col.statut);
              return (
                <div key={col.statut} className={`w-72 flex-shrink-0 bg-gray-50/80 rounded-2xl border border-gray-100 border-t-4 ${col.color}`}>
                  <div className="px-4 py-3 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-700">{col.label}</h3>
                      <span className="h-6 min-w-[24px] flex items-center justify-center rounded-full bg-white border border-gray-200 text-[11px] font-bold text-gray-500 px-1.5">
                        {colTickets.length}
                      </span>
                    </div>
                  </div>
                  <div className="p-3 space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto">
                    {loading ? (
                      <div className="flex flex-col items-center gap-2 py-8">
                        <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                        <p className="text-xs text-gray-400">Chargement...</p>
                      </div>
                    ) : colTickets.length === 0 ? (
                      <div className="py-8 text-center">
                        <p className="text-xs text-gray-400">Aucun ticket</p>
                      </div>
                    ) : colTickets.map(ticket => (
                      <div
                        key={ticket.id}
                        onClick={() => router.push(`/dashboard/tickets/${ticket.id}`)}
                        className="bg-white rounded-xl border border-gray-100 p-3.5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-bold text-blue-600 font-mono">{ticket.numero}</span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITE_CONFIG[ticket.priorite].bg} ${PRIORITE_CONFIG[ticket.priorite].text} ${ticket.priorite === 'urgente' ? 'animate-pulse' : ''}`}>
                            {PRIORITE_CONFIG[ticket.priorite].label}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 mb-2 line-clamp-2">
                          {ticket.sujet.length > 50 ? `${ticket.sujet.substring(0, 50)}…` : ticket.sujet}
                        </p>
                        <p className="text-xs text-gray-500 mb-3">{ticket.client_nom || '—'}</p>
                        <div className="flex items-center justify-between">
                          {ticket.technicien_prenom && ticket.technicien_nom_famille ? (
                            <div className="flex items-center gap-1.5">
                              <div className={`h-5 w-5 rounded-md bg-gradient-to-br ${getGradient(ticket.technicien_prenom + ticket.technicien_nom_famille)} flex items-center justify-center text-white text-[8px] font-bold`}>
                                {getInitials(ticket.technicien_prenom, ticket.technicien_nom_famille)}
                              </div>
                              <span className="text-[11px] text-gray-600">{ticket.technicien_prenom}</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-400 italic">Non assigné</span>
                          )}
                          <SlaIndicator sla={ticket.sla} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold shadow-xl transition-all ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? (
            <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          ) : (
            <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          )}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-1 hover:opacity-70 cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
