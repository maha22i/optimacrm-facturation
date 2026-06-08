'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Devis, DevisStats, PaginatedResponse, ApiResponse, StatutDevis } from '@/lib/types';

interface ImportResult {
  imported: number;
  updated: number;
  errors: { row: number; message: string }[];
}

interface ImportParseResult {
  totalRows: number;
  rows: Record<string, unknown>[];
  preview: Record<string, unknown>[];
  detectedColumns: string[];
  fileName: string;
}

const STATUT_CONFIG: Record<StatutDevis, { label: string; bg: string; text: string; dot: string }> = {
  BROUILLON: { label: 'Brouillon', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  ENVOYE: { label: 'Envoyé', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  ACCEPTE: { label: 'Accepté', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  REFUSE: { label: 'Refusé', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  EXPIRE: { label: 'Expiré', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  FACTURE: { label: 'Facturé', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
};

const STATUT_TABS: { label: string; value: StatutDevis | '' }[] = [
  { label: 'Tous', value: '' },
  { label: 'Brouillons', value: 'BROUILLON' },
  { label: 'Envoyés', value: 'ENVOYE' },
  { label: 'Acceptés', value: 'ACCEPTE' },
  { label: 'Refusés', value: 'REFUSE' },
  { label: 'Expirés', value: 'EXPIRE' },
  { label: 'Facturés', value: 'FACTURE' },
];

function StatusBadge({ statut }: { statut: StatutDevis }) {
  const cfg = STATUT_CONFIG[statut];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatMontant(v: number | string) {
  return parseFloat(String(v || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isExpired(devis: Devis) {
  return devis.statut === 'ENVOYE' && new Date(devis.date_validite) < new Date();
}

export default function DevisListPage() {
  const router = useRouter();
  const [devisList, setDevisList] = useState<Devis[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<DevisStats | null>(null);
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutDevis | ''>('');
  const [loading, setLoading] = useState(true);
  const [searchDebounce, setSearchDebounce] = useState('');
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3 | 4>(1);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importParsed, setImportParsed] = useState<ImportParseResult | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importExecuting, setImportExecuting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importOptUpdate, setImportOptUpdate] = useState(true);
  const [importOptLinkClients, setImportOptLinkClients] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    api.get<ApiResponse<DevisStats>>('/devis/stats').then(r => setStats(r.data)).catch(() => {});
  }, []);

  const fetchDevis = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (statutFilter) params.set('statut', statutFilter);
      if (searchDebounce) params.set('search', searchDebounce);

      const res = await api.get<PaginatedResponse<Devis>>(`/devis?${params}`);
      setDevisList(res.data);
      setPagination(res.pagination);
    } catch {
      setDevisList([]);
    } finally {
      setLoading(false);
    }
  }, [statutFilter, searchDebounce]);

  useEffect(() => { fetchDevis(1); }, [fetchDevis]);

  const handleAction = async (action: string, devis: Devis) => {
    setMenuOpen(null);
    try {
      if (action === 'dupliquer') {
        const res = await api.post<ApiResponse<{ id: number }>>(`/devis/${devis.id}/dupliquer`, {});
        router.push(`/dashboard/devis/${res.data.id}/modifier`);
      } else if (action === 'accepter') {
        await api.post(`/devis/${devis.id}/accepter`, {});
        fetchDevis(pagination.page);
      } else if (action === 'refuser') {
        await api.post(`/devis/${devis.id}/refuser`, {});
        fetchDevis(pagination.page);
      } else if (action === 'transformer') {
        await api.post(`/devis/${devis.id}/transformer-facture`, {});
        fetchDevis(pagination.page);
      } else if (action === 'supprimer') {
        if (confirm('Êtes-vous sûr de vouloir supprimer ce devis ?')) {
          await api.delete(`/devis/${devis.id}`);
          fetchDevis(pagination.page);
        }
      } else if (action === 'pdf') {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
        const response = await fetch(`${apiUrl}/devis/${devis.id}/pdf`, {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Erreur génération PDF');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const resetImport = useCallback(() => {
    setImportStep(1);
    setImportFile(null);
    setImportParsed(null);
    setImportResult(null);
    setImportError(null);
    setImportParsing(false);
    setImportExecuting(false);
  }, []);

  const openImportModal = useCallback(() => {
    resetImport();
    setShowImportModal(true);
  }, [resetImport]);

  const closeImportModal = useCallback(() => {
    setShowImportModal(false);
    if (importResult) fetchDevis(1);
  }, [importResult, fetchDevis]);

  const handleImportFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xls', 'xlsx'].includes(ext)) {
      setImportError('Format non supporté. Seuls les fichiers .xls et .xlsx sont acceptés.');
      return;
    }
    setImportFile(file);
    setImportError(null);
    setImportParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.upload<ApiResponse<ImportParseResult>>('/devis/import/parse', formData);
      setImportParsed(res.data);
      setImportStep(2);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Erreur lors du parsing du fichier');
    } finally {
      setImportParsing(false);
    }
  }, []);

  const handleImportExecute = useCallback(async () => {
    if (!importParsed) return;
    setImportExecuting(true);
    setImportError(null);
    try {
      const res = await api.post<ApiResponse<ImportResult>>('/devis/import/execute', {
        rows: importParsed.rows,
        options: { updateExisting: importOptUpdate, linkClients: importOptLinkClients },
      });
      setImportResult(res.data);
      setImportStep(4);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erreur lors de l'import");
    } finally {
      setImportExecuting(false);
    }
  }, [importParsed, importOptUpdate, importOptLinkClients]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImportFile(file);
  }, [handleImportFile]);

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
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            </span>
            Devis
            <span className="text-base font-normal text-gray-400">({pagination.total})</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500 ml-[52px]">Gérez vos devis et propositions commerciales</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openImportModal}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
            Importer XLS
          </button>
          <button
            onClick={() => router.push('/dashboard/devis/nouveau')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-700 hover:to-indigo-700 transition-all cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Nouveau devis
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Devis ce mois', value: stats.total_mois.count, sub: `${formatMontant(stats.total_mois.montant)} €`, color: 'from-blue-500 to-indigo-500', icon: (<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>) },
            { label: 'En attente', value: stats.en_attente.count, sub: `${formatMontant(stats.en_attente.montant)} €`, color: 'from-amber-500 to-orange-500', icon: (<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>) },
            { label: 'Acceptés ce mois', value: stats.acceptes_mois.count, sub: `${formatMontant(stats.acceptes_mois.montant)} €`, color: 'from-emerald-500 to-teal-500', icon: (<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>) },
            { label: 'Taux de conversion', value: `${stats.taux_conversion}%`, sub: 'Acceptés / Envoyés', color: 'from-indigo-500 to-violet-500', icon: (<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>) },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{stat.sub}</p>
                </div>
                <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-sm`}>{stat.icon}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
          <div className="flex-1 relative w-full lg:max-w-md">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            <input
              type="text"
              placeholder="Rechercher (numéro, objet, client, référence...)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-10 pr-4 text-sm placeholder-gray-400 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUT_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setStatutFilter(tab.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  statutFilter === tab.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Numéro</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Objet</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Montant TTC</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Validité</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={8} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
                    <p className="text-sm text-gray-400">Chargement des devis...</p>
                  </div>
                </td></tr>
              ) : devisList.length === 0 ? (
                <tr><td colSpan={8} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Aucun devis trouvé</p>
                      <p className="text-xs text-gray-400 mt-0.5">Créez votre premier devis</p>
                    </div>
                    <button onClick={() => router.push('/dashboard/devis/nouveau')} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition cursor-pointer">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      Créer un devis
                    </button>
                  </div>
                </td></tr>
              ) : devisList.map(devis => (
                <tr
                  key={devis.id}
                  onClick={() => router.push(`/dashboard/devis/${devis.id}`)}
                  className="group hover:bg-blue-50/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-bold text-blue-700 font-mono">{devis.numero_devis}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-gray-600">{formatDate(devis.date_creation)}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                      {(devis.client_nom && devis.client_nom.trim()) || '—'}
                    </p>
                    {devis.client_id != null && devis.numero_client ? (
                      <p className="text-[10px] text-emerald-600 font-medium mt-0.5">Fiche client · {devis.numero_client}</p>
                    ) : (devis.client_nom && devis.client_nom.trim()) ? (
                      <p className="text-[10px] text-gray-400 mt-0.5">Nom issu du fichier (sans fiche client)</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-sm text-gray-600 truncate max-w-[200px]">{devis.objet}</p>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm font-semibold text-gray-900">{formatMontant(devis.montant_ttc)} €</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-sm ${isExpired(devis) ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {formatDate(devis.date_validite)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge statut={devis.statut} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/dashboard/devis/${devis.id}`); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                        title="Voir"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                      </button>
                      {['BROUILLON', 'ENVOYE'].includes(devis.statut) && (
                        <button
                          onClick={e => { e.stopPropagation(); router.push(`/dashboard/devis/${devis.id}/modifier`); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition cursor-pointer"
                          title="Modifier"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); handleAction('pdf', devis); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                        title="PDF"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                      </button>
                      <div className="relative">
                        <button
                          onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === devis.id ? null : devis.id); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" /></svg>
                        </button>
                        {menuOpen === devis.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-gray-200 shadow-xl z-20 py-1">
                              <button onClick={e => { e.stopPropagation(); handleAction('dupliquer', devis); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">Dupliquer</button>
                              {devis.statut === 'ENVOYE' && (
                                <>
                                  <button onClick={e => { e.stopPropagation(); handleAction('accepter', devis); }} className="w-full text-left px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50 cursor-pointer">Marquer accepté</button>
                                  <button onClick={e => { e.stopPropagation(); handleAction('refuser', devis); }} className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50 cursor-pointer">Marquer refusé</button>
                                </>
                              )}
                              {devis.statut === 'ACCEPTE' && (
                                <button onClick={e => { e.stopPropagation(); handleAction('transformer', devis); }} className="w-full text-left px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 cursor-pointer">Transformer en facture</button>
                              )}
                              {['BROUILLON', 'REFUSE'].includes(devis.statut) && (
                                <>
                                  <div className="border-t border-gray-100 my-1" />
                                  <button onClick={e => { e.stopPropagation(); handleAction('supprimer', devis); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer">Supprimer</button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
            <p className="text-sm text-gray-500">
              Affichage de <span className="font-medium text-gray-700">{(pagination.page - 1) * pagination.limit + 1}</span> à{' '}
              <span className="font-medium text-gray-700">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> sur{' '}
              <span className="font-medium text-gray-700">{pagination.total}</span>
            </p>
            <div className="flex items-center gap-1">
              <button disabled={pagination.page <= 1} onClick={() => fetchDevis(pagination.page - 1)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              </button>
              {pageNumbers().map((p, i) =>
                typeof p === 'string' ? (
                  <span key={`e-${i}`} className="px-2 text-gray-400 text-sm">...</span>
                ) : (
                  <button key={p} onClick={() => fetchDevis(p)} className={`h-8 w-8 rounded-lg text-sm font-medium transition cursor-pointer ${p === pagination.page ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>{p}</button>
                )
              )}
              <button disabled={pagination.page >= pagination.totalPages} onClick={() => fetchDevis(pagination.page + 1)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL IMPORT XLS */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={closeImportModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Importer des devis</h2>
                <p className="text-xs text-gray-400 mt-0.5">Étape {importStep} / 4</p>
              </div>
              <button onClick={closeImportModal} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Steps indicator */}
            <div className="px-6 py-3 flex items-center gap-2">
              {[1, 2, 3, 4].map(s => (
                <div key={s} className="flex items-center gap-2 flex-1">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition ${
                    s === importStep ? 'bg-blue-600 text-white' :
                    s < importStep ? 'bg-emerald-500 text-white' :
                    'bg-gray-100 text-gray-400'
                  }`}>{s < importStep ? '✓' : s}</div>
                  <span className={`text-xs font-medium hidden sm:block ${s === importStep ? 'text-gray-900' : 'text-gray-400'}`}>
                    {s === 1 ? 'Upload' : s === 2 ? 'Aperçu' : s === 3 ? 'Options' : 'Résultat'}
                  </span>
                  {s < 4 && <div className={`flex-1 h-0.5 ${s < importStep ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
                </div>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {importError && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                  {importError}
                </div>
              )}

              {/* ÉTAPE 1 : Upload */}
              {importStep === 1 && (
                <div
                  className={`border-2 border-dashed rounded-xl p-12 text-center transition cursor-pointer ${
                    dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xls,.xlsx"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); }}
                  />
                  {importParsing ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
                      <p className="text-sm text-gray-500">Analyse du fichier en cours...</p>
                    </div>
                  ) : (
                    <>
                      <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                        <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                      </div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Glissez-déposez votre fichier ici</p>
                      <p className="text-xs text-gray-400">ou cliquez pour sélectionner — Formats : .xls, .xlsx</p>
                    </>
                  )}
                </div>
              )}

              {/* ÉTAPE 2 : Aperçu */}
              {importStep === 2 && importParsed && (
                <div>
                  <div className="mb-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
                    <p className="text-xs text-slate-700">
                      Les colonnes <strong>Nom du client</strong> et <strong>Objet</strong> affichées ici reprennent <strong>exactement les valeurs du fichier Excel</strong>.
                      Si le client n&apos;existe pas dans OptimaCRM, le devis sera quand même créé avec ce libellé ; une fiche client pourra être liée plus tard si vous activez la correspondance automatique à l&apos;étape suivante.
                    </p>
                  </div>
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">{importParsed.totalRows}</span> devis détectés dans <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{importParsed.fileName}</span>
                    </p>
                    <p className="text-xs text-gray-400">{importParsed.detectedColumns.length} colonnes mappées</p>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {importParsed.detectedColumns.map(col => (
                      <span key={col} className="text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">{col}</span>
                    ))}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-3 py-2 text-left font-bold text-gray-500 whitespace-nowrap">N° devis</th>
                          <th className="px-3 py-2 text-left font-bold text-gray-500 whitespace-nowrap">Date</th>
                          <th className="px-3 py-2 text-left font-bold text-gray-500 min-w-[140px]">Nom client (Excel)</th>
                          <th className="px-3 py-2 text-left font-bold text-gray-500 min-w-[120px]">Objet (Excel)</th>
                          <th className="px-3 py-2 text-left font-bold text-gray-500 whitespace-nowrap">Commercial</th>
                          <th className="px-3 py-2 text-right font-bold text-gray-500 whitespace-nowrap">Total HT</th>
                          <th className="px-3 py-2 text-right font-bold text-gray-500 whitespace-nowrap">TTC</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importParsed.preview.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono font-bold text-blue-700 whitespace-nowrap">{String(row.numero || '')}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{String(row.date_creation || '')}</td>
                            <td className="px-3 py-2 text-gray-900 align-top">
                              <span className="line-clamp-3 break-words">{String(row.nom_client_libre || '—')}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-700 align-top">
                              <span className="line-clamp-3 break-words">{String(row.objet || '—')}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{String(row.commercial || '—')}</td>
                            <td className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{String(row.total_ht ?? '0')}</td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{String(row.montant_ttc ?? '0')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importParsed.totalRows > 5 && (
                    <p className="text-xs text-gray-400 mt-2 text-center">Aperçu des 5 premières lignes sur {importParsed.totalRows}</p>
                  )}
                </div>
              )}

              {/* ÉTAPE 3 : Options */}
              {importStep === 3 && (
                <div className="space-y-5">
                  <p className="text-sm text-gray-600">Configurez les options d&apos;import avant de lancer le processus.</p>
                  <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition">
                    <input
                      type="checkbox"
                      checked={importOptUpdate}
                      onChange={e => setImportOptUpdate(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Mettre à jour les devis existants si doublon sur numéro</p>
                      <p className="text-xs text-gray-400 mt-0.5">Si un devis avec le même numéro existe, ses données seront mises à jour au lieu d&apos;être ignorées.</p>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition">
                    <input
                      type="checkbox"
                      checked={importOptLinkClients}
                      onChange={e => setImportOptLinkClients(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Lier automatiquement les clients par correspondance de nom</p>
                      <p className="text-xs text-gray-400 mt-0.5">Tente de faire correspondre le nom du client avec les clients existants dans la base.</p>
                    </div>
                  </label>
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
                    <p className="text-sm text-blue-800">
                      <span className="font-semibold">{importParsed?.totalRows || 0}</span> devis seront traités.
                    </p>
                  </div>
                </div>
              )}

              {/* ÉTAPE 4 : Résultat */}
              {importStep === 4 && importResult && (
                <div className="space-y-5">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                      <p className="text-2xl font-bold text-emerald-700">{importResult.imported}</p>
                      <p className="text-xs font-medium text-emerald-600 mt-1">Devis importés</p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-blue-50 border border-blue-200">
                      <p className="text-2xl font-bold text-blue-700">{importResult.updated}</p>
                      <p className="text-xs font-medium text-blue-600 mt-1">Devis mis à jour</p>
                    </div>
                    <div className="text-center p-4 rounded-xl bg-amber-50 border border-amber-200">
                      <p className="text-2xl font-bold text-amber-700">{importResult.errors.length}</p>
                      <p className="text-xs font-medium text-amber-600 mt-1">Erreurs</p>
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="rounded-xl border border-amber-200 overflow-hidden">
                      <div className="px-4 py-2 bg-amber-50 border-b border-amber-200">
                        <p className="text-xs font-semibold text-amber-700">Détail des erreurs</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {importResult.errors.map((err, i) => (
                          <div key={i} className="px-4 py-2 text-xs text-gray-600 border-b border-gray-100 last:border-0 flex items-start gap-2">
                            <span className="font-mono text-amber-600 shrink-0">Ligne {err.row}</span>
                            <span>{err.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <div>
                {importStep > 1 && importStep < 4 && (
                  <button
                    onClick={() => setImportStep((importStep - 1) as 1 | 2 | 3)}
                    className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    Retour
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {importStep === 4 ? (
                  <button
                    onClick={closeImportModal}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:from-blue-700 hover:to-indigo-700 transition-all cursor-pointer"
                  >
                    Fermer
                  </button>
                ) : importStep === 2 ? (
                  <button
                    onClick={() => setImportStep(3)}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:from-blue-700 hover:to-indigo-700 transition-all cursor-pointer"
                  >
                    Suivant
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                  </button>
                ) : importStep === 3 ? (
                  <button
                    onClick={handleImportExecute}
                    disabled={importExecuting}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {importExecuting ? (
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                    )}
                    Lancer l&apos;import
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
