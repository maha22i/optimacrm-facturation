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
  SourceTicket,
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

function SourceBadge({ source }: { source?: SourceTicket }) {
  if (source !== 'email') return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700" title="Ticket créé depuis un email entrant">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
      </svg>
      Via mail
    </span>
  );
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
  const [sourceFilter, setSourceFilter] = useState<SourceTicket | ''>('');
  const [slaDepasseFilter, setSlaDepasseFilter] = useState(false);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

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
      if (sourceFilter) params.set('source', sourceFilter);
      if (searchDebounce) params.set('search', searchDebounce);
      if (slaDepasseFilter) params.set('sla_depasse', 'true');
      params.set('sort_by', sortBy);
      params.set('sort_order', sortOrder);

      const res = await api.get<PaginatedResponse<Ticket>>(`/tickets?${params}`);
      setTickets(res.data);
      setPagination(res.pagination);
      setSelectedIds([]);
    } catch {
      setTickets([]);
      setToast({ message: 'Erreur lors du chargement des tickets', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [statutFilter, prioriteFilter, categorieFilter, technicienFilter, clientFilter, sourceFilter, searchDebounce, slaDepasseFilter, sortBy, sortOrder]);

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

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
  };

  const allSelected = tickets.length > 0 && tickets.every(t => selectedIds.includes(t.id));

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? [] : tickets.map(t => t.id));
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedIds.map(id => api.delete(`/tickets/${id}`)),
      );
      const deleted = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - deleted;
      setToast({
        message: failed
          ? `${deleted} ticket(s) supprimé(s), ${failed} échec(s)`
          : `${deleted} ticket(s) supprimé(s)`,
        type: failed ? 'error' : 'success',
      });
      setShowBulkDeleteConfirm(false);
      setSelectedIds([]);
      fetchTickets(pagination.page);
      fetchStats();
    } finally {
      setBulkDeleting(false);
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

          {/* Source */}
          <div className="relative">
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value as SourceTicket | '')}
              className="appearance-none rounded-xl bg-gray-50/80 border border-gray-200 py-2.5 pl-4 pr-10 text-sm font-medium text-gray-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition cursor-pointer"
            >
              <option value="">Source : Tous</option>
              <option value="email">Via mail</option>
              <option value="manuel">Manuel</option>
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>

        {/* Active filter chips */}
        {(search || statutFilter || prioriteFilter || categorieFilter || technicienFilter || clientFilter || sourceFilter || slaDepasseFilter) && (
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
            {sourceFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                {sourceFilter === 'email' ? 'Via mail' : 'Manuel'}
                <button onClick={() => setSourceFilter('')} className="hover:text-violet-900 cursor-pointer">
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
              onClick={() => { setSearch(''); setStatutFilter(''); setPrioriteFilter(''); setCategorieFilter(''); setTechnicienFilter(''); setClientFilter(''); setSourceFilter(''); setSlaDepasseFilter(false); }}
              className="text-xs text-gray-400 hover:text-gray-600 font-medium ml-1 cursor-pointer"
            >
              Tout effacer
            </button>
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center mb-4">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-700">{pagination.total}</span> ticket{pagination.total > 1 ? 's' : ''} trouvé{pagination.total > 1 ? 's' : ''}
        </p>
      </div>

      {/* Barre d'actions sélection */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3 mb-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-blue-800">
              {selectedIds.length} ticket{selectedIds.length > 1 ? 's' : ''} sélectionné{selectedIds.length > 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs font-medium text-blue-500 hover:text-blue-700 underline cursor-pointer"
            >
              Tout désélectionner
            </button>
          </div>
          <button
            onClick={() => setShowBulkDeleteConfirm(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
            Supprimer la sélection
          </button>
        </div>
      )}

      {/* Table View */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                    {canDeleteTicket && (
                      <th className="pl-4 pr-1 py-3.5 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          title="Tout sélectionner"
                        />
                      </th>
                    )}
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
                      <td colSpan={canDeleteTicket ? 10 : 9} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3">
                          <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
                          <p className="text-sm text-gray-400">Chargement des tickets...</p>
                        </div>
                      </td>
                    </tr>
                  ) : tickets.length === 0 ? (
                    <tr>
                      <td colSpan={canDeleteTicket ? 10 : 9} className="py-20 text-center">
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
                      className={`group hover:bg-blue-50/30 cursor-pointer transition-colors ${selectedIds.includes(ticket.id) ? 'bg-blue-50/50' : ''}`}
                    >
                      {canDeleteTicket && (
                        <td className="pl-4 pr-1 py-3.5" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(ticket.id)}
                            onChange={() => toggleSelect(ticket.id)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-bold text-blue-600 font-mono">{ticket.numero}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate max-w-[200px] group-hover:text-blue-700 transition-colors">
                            {ticket.sujet.length > 50 ? `${ticket.sujet.substring(0, 50)}…` : ticket.sujet}
                          </p>
                          <SourceBadge source={ticket.source} />
                        </div>
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

      {/* Modal confirmation suppression groupée */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-red-50 to-orange-50 p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Supprimer {selectedIds.length} ticket{selectedIds.length > 1 ? 's' : ''} ?
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">Cette action est irréversible.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkDeleting}
                className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-sm font-medium transition cursor-pointer disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkDeleting ? (
                  <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> Suppression…</>
                ) : 'Supprimer'}
              </button>
            </div>
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
