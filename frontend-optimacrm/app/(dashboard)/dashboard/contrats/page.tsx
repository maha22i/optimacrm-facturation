'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Contrat, ContratStats, PaginatedResponse, ApiResponse, TypeContrat, StatutContrat } from '@/lib/types';

const TYPE_BADGES: Record<TypeContrat, { label: string; color: string; icon: string }> = {
  Copieur:      { label: 'Copieur',      color: 'bg-blue-50 text-blue-700 ring-blue-600/20',     icon: '🖨️' },
  Telephonie:   { label: 'Téléphonie',   color: 'bg-green-50 text-green-700 ring-green-600/20',  icon: '📞' },
  Informatique: { label: 'Informatique', color: 'bg-purple-50 text-purple-700 ring-purple-600/20', icon: '💻' },
  Securite:     { label: 'Sécurité',     color: 'bg-orange-50 text-orange-700 ring-orange-600/20', icon: '🔒' },
};

const STATUT_BADGES: Record<string, { color: string; dot: string }> = {
  Brouillon:  { color: 'text-gray-600 bg-gray-50 ring-gray-500/20',   dot: 'bg-gray-500' },
  Actif:      { color: 'text-emerald-700 bg-emerald-50 ring-emerald-600/20', dot: 'bg-emerald-500' },
  Suspendu:   { color: 'text-amber-700 bg-amber-50 ring-amber-600/20', dot: 'bg-amber-500' },
  'Résilié':  { color: 'text-red-700 bg-red-50 ring-red-600/20',       dot: 'bg-red-500' },
  'Échu':     { color: 'text-gray-500 bg-gray-50 ring-gray-400/20',    dot: 'bg-gray-400' },
  'Renouvelé': { color: 'text-blue-700 bg-blue-50 ring-blue-600/20',   dot: 'bg-blue-500' },
  'Inactif':  { color: 'text-slate-600 bg-slate-50 ring-slate-400/20', dot: 'bg-slate-400' },
};

const ECHEANCE_FILTERS = [
  { label: 'Tous', value: '' },
  { label: '< 1 mois', value: '1' },
  { label: '< 3 mois', value: '3' },
  { label: '< 6 mois', value: '6' },
];

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMoney(n: number | string | null | undefined) {
  const val = typeof n === 'string' ? parseFloat(n) : n;
  if (val == null || isNaN(val)) return '0,00 €';
  return val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function ContratsPage() {
  const router = useRouter();
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [stats, setStats] = useState<ContratStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterEcheance, setFilterEcheance] = useState('');

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [deleteAllStep, setDeleteAllStep] = useState<0 | 1 | 2>(0);
  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState('');
  const DELETE_ALL_PHRASE = 'SUPPRIMER TOUS LES CONTRATS';

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('xlsx');
  const [exportLignes, setExportLignes] = useState(true);
  const [exportMachines, setExportMachines] = useState(true);
  const [exportApplyFilters, setExportApplyFilters] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [searchDebounce, filterType, filterStatut, filterEcheance]);

  const loadContrats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (searchDebounce) params.set('search', searchDebounce);
      if (filterType) params.set('type_contrat', filterType);
      if (filterStatut) params.set('statut', filterStatut);
      if (filterEcheance) {
        const d = new Date();
        d.setMonth(d.getMonth() + parseInt(filterEcheance));
        params.set('echeance_avant', d.toISOString().split('T')[0]);
      }

      const res = await api.get<PaginatedResponse<Contrat>>(`/contrats?${params}`);
      setContrats(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
      setSelectedIds(new Set());
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [page, searchDebounce, filterType, filterStatut, filterEcheance]);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<ContratStats>>('/contrats/stats');
      setStats(res.data);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => { loadContrats(); }, [loadContrats]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/contrats/${deleteId}`);
      setDeleteId(null);
      loadContrats();
      loadStats();
    } catch {
      // silently fail
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const params = new URLSearchParams({ format: exportFormat });
      if (exportLignes) params.set('lignes', '1');
      if (exportMachines) params.set('machines', '1');
      if (exportApplyFilters) {
        if (filterType) params.set('type_contrat', filterType);
        if (filterStatut) params.set('statut', filterStatut);
        if (searchDebounce) params.set('search', searchDebounce);
      }
      await api.download(`/contrats/export?${params}`);
      setShowExportModal(false);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Erreur lors de l\'export');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (deleteAllConfirmText !== DELETE_ALL_PHRASE) return;
    setDeletingAll(true);
    setDeleteAllError('');
    try {
      await api.delete('/contrats/all');
      setDeleteAllStep(0);
      setDeleteAllConfirmText('');
      loadContrats();
      loadStats();
    } catch (err: unknown) {
      setDeleteAllError(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    } finally {
      setDeletingAll(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === contrats.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contrats.map(c => c.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    try {
      await api.post('/contrats/bulk-delete', { ids: Array.from(selectedIds) });
      setShowBulkDeleteConfirm(false);
      setSelectedIds(new Set());
      loadContrats();
      loadStats();
    } catch {
      // silently fail
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkInactif = async () => {
    if (selectedIds.size === 0) return;
    try {
      await api.post('/contrats/bulk-status', { ids: Array.from(selectedIds), statut: 'Inactif' });
      setSelectedIds(new Set());
      loadContrats();
      loadStats();
    } catch {
      // silently fail
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      const res = await api.post<ApiResponse<Contrat>>(`/contrats/${id}/duplicate`, {});
      router.push(`/dashboard/contrats/${res.data.id}`);
    } catch {
      // silently fail
    }
  };

  const pageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    const delta = 2;
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
        pages.push(i);
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...');
      }
    }
    return pages;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contrats</h1>
            <p className="mt-0.5 text-sm text-gray-500">{total} contrat{total > 1 ? 's' : ''} au total</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {total > 0 && (
            <button
              onClick={() => setDeleteAllStep(1)}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
              Tout supprimer
            </button>
          )}
          <button
            onClick={() => setShowExportModal(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Exporter
          </button>
          <button
            onClick={() => router.push('/dashboard/contrats/import')}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Importer
          </button>
          <button
            onClick={() => router.push('/dashboard/contrats/import-telephonie')}
            className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 hover:bg-green-100 hover:border-green-300 shadow-sm transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
            </svg>
            Import téléphonie
          </button>
          <button
            onClick={() => router.push('/dashboard/contrats/import-informatique')}
            className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm font-medium text-purple-700 hover:bg-purple-100 hover:border-purple-300 shadow-sm transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
            </svg>
            Import informatique
          </button>
          <button
            onClick={() => router.push('/dashboard/contrats/nouveau')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-700 hover:to-indigo-700 transition-all cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nouveau contrat
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Contrats actifs</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.total_actifs}</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm shrink-0">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">À facturer</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.a_facturer_ce_mois}</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm shrink-0">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Échéance &lt; 3 mois</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{stats.echeance_3_mois}</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-sm shrink-0">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">CA récurrent mensuel</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{formatMoney(stats.ca_recurrent_mensuel)}</p>
              </div>
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-sm shrink-0">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher par n° contrat, client, n° série..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-xl appearance-none border border-gray-200 py-2.5 pl-4 pr-10 text-sm text-gray-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none cursor-pointer"
          >
            <option value="">Tous les types</option>
            <option value="Copieur">Copieur</option>
            <option value="Telephonie">Téléphonie</option>
            <option value="Informatique">Informatique</option>
            <option value="Securite">Sécurité</option>
          </select>

          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            className="rounded-xl appearance-none border border-gray-200 py-2.5 pl-4 pr-10 text-sm text-gray-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none cursor-pointer"
          >
            <option value="">Tous les statuts</option>
            <option value="Actif">Actif</option>
            <option value="Brouillon">Brouillon</option>
            <option value="Inactif">Inactif</option>
            <option value="Suspendu">Suspendu</option>
            <option value="Résilié">Résilié</option>
            <option value="Échu">Échu</option>
          </select>

          <select
            value={filterEcheance}
            onChange={(e) => setFilterEcheance(e.target.value)}
            className="rounded-xl appearance-none border border-gray-200 py-2.5 pl-4 pr-10 text-sm text-gray-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none cursor-pointer"
          >
            {ECHEANCE_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label === 'Tous' ? 'Échéance : Tous' : `Échéance ${f.label}`}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 mb-4 bg-blue-50 border-2 border-blue-200 rounded-2xl px-5 py-3 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-blue-700">
              {selectedIds.size} contrat{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
            <div className="h-5 w-px bg-blue-200" />
            <button
              onClick={handleBulkInactif}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              Rendre inactif
            </button>
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
              Supprimer la sélection
            </button>
          </div>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
          >
            Tout désélectionner
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={contrats.length > 0 && selectedIds.size === contrats.length}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">N° Contrat</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Machine / Service</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Périodicité</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Proch. fact.</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Échéance</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="text-right px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Montant HT</th>
                <th className="text-right px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
                      <span className="text-sm">Chargement...</span>
                    </div>
                  </td>
                </tr>
              ) : contrats.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                      <p className="text-sm font-medium">Aucun contrat trouvé</p>
                      <p className="text-xs text-gray-400">Modifiez vos filtres ou créez un nouveau contrat</p>
                    </div>
                  </td>
                </tr>
              ) : contrats.map((c) => {
                const typeBadge = TYPE_BADGES[c.type_contrat];
                const statutBadge = STATUT_BADGES[c.statut] || STATUT_BADGES.Brouillon;
                return (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/dashboard/contrats/${c.id}`)}
                    className={`hover:bg-blue-50/30 cursor-pointer transition-colors ${selectedIds.has(c.id) ? 'bg-blue-50/50' : ''}`}
                  >
                    <td className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleSelect(c.id)}
                        onClick={e => e.stopPropagation()}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-gray-900">{c.numero_contrat}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${typeBadge.color}`}>
                        {typeBadge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[180px]">{c.client_raison_sociale}</p>
                        <p className="text-xs text-gray-400">{c.client_code}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-600 truncate max-w-[200px]">{c.machines_resume || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.periodicite}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(c.date_prochaine_facture)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDate(c.date_echeance)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${statutBadge.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statutBadge.dot}`} />
                        {c.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-gray-900">{formatMoney(c.montant_ht)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => router.push(`/dashboard/contrats/${c.id}`)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                          title="Voir"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDuplicate(c.id)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                          title="Dupliquer"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteId(c.id)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Supprimer"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
            <p className="text-sm text-gray-500">
              Page <span className="font-medium text-gray-700">{page}</span> sur{' '}
              <span className="font-medium text-gray-700">{totalPages}</span>{' '}
              ({total} résultat{total > 1 ? 's' : ''})
            </p>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>
              {pageNumbers().map((p, i) =>
                typeof p === 'string' ? (
                  <span key={`e-${i}`} className="px-2 text-gray-400 text-sm">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`h-9 min-w-[36px] rounded-xl text-sm font-medium transition cursor-pointer ${p === page ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
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

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Exporter les contrats</h3>
                <p className="text-sm text-gray-500 mt-0.5">Configurez votre export</p>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Format du fichier</label>
                <div className="flex gap-3">
                  {(['xlsx', 'csv'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => setExportFormat(fmt)}
                      className={`flex-1 flex items-center gap-3 rounded-xl border-2 p-3.5 transition cursor-pointer ${exportFormat === fmt ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${exportFormat === fmt ? 'bg-blue-100' : 'bg-gray-100'}`}>
                        <svg className={`h-5 w-5 ${exportFormat === fmt ? 'text-blue-600' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${exportFormat === fmt ? 'text-blue-700' : 'text-gray-700'}`}>{fmt === 'xlsx' ? 'Excel (.xlsx)' : 'CSV (.csv)'}</p>
                        <p className="text-xs text-gray-400">{fmt === 'xlsx' ? 'Multi-onglets (contrats, lignes, machines)' : 'Format texte universel'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Données à inclure</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-100 transition">
                    <input type="checkbox" checked disabled className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">Informations contrats</p>
                      <p className="text-xs text-gray-400">N° contrat, type, client, dates, montants, statut...</p>
                    </div>
                  </label>
                  {exportFormat === 'xlsx' && (
                    <>
                      <label className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-100 transition">
                        <input type="checkbox" checked={exportLignes} onChange={e => setExportLignes(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">Lignes de facturation</p>
                          <p className="text-xs text-gray-400">Onglet séparé avec désignation, quantité, prix...</p>
                        </div>
                      </label>
                      <label className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-100 transition">
                        <input type="checkbox" checked={exportMachines} onChange={e => setExportMachines(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                        <div>
                          <p className="text-sm font-medium text-gray-700">Machines / Équipements</p>
                          <p className="text-xs text-gray-400">Onglet séparé avec n° série, compteurs, coûts copie...</p>
                        </div>
                      </label>
                    </>
                  )}
                </div>
              </div>

              {(filterType || filterStatut || searchDebounce || filterEcheance) && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Périmètre</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-100 transition">
                      <input type="radio" checked={!exportApplyFilters} onChange={() => setExportApplyFilters(false)} className="h-4 w-4 border-gray-300 text-blue-600 cursor-pointer" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Tous les contrats</p>
                        <p className="text-xs text-gray-400">Exporter la totalité</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3 cursor-pointer hover:bg-gray-100 transition">
                      <input type="radio" checked={exportApplyFilters} onChange={() => setExportApplyFilters(true)} className="h-4 w-4 border-gray-300 text-blue-600 cursor-pointer" />
                      <div>
                        <p className="text-sm font-medium text-gray-700">Avec les filtres actifs</p>
                        <p className="text-xs text-gray-400">
                          {[filterType && `Type : ${filterType}`, filterStatut && `Statut : ${filterStatut}`, searchDebounce && `"${searchDebounce}"`].filter(Boolean).join(' + ')}
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {exportError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{exportError}</p>}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4 bg-gray-50/50">
              <p className="text-xs text-gray-400">{total} contrat{total > 1 ? 's' : ''} au total</p>
              <div className="flex items-center gap-3">
                <button onClick={() => { setShowExportModal(false); setExportError(''); }} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
                <button onClick={handleExport} disabled={exporting} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:from-blue-700 hover:to-indigo-700 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                  {exporting ? (<><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />Export en cours...</>) : (<><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>Télécharger</>)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete All — Étape 1 */}
      {deleteAllStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-red-50 p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-900">Attention — Zone dangereuse</h3>
                <p className="text-sm text-red-700 mt-0.5">Cette action est irréversible</p>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-700">
                Vous êtes sur le point de supprimer <strong className="text-red-600">définitivement</strong> la totalité des{' '}
                <strong className="text-red-600">{total} contrat(s)</strong>, ainsi que toutes les données associées : lignes de facturation et machines.
              </p>
              <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3">
                <div className="flex gap-2">
                  <svg className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  <p className="text-xs text-amber-800">
                    Cette opération supprimera toutes les données de contrats de manière permanente. Aucune récupération ne sera possible.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 pb-6">
              <button
                onClick={() => { setDeleteAllStep(0); setDeleteAllError(''); }}
                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => setDeleteAllStep(2)}
                className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 shadow-sm transition cursor-pointer"
              >
                Oui, continuer la suppression
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All — Étape 2 : Confirmation finale */}
      {deleteAllStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-red-600 p-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Confirmation finale</h3>
                  <p className="text-sm text-red-100">Étape 2 sur 2</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-700 mb-4">
                Pour confirmer la suppression de <strong>{total} contrat(s)</strong>, tapez exactement :
              </p>
              <div className="rounded-lg bg-gray-100 px-3 py-2 text-center mb-4">
                <code className="text-sm font-bold text-red-600 select-all">{DELETE_ALL_PHRASE}</code>
              </div>
              <input
                type="text"
                value={deleteAllConfirmText}
                onChange={e => setDeleteAllConfirmText(e.target.value)}
                placeholder="Tapez la phrase de confirmation..."
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-red-400 focus:ring-2 focus:ring-red-500/20 outline-none transition"
                autoFocus
              />
              {deleteAllError && (
                <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{deleteAllError}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 pb-6">
              <button
                onClick={() => { setDeleteAllStep(0); setDeleteAllConfirmText(''); setDeleteAllError(''); }}
                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleDeleteAll}
                disabled={deleteAllConfirmText !== DELETE_ALL_PHRASE || deletingAll}
                className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 shadow-sm transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deletingAll ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Suppression...
                  </span>
                ) : (
                  'Supprimer définitivement'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk delete confirmation modal */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900">Supprimer la sélection</h3>
            <p className="mt-2 text-sm text-gray-500">
              Êtes-vous sûr de vouloir supprimer <strong className="text-red-600">{selectedIds.size} contrat{selectedIds.size > 1 ? 's' : ''}</strong> ?
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition cursor-pointer disabled:opacity-60"
              >
                {bulkDeleting ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Suppression...
                  </span>
                ) : (
                  'Supprimer'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900">Supprimer le contrat</h3>
            <p className="mt-2 text-sm text-gray-500">Êtes-vous sûr de vouloir supprimer ce contrat ? Cette action est réversible.</p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition cursor-pointer"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-semibold shadow-xl transition-all ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? (
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          )}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-1 opacity-70 hover:opacity-100 transition cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
