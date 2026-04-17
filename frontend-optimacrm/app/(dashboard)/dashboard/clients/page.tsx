'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Client, PaginatedResponse, StatutClient } from '@/lib/types';

const STATUTS: { label: string; value: StatutClient | ''; color: string; dot: string }[] = [
  { label: 'Tous', value: '', color: 'text-gray-700', dot: 'bg-gray-400' },
  { label: 'Actifs', value: 'ACTIF', color: 'text-emerald-700', dot: 'bg-emerald-500' },
  { label: 'Prospects', value: 'PROSPECT', color: 'text-blue-700', dot: 'bg-blue-500' },
  { label: 'Bloqués', value: 'BLOQUE', color: 'text-red-700', dot: 'bg-red-500' },
  { label: 'Inactifs', value: 'INACTIF', color: 'text-gray-500', dot: 'bg-gray-400' },
];

const STATUT_CONFIG: Record<StatutClient, { label: string; bg: string; text: string; dot: string }> = {
  ACTIF: { label: 'Actif', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  PROSPECT: { label: 'Prospect', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  BLOQUE: { label: 'Bloqué', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  INACTIF: { label: 'Inactif', bg: 'bg-gray-100', text: 'text-gray-500', dot: 'bg-gray-400' },
};

const FORME_SHORT: Record<string, string> = {
  SARL: 'SARL', SAS: 'SAS', EURL: 'EURL', SA: 'SA', SCI: 'SCI',
  AUTO_ENTREPRENEUR: 'Auto-Entr.', ASSOCIATION: 'Asso.', AUTRE: 'Autre',
};

function StatusBadge({ statut }: { statut: StatutClient }) {
  const cfg = STATUT_CONFIG[statut];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-purple-500 to-pink-600',
  'from-cyan-500 to-blue-600',
  'from-rose-500 to-red-600',
];

function getGradient(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

function customFieldsPreview(client: Client) {
  if (!Array.isArray(client.champs_personnalises)) return [];
  return client.champs_personnalises.filter(c => c.label && c.valeur).slice(0, 2);
}

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutClient | ''>('');
  const [loading, setLoading] = useState(true);
  const [searchDebounce, setSearchDebounce] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchClients = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (statutFilter) params.set('statut', statutFilter);
      if (searchDebounce) params.set('search', searchDebounce);

      const res = await api.get<PaginatedResponse<Client>>(`/clients?${params}`);
      setClients(res.data);
      setPagination(res.pagination);
      setSelectedIds(new Set());
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [statutFilter, searchDebounce]);

  useEffect(() => {
    fetchClients(1);
  }, [fetchClients]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === clients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(clients.map(c => c.id)));
    }
  };

  const handleExportCSV = () => {
    if (clients.length === 0) return;
    const headers = ['Numéro', 'Raison sociale', 'Forme juridique', 'Email', 'Téléphone', 'Statut', 'SIRET', 'Ville'];
    const rows = clients.map(c => [
      c.numero_client, c.raison_sociale, c.forme_juridique,
      c.email_principal, c.telephone_principal || '', c.statut, c.siret || '', '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clients_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25 shrink-0">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestion des Clients</h1>
            <p className="mt-0.5 text-sm text-gray-500">Gérez vos clients et prospects</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchClients(pagination.page)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            Actualiser
          </button>
          <button
            onClick={() => router.push('/dashboard/clients/import')}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-700 hover:bg-violet-100 hover:border-violet-300 shadow-sm transition-all cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Importer
          </button>
          <button
            onClick={() => router.push('/dashboard/clients/nouveau')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:from-violet-700 hover:to-indigo-700 transition-all cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nouveau client
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: 'Total clients',
            value: pagination.total,
            borderColor: 'border-l-blue-500',
            iconBg: 'bg-blue-100',
            iconColor: 'text-blue-600',
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
            ),
          },
          {
            label: 'Actifs',
            value: clients.filter(c => c.statut === 'ACTIF').length,
            borderColor: 'border-l-emerald-500',
            iconBg: 'bg-emerald-100',
            iconColor: 'text-emerald-600',
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            ),
          },
          {
            label: 'Prospects',
            value: clients.filter(c => c.statut === 'PROSPECT').length,
            borderColor: 'border-l-amber-500',
            iconBg: 'bg-amber-100',
            iconColor: 'text-amber-600',
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            ),
          },
          {
            label: 'Bloqués',
            value: clients.filter(c => c.statut === 'BLOQUE').length,
            borderColor: 'border-l-red-500',
            iconBg: 'bg-red-100',
            iconColor: 'text-red-600',
            icon: (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            ),
          },
        ].map(stat => (
          <div
            key={stat.label}
            className={`bg-white/80 backdrop-blur-sm rounded-2xl border border-white/20 border-l-4 ${stat.borderColor} p-5 shadow-sm hover:shadow-md transition-shadow`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{stat.label}</p>
                <p className="mt-1.5 text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
              <div className={`h-10 w-10 rounded-full ${stat.iconBg} ${stat.iconColor} flex items-center justify-center`}>
                {stat.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
          {/* Search */}
          <div className="flex-1 relative w-full lg:max-w-md">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher (nom, raison sociale, email, tél, SIRET...)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl bg-gray-50/80 border border-gray-200 py-2.5 pl-10 pr-4 text-sm placeholder-gray-400 focus:bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-none transition"
            />
          </div>

          {/* Status dropdown */}
          <div className="relative">
            <select
              value={statutFilter}
              onChange={e => setStatutFilter(e.target.value as StatutClient | '')}
              className="appearance-none rounded-xl bg-gray-50/80 border border-gray-200 py-2.5 pl-4 pr-10 text-sm font-medium text-gray-700 focus:bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 outline-none transition cursor-pointer"
            >
              {STATUTS.map(s => (
                <option key={s.value} value={s.value}>{s.label === 'Tous' ? 'Tous les statuts' : s.label}</option>
              ))}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>

          {/* Export button */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Exporter
            </button>
          </div>
        </div>

        {/* Active filter chips */}
        {(statutFilter || search) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400 font-medium">Filtres actifs :</span>
            {search && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                &quot;{search}&quot;
                <button onClick={() => setSearch('')} className="hover:text-violet-900 cursor-pointer">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )}
            {statutFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                {STATUTS.find(s => s.value === statutFilter)?.label}
                <button onClick={() => setStatutFilter('')} className="hover:text-violet-900 cursor-pointer">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )}
            <button onClick={() => { setSearch(''); setStatutFilter(''); }} className="text-xs text-gray-400 hover:text-gray-600 font-medium ml-1 cursor-pointer">
              Tout effacer
            </button>
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-700">{pagination.total}</span> client{pagination.total > 1 ? 's' : ''} trouvé{pagination.total > 1 ? 's' : ''}
        </p>
        {selectedIds.size > 0 && (
          <span className="text-xs font-semibold text-violet-600 bg-violet-50 px-3 py-1 rounded-full">
            {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                <th className="w-12 px-4 py-3.5">
                  <input
                    type="checkbox"
                    checked={clients.length > 0 && selectedIds.size === clients.length}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">ID</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Raison sociale</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Coordonnées</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Champs perso</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Créé le</th>
                <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin h-8 w-8 border-[3px] border-violet-600 border-t-transparent rounded-full" />
                      <p className="text-sm text-gray-400">Chargement des clients...</p>
                    </div>
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-violet-50 to-indigo-100 flex items-center justify-center">
                        <svg className="h-12 w-12 text-violet-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-base font-semibold text-gray-700">Aucun client trouvé</p>
                        <p className="text-sm text-gray-400 mt-1">Modifiez vos filtres ou créez un nouveau client</p>
                      </div>
                      <button
                        onClick={() => router.push('/dashboard/clients/nouveau')}
                        className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:from-violet-700 hover:to-indigo-700 transition-all cursor-pointer"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Créer un client
                      </button>
                    </div>
                  </td>
                </tr>
              ) : clients.map(client => (
                <tr
                  key={client.id}
                  onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                  className={`group hover:bg-violet-50/30 cursor-pointer transition-colors ${selectedIds.has(client.id) ? 'bg-violet-50/50' : ''}`}
                >
                  <td className="w-12 px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(client.id)}
                      onChange={e => { e.stopPropagation(); toggleSelect(client.id); }}
                      onClick={e => e.stopPropagation()}
                      className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-bold text-gray-400 font-mono">{client.numero_client}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${getGradient(client.raison_sociale)} flex items-center justify-center text-white text-[11px] font-bold shadow-sm shrink-0`}>
                        {getInitials(client.raison_sociale)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-violet-700 transition-colors">{client.raison_sociale}</p>
                        <p className="text-[11px] text-gray-400">{FORME_SHORT[client.forme_juridique] || client.forme_juridique}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-sm text-gray-700 truncate max-w-[140px]">{client.email_principal}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5">
                      {client.telephone_principal ? (
                        <>
                          <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
                          </svg>
                          <span className="text-sm text-gray-600">{client.telephone_principal}</span>
                        </>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    {customFieldsPreview(client).length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-w-[200px]">
                        {customFieldsPreview(client).map((champ, idx) => (
                          <span key={`${champ.label}-${idx}`} className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                            {champ.label}: {champ.valeur}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge statut={client.statut} />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-gray-400">{new Date(client.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/dashboard/clients/${client.id}`); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition cursor-pointer"
                        title="Voir la fiche"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/dashboard/clients/${client.id}/modifier`); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition cursor-pointer"
                        title="Modifier"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                        </svg>
                      </button>
                      <button
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                        title="Supprimer"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
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
                onClick={() => fetchClients(pagination.page - 1)}
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
                    onClick={() => fetchClients(p)}
                    className={`h-9 min-w-[36px] rounded-xl text-sm font-medium transition cursor-pointer ${
                      p === pagination.page
                        ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-500/25'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchClients(pagination.page + 1)}
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
    </div>
  );
}
