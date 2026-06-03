'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { ParcMachine, ParcStats, PaginatedResponse, ApiResponse, CategorieMachine, StatutMachine } from '@/lib/types';

const CATEGORIE_BADGES: Record<CategorieMachine, { label: string; color: string }> = {
  Copieur:       { label: 'Copieur',       color: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  'Téléphonie':  { label: 'Téléphonie',    color: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  Informatique:  { label: 'Informatique',  color: 'bg-purple-50 text-purple-700 ring-purple-600/20' },
};

const STATUT_BADGES: Record<StatutMachine, { color: string; dot: string }> = {
  'En service':   { color: 'text-emerald-700 bg-emerald-50 ring-emerald-600/20', dot: 'bg-emerald-500' },
  'En stock':     { color: 'text-blue-700 bg-blue-50 ring-blue-600/20',          dot: 'bg-blue-500' },
  'En SAV':       { color: 'text-amber-700 bg-amber-50 ring-amber-600/20',       dot: 'bg-amber-500' },
  'Retourné':     { color: 'text-gray-500 bg-gray-50 ring-gray-400/20',          dot: 'bg-gray-400' },
  'Hors service': { color: 'text-red-700 bg-red-50 ring-red-600/20',             dot: 'bg-red-500' },
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatNumber(n: number | null | undefined) {
  if (n == null) return '0';
  return n.toLocaleString('fr-FR');
}

export default function ParcMachinesPage() {
  const router = useRouter();
  const [machines, setMachines] = useState<ParcMachine[]>([]);
  const [stats, setStats] = useState<ParcStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');
  const [filterCategorie, setFilterCategorie] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterAlerteCompteur, setFilterAlerteCompteur] = useState(false);

  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx'>('xlsx');
  const [exportApplyFilters, setExportApplyFilters] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const handleExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const params = new URLSearchParams({ format: exportFormat });
      if (exportApplyFilters) {
        if (filterCategorie) params.set('categorie', filterCategorie);
        if (filterStatut) params.set('statut', filterStatut);
        if (searchDebounce) params.set('search', searchDebounce);
      }
      await api.download(`/parc-machines/export?${params}`);
      setShowExportModal(false);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Erreur lors de l\'export');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [searchDebounce, filterCategorie, filterStatut, filterAlerteCompteur]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setImportMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadMachines = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (searchDebounce) params.set('search', searchDebounce);
      if (filterCategorie) params.set('categorie', filterCategorie);
      if (filterStatut) params.set('statut', filterStatut);
      if (filterAlerteCompteur) params.set('alerte_compteur', 'true');

      const res = await api.get<PaginatedResponse<ParcMachine>>(`/parc-machines?${params}`);
      setMachines(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotal(res.pagination.total);
    } catch { /* silently fail */ } finally { setLoading(false); }
  }, [page, searchDebounce, filterCategorie, filterStatut, filterAlerteCompteur]);

  const loadStats = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<ParcStats>>('/parc-machines/stats');
      setStats(res.data);
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => { loadMachines(); }, [loadMachines]);
  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M9.75 8.25h.008v.008H9.75V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Parc Machine</h1>
            <p className="mt-0.5 text-sm text-gray-500">Gérez vos équipements déployés · {total} équipement{total > 1 ? 's' : ''} au total</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowExportModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Exporter
          </button>
        <div className="relative" ref={importMenuRef}>
          <button
            onClick={() => setImportMenuOpen(!importMenuOpen)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Importer des relevés
          </button>
          {importMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl bg-white border border-gray-100 shadow-xl shadow-black/[0.08] py-1.5 z-50">
              <button
                onClick={() => { setImportMenuOpen(false); router.push('/dashboard/parc-machines/import-releves'); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors cursor-pointer"
              >
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
                </svg>
                Importer des relevés compteurs
              </button>
              <button
                onClick={() => { setImportMenuOpen(false); router.push('/dashboard/parc-machines/import'); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors cursor-pointer"
              >
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M9.75 8.25h.008v.008H9.75V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
                Importer des machines
              </button>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">En service</p>
                <p className="text-2xl font-bold text-gray-900">{stats.en_service}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">Par catégorie</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-medium text-emerald-600">{stats.par_categorie?.Copieur || 0} Cop.</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs font-medium text-blue-600">{stats.par_categorie?.['Téléphonie'] || 0} Tél.</span>
                  <span className="text-gray-300">·</span>
                  <span className="text-xs font-medium text-purple-600">{stats.par_categorie?.Informatique || 0} Info.</span>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">En SAV</p>
                <p className="text-2xl font-bold text-gray-900">{stats.en_sav}</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => { setFilterAlerteCompteur(!filterAlerteCompteur); setFilterCategorie(''); setFilterStatut(''); }}
            className={`bg-white rounded-xl border p-5 shadow-sm text-left transition-all cursor-pointer ${filterAlerteCompteur ? 'border-red-300 ring-2 ring-red-500/20' : 'border-gray-100 hover:border-red-200'}`}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">Alertes compteurs</p>
                <p className="text-2xl font-bold text-gray-900">{stats.alertes_compteurs}</p>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher par n° série, modèle, client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
            />
          </div>
          <select
            value={filterCategorie}
            onChange={(e) => { setFilterCategorie(e.target.value); setFilterAlerteCompteur(false); }}
            className="rounded-lg border border-gray-200 py-2 px-3 text-sm text-gray-700 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none cursor-pointer"
          >
            <option value="">Toutes les catégories</option>
            <option value="Copieur">Copieur</option>
            <option value="Téléphonie">Téléphonie</option>
            <option value="Informatique">Informatique</option>
          </select>
          <select
            value={filterStatut}
            onChange={(e) => { setFilterStatut(e.target.value); setFilterAlerteCompteur(false); }}
            className="rounded-lg border border-gray-200 py-2 px-3 text-sm text-gray-700 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none cursor-pointer"
          >
            <option value="">Tous les statuts</option>
            <option value="En service">En service</option>
            <option value="En stock">En stock</option>
            <option value="En SAV">En SAV</option>
            <option value="Retourné">Retourné</option>
            <option value="Hors service">Hors service</option>
          </select>
          {filterAlerteCompteur && (
            <button onClick={() => setFilterAlerteCompteur(false)} className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 text-red-700 px-3 py-2 text-xs font-medium ring-1 ring-inset ring-red-600/20 cursor-pointer hover:bg-red-100 transition-colors">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              Alertes compteurs
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">N° Série</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Désignation</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Catégorie</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Contrat</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Compteur N/B</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Compteur Couleur</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Dernier relevé</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
                      <span className="text-sm">Chargement...</span>
                    </div>
                  </td>
                </tr>
              ) : machines.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M9.75 8.25h.008v.008H9.75V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                      </svg>
                      <p className="text-sm font-medium">Aucun équipement trouvé</p>
                      <p className="text-xs text-gray-400">Modifiez vos filtres ou importez des contrats pour alimenter le parc</p>
                    </div>
                  </td>
                </tr>
              ) : machines.map((m) => {
                const catBadge = CATEGORIE_BADGES[m.categorie] || CATEGORIE_BADGES.Copieur;
                const statBadge = STATUT_BADGES[m.statut] || STATUT_BADGES['En service'];
                const isCopieur = m.categorie === 'Copieur';
                return (
                  <tr
                    key={m.id}
                    onClick={() => router.push(`/dashboard/parc-machines/${m.id}`)}
                    className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-mono font-semibold text-gray-900">{m.numero_serie}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{m.designation}</p>
                      {m.marque && <p className="text-xs text-gray-400">{m.marque}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${catBadge.color}`}>
                        {catBadge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {m.client_raison_sociale ? (
                        <div>
                          <p className="text-sm font-medium text-gray-900 truncate max-w-[180px]">{m.client_raison_sociale}</p>
                          <p className="text-xs text-gray-400">{m.client_code}</p>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {m.numero_contrat ? (
                        <span className="text-sm text-blue-600 font-medium">{m.numero_contrat}</span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isCopieur ? (
                        <span className="text-sm font-medium text-gray-900 tabular-nums">{formatNumber(m.dernier_compteur_nb)}</span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isCopieur ? (
                        <span className="text-sm font-medium text-gray-900 tabular-nums">{formatNumber(m.dernier_compteur_couleur)}</span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isCopieur ? (
                        m.date_dernier_releve ? (
                          <span className="text-sm text-gray-700">{formatDate(m.date_dernier_releve)}</span>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium">Aucun relevé</span>
                        )
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${statBadge.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statBadge.dot}`} />
                        {m.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => router.push(`/dashboard/parc-machines/${m.id}`)}
                        className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                        title="Voir la fiche"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Page {page} sur {totalPages} ({total} résultat{total > 1 ? 's' : ''})
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Précédent
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Export */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 relative">
            <button onClick={() => setShowExportModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Exporter le parc machines</h3>
            <p className="text-sm text-gray-500 mb-5">Choisissez les options d&apos;export.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Format du fichier</label>
                <div className="flex gap-3">
                  {(['xlsx', 'csv'] as const).map(f => (
                    <button key={f} onClick={() => setExportFormat(f)}
                      className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-all cursor-pointer ${exportFormat === f ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      {f === 'xlsx' ? 'Excel (.xlsx)' : 'CSV (.csv)'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Périmètre</label>
                <div className="flex gap-3">
                  <button onClick={() => setExportApplyFilters(false)}
                    className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-all cursor-pointer ${!exportApplyFilters ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    Toutes les machines
                  </button>
                  <button onClick={() => setExportApplyFilters(true)}
                    className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-all cursor-pointer ${exportApplyFilters ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    Filtres actuels
                  </button>
                </div>
                {exportApplyFilters && (filterCategorie || filterStatut || searchDebounce) && (
                  <p className="mt-2 text-xs text-gray-500">
                    Filtres actifs : {[filterCategorie && `Catégorie = ${filterCategorie}`, filterStatut && `Statut = ${filterStatut}`, searchDebounce && `Recherche = "${searchDebounce}"`].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </div>

            {exportError && <p className="mt-4 text-sm text-red-600">{exportError}</p>}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                Annuler
              </button>
              <button onClick={handleExport} disabled={exporting}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer inline-flex items-center gap-2"
              >
                {exporting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Export en cours...
                  </>
                ) : 'Télécharger'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
