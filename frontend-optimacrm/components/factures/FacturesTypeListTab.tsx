'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Facture, PaginatedResponse, ApiResponse, StatutFacture, EmailTemplate } from '@/lib/types';

const STATUT_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  'Brouillon': { label: 'Brouillon', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  'Validée': { label: 'Validée', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'Envoyée': { label: 'Envoyée', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'Annulée': { label: 'Annulée', bg: 'bg-gray-100', text: 'text-gray-400 line-through', dot: 'bg-gray-300' },
};

const STATUT_TABS: { label: string; value: StatutFacture | '' }[] = [
  { label: 'Toutes', value: '' },
  { label: 'Brouillons', value: 'Brouillon' },
  { label: 'Validées', value: 'Validée' },
  { label: 'Envoyées', value: 'Envoyée' },
  { label: 'Annulées', value: 'Annulée' },
];

function StatusBadge({ statut }: { statut: StatutFacture }) {
  const cfg = STATUT_CONFIG[statut] || STATUT_CONFIG['Brouillon'];
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

function formatPeriode(debut: string | null, fin: string | null) {
  if (!debut || !fin) return '—';
  const d = new Date(debut);
  const f = new Date(fin);
  return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} → ${f.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}

function fmt(v: number | string) {
  return parseFloat(String(v || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  typeContrat: string;
}

export default function FacturesTypeListTab({ typeContrat }: Props) {
  const router = useRouter();
  const [factures, setFactures] = useState<Facture[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutFacture | ''>('');
  const [loading, setLoading] = useState(true);
  const [searchDebounce, setSearchDebounce] = useState('');
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [allIdsSelected, setAllIdsSelected] = useState(false);
  const [bulkLoading, setBulkLoading] = useState<'valider' | 'telecharger' | 'envoyer' | 'supprimer' | null>(null);
  const [showEnvoiModal, setShowEnvoiModal] = useState(false);
  const [envoiSujet, setEnvoiSujet] = useState('');
  const [envoiCorps, setEnvoiCorps] = useState('');
  const [envoiTemplateLoading, setEnvoiTemplateLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchFactures = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10', type_contrat: typeContrat });
      if (statutFilter) params.set('statut', statutFilter);
      if (searchDebounce) params.set('search', searchDebounce);

      const res = await api.get<PaginatedResponse<Facture>>(`/factures?${params}`);
      setFactures(res.data);
      setPagination(res.pagination);
    } catch {
      setFactures([]);
    } finally {
      setLoading(false);
    }
  }, [typeContrat, statutFilter, searchDebounce]);

  useEffect(() => { fetchFactures(1); }, [fetchFactures]);
  useEffect(() => { setSelectedIds([]); setAllIdsSelected(false); }, [factures]);

  const handleAction = async (action: string, facture: Facture) => {
    setMenuOpen(null);
    try {
      if (action === 'pdf') {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
        const response = await fetch(`${apiUrl}/factures/${facture.id}/pdf`, { credentials: 'include' });
        if (!response.ok) throw new Error('Erreur génération PDF');
        const blob = await response.blob();
        window.open(URL.createObjectURL(blob), '_blank');
      } else if (action === 'valider') {
        await api.post(`/factures/${facture.id}/valider`, {});
        setToast({ message: 'Facture validée', type: 'success' });
        fetchFactures(pagination.page);
      } else if (action === 'envoyer') {
        await api.post(`/factures/${facture.id}/envoyer`, {});
        setToast({ message: 'Facture envoyée', type: 'success' });
        fetchFactures(pagination.page);
      } else if (action === 'annuler') {
        if (confirm('Annuler cette facture ?')) {
          await api.post(`/factures/${facture.id}/annuler`, {});
          setToast({ message: 'Facture annulée', type: 'success' });
          fetchFactures(pagination.page);
        }
      } else if (action === 'supprimer') {
        if (confirm('Supprimer cette facture ?')) {
          await api.delete(`/factures/${facture.id}`);
          setToast({ message: 'Facture supprimée', type: 'success' });
          fetchFactures(pagination.page);
        }
      }
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    }
  };

  // ── Sélection ──────────────────────────────────────────────────────────
  const allVisibleIds = factures.map(f => f.id);
  const allPageSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.includes(id));
  const someSelected = selectedIds.length > 0;

  const selectedFactures = factures.filter(f => selectedIds.includes(f.id));
  const selectedBrouillons = selectedFactures.filter(f => f.statut === 'Brouillon');
  const someAreBrouillon = allIdsSelected || selectedBrouillons.length > 0;
  const selectedEnvoyables = selectedFactures.filter(f => f.statut === 'Validée');
  const someAreValidee = allIdsSelected || selectedEnvoyables.length > 0;
  const selectedSansEmail = selectedEnvoyables.filter(f => !f.client_email);
  const selectedAvecEmail = selectedEnvoyables.filter(f => !!f.client_email);
  const selectedSupprimables = selectedFactures.filter(f => ['Brouillon', 'Annulée'].includes(f.statut));
  const someAreSupprimable = allIdsSelected || selectedSupprimables.length > 0;

  const toggleSelectAll = () => {
    if (allPageSelected) { setSelectedIds([]); setAllIdsSelected(false); }
    else { setSelectedIds(allVisibleIds); }
  };

  const selectAllFiltered = async () => {
    try {
      const params = new URLSearchParams({ type_contrat: typeContrat });
      if (statutFilter) params.set('statut', statutFilter);
      if (searchDebounce) params.set('search', searchDebounce);
      const res = await api.get<ApiResponse<number[]>>(`/factures/all-ids?${params}`);
      setSelectedIds(res.data);
      setAllIdsSelected(true);
    } catch { /* fallback silencieux */ }
  };

  const toggleSelect = (id: number) => {
    setAllIdsSelected(false);
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // ── Actions en lot ─────────────────────────────────────────────────────
  const handleBulkValidate = async () => {
    if (!someAreBrouillon) return;
    const nb = allIdsSelected ? selectedIds.length : selectedBrouillons.length;
    if (!confirm(`Valider ${nb} facture(s) brouillon ? Les factures avec un autre statut seront ignorées.`)) return;
    setBulkLoading('valider');
    try {
      const res = await api.post<ApiResponse<{ valides: number; erreurs: { id: number; message: string }[] }>>('/factures/valider-lot', { ids: selectedIds });
      const { valides, erreurs } = res.data;
      setToast({ message: erreurs.length > 0 ? `${valides} validée(s), ${erreurs.length} en erreur` : `${valides} facture(s) validée(s)`, type: erreurs.length > 0 ? 'error' : 'success' });
      setSelectedIds([]); fetchFactures(pagination.page);
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    } finally { setBulkLoading(null); }
  };

  const handleBulkDownload = async () => {
    setBulkLoading('telecharger');
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${apiUrl}/factures/telecharger-lot`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) { const e = await response.json().catch(() => null); throw new Error(e?.message || 'Erreur'); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      const disp = response.headers.get('Content-Disposition');
      a.download = disp?.match(/filename="(.+)"/)?.[1] || 'factures.zip';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setToast({ message: `${selectedIds.length} facture(s) téléchargée(s) en ZIP`, type: 'success' });
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    } finally { setBulkLoading(null); }
  };

  const handleBulkEmail = async () => {
    const idsToSend = selectedAvecEmail.map(f => f.id);
    if (idsToSend.length === 0 || !envoiSujet) return;
    setShowEnvoiModal(false);
    setBulkLoading('envoyer');
    try {
      const res = await api.post<ApiResponse<{ envoyees: number; erreurs: { numero: string; client: string; motif: string }[] }>>('/factures/envoyer-lot', {
        ids: idsToSend, sujet: envoiSujet, corps: envoiCorps,
      });
      const { envoyees, erreurs } = res.data;
      setToast({ message: erreurs.length > 0 ? `${envoyees} envoyée(s), ${erreurs.length} en erreur` : `${envoyees} facture(s) envoyée(s) par email`, type: erreurs.length > 0 ? 'error' : 'success' });
      setSelectedIds([]); fetchFactures(pagination.page);
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    } finally { setBulkLoading(null); }
  };

  const handleBulkDelete = async () => {
    if (!someAreSupprimable) return;
    const nb = allIdsSelected ? selectedIds.length : selectedSupprimables.length;
    if (!confirm(`Supprimer ${nb} facture(s) brouillon/annulée(s) ? Cette action est irréversible.`)) return;
    setBulkLoading('supprimer');
    try {
      const res = await api.post<ApiResponse<{ supprimees: number; erreurs: { id: number; message: string }[] }>>('/factures/supprimer-lot', { ids: selectedIds });
      const { supprimees, erreurs } = res.data;
      setToast({ message: erreurs.length > 0 ? `${supprimees} supprimée(s), ${erreurs.length} en erreur` : `${supprimees} facture(s) supprimée(s)`, type: erreurs.length > 0 ? 'error' : 'success' });
      setSelectedIds([]); setAllIdsSelected(false); fetchFactures(pagination.page);
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    } finally { setBulkLoading(null); }
  };

  const openEnvoiModal = async () => {
    setShowEnvoiModal(true);
    setEnvoiTemplateLoading(true);
    try {
      const firstWithEmail = selectedEnvoyables.find(f => f.client_email);
      if (firstWithEmail) {
        const res = await api.get<ApiResponse<EmailTemplate>>(`/factures/${firstWithEmail.id}/email-template`);
        setEnvoiSujet(res.data.sujet || ''); setEnvoiCorps(res.data.corps || '');
      } else {
        setEnvoiSujet(''); setEnvoiCorps('Bonjour,\n\nVeuillez trouver ci-joint votre facture.\n\nCordialement');
      }
    } catch {
      setEnvoiSujet(''); setEnvoiCorps('Bonjour,\n\nVeuillez trouver ci-joint votre facture.\n\nCordialement');
    } finally { setEnvoiTemplateLoading(false); }
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const pageNumbers = () => {
    const pages: (number | string)[] = [];
    const { page, totalPages } = pagination;
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
    else {
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
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
          <div className="flex-1 relative w-full lg:max-w-md">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            <input
              type="text"
              placeholder="Rechercher par n° facture, client..."
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

      {/* Barre d'actions groupées */}
      {someSelected && (
        <div className="sticky top-0 z-20 mb-4 bg-blue-50 border-2 border-blue-200 rounded-2xl shadow-sm overflow-hidden">
          {allPageSelected && !allIdsSelected && pagination.total > factures.length && (
            <div className="bg-blue-100/80 px-5 py-2 text-center text-sm text-blue-800 border-b border-blue-200">
              Les {factures.length} factures de cette page sont sélectionnées.{' '}
              <button onClick={selectAllFiltered} className="font-bold underline hover:text-blue-900 cursor-pointer">
                Sélectionner les {pagination.total} factures
              </button>
            </div>
          )}
          {allIdsSelected && (
            <div className="bg-blue-100/80 px-5 py-2 text-center text-sm text-blue-800 border-b border-blue-200">
              Les <strong>{selectedIds.length}</strong> factures sont sélectionnées.{' '}
              <button onClick={() => { setSelectedIds([]); setAllIdsSelected(false); }} className="font-bold underline hover:text-blue-900 cursor-pointer">
                Tout désélectionner
              </button>
            </div>
          )}
          <div className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-600 text-white text-sm font-bold">{selectedIds.length}</span>
              <span className="text-sm font-semibold text-blue-900">facture(s) sélectionnée(s)</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={handleBulkDownload} disabled={bulkLoading !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-white border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer">
                {bulkLoading === 'telecharger' ? <span className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" /> :
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>}
                Télécharger en PDF
              </button>
              <button onClick={handleBulkValidate} disabled={bulkLoading !== null || !someAreBrouillon}
                title={!someAreBrouillon ? 'Aucune facture Brouillon dans la sélection' : ''}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer">
                {bulkLoading === 'valider' ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> :
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
                Valider la sélection
              </button>
              <button onClick={openEnvoiModal} disabled={bulkLoading !== null || !someAreValidee}
                title={!someAreValidee ? 'Aucune facture Validée dans la sélection' : ''}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer">
                {bulkLoading === 'envoyer' ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> :
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>}
                Envoyer par email
              </button>
              <button onClick={handleBulkDelete} disabled={bulkLoading !== null || !someAreSupprimable}
                title={!someAreSupprimable ? 'Aucune facture Brouillon ou Annulée' : ''}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer">
                {bulkLoading === 'supprimer' ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> :
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>}
                Supprimer
              </button>
              <button onClick={() => { setSelectedIds([]); setAllIdsSelected(false); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                Désélectionner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Résumé */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{pagination.total} facture(s) {typeContrat.toLowerCase()}</p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="px-3 py-3.5 w-10">
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll}
                    className="h-4 w-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer" />
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">N° Facture</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Contrat</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Période</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Total HT</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Total TTC</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={10} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
                    <p className="text-sm text-gray-400">Chargement...</p>
                  </div>
                </td></tr>
              ) : factures.length === 0 ? (
                <tr><td colSpan={10} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                    </div>
                    <p className="text-sm font-medium text-gray-500">Aucune facture {typeContrat.toLowerCase()} trouvée</p>
                  </div>
                </td></tr>
              ) : factures.map(facture => (
                <tr
                  key={facture.id}
                  onClick={() => router.push(`/dashboard/factures/${facture.id}`)}
                  className={`group hover:bg-blue-50/40 cursor-pointer transition-colors ${selectedIds.includes(facture.id) ? 'bg-blue-50/60' : ''}`}
                >
                  <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.includes(facture.id)} onChange={() => toggleSelect(facture.id)}
                      className="h-4 w-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-bold text-blue-700 font-mono">{facture.numero_facture}</span>
                    {facture.est_avoir && <span className="ml-1.5 text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">AVOIR</span>}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-600">{formatDate(facture.date_creation)}</td>
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-[160px]">{facture.client_nom || facture.client_raison_sociale || ''}</p>
                    <p className="text-[11px] text-gray-400">{facture.code_client}</p>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-500">{facture.numero_contrat || '—'}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-500">{formatPeriode(facture.periode_debut, facture.periode_fin)}</td>
                  <td className="px-4 py-3.5 text-right text-sm text-gray-600">{fmt(facture.total_ht)} €</td>
                  <td className="px-4 py-3.5 text-right text-sm font-semibold text-gray-900">{fmt(facture.total_ttc)} €</td>
                  <td className="px-4 py-3.5"><StatusBadge statut={facture.statut} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={e => { e.stopPropagation(); router.push(`/dashboard/factures/${facture.id}`); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer" title="Voir">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleAction('pdf', facture); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer" title="PDF">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                      </button>
                      <div className="relative">
                        <button onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === facture.id ? null : facture.id); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" /></svg>
                        </button>
                        {menuOpen === facture.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-gray-200 shadow-xl z-20 py-1">
                              {facture.statut === 'Brouillon' && (
                                <button onClick={e => { e.stopPropagation(); handleAction('valider', facture); }} className="w-full text-left px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 cursor-pointer">Valider</button>
                              )}
                              {facture.statut === 'Validée' && (
                                <button onClick={e => { e.stopPropagation(); handleAction('envoyer', facture); }} className="w-full text-left px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 cursor-pointer">Envoyer</button>
                              )}
                              {facture.statut !== 'Annulée' && (
                                <><div className="border-t border-gray-100 my-1" />
                                <button onClick={e => { e.stopPropagation(); handleAction('annuler', facture); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer">Annuler</button></>
                              )}
                              {['Brouillon', 'Annulée'].includes(facture.statut) && (
                                <button onClick={e => { e.stopPropagation(); handleAction('supprimer', facture); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer">Supprimer</button>
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
              <button disabled={pagination.page <= 1} onClick={() => fetchFactures(pagination.page - 1)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              </button>
              {pageNumbers().map((p, i) =>
                typeof p === 'string' ? (
                  <span key={`e-${i}`} className="px-2 text-gray-400 text-sm">...</span>
                ) : (
                  <button key={p} onClick={() => fetchFactures(p)} className={`h-8 w-8 rounded-lg text-sm font-medium transition cursor-pointer ${p === pagination.page ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>{p}</button>
                )
              )}
              <button disabled={pagination.page >= pagination.totalPages} onClick={() => fetchFactures(pagination.page + 1)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modale envoi groupé par email */}
      {showEnvoiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowEnvoiModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Envoi groupé par email</h2>
                  <p className="text-xs text-gray-400">{selectedAvecEmail.length} facture(s) — PDF joint automatiquement</p>
                </div>
              </div>
              <button onClick={() => setShowEnvoiModal(false)} className="text-gray-400 hover:text-gray-600 transition cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {envoiTemplateLoading ? (
              <div className="p-10 flex justify-center"><div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" /></div>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {selectedSansEmail.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
                    <p className="text-sm font-semibold text-red-800">{selectedSansEmail.length} facture(s) sans email client — seront ignorée(s)</p>
                    <div className="mt-2 space-y-0.5">
                      {selectedSansEmail.map(f => <p key={f.id} className="text-xs text-red-700">{f.numero_facture} — {f.client_raison_sociale || 'Client'}</p>)}
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Objet de l&apos;email</label>
                  <input value={envoiSujet} onChange={e => setEnvoiSujet(e.target.value)} placeholder="Objet du mail..."
                    className="w-full rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-blue-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition" />
                  <p className="mt-1.5 text-[11px] text-gray-400">Variables : {"{{numero}}"}, {"{{client}}"}, {"{{montant_ttc}}"}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Message</label>
                  <textarea value={envoiCorps} onChange={e => setEnvoiCorps(e.target.value)} rows={6} placeholder="Rédigez votre message..."
                    className="w-full rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-blue-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition resize-y" />
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{selectedAvecEmail.length} PDF joint(s) automatiquement</p>
                    <p className="text-xs text-gray-400">Chaque facture envoyée avec son PDF</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Destinataires ({selectedAvecEmail.length})</label>
                  <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0">
                        <tr className="bg-gray-50/80">
                          <th className="px-4 py-2 text-left text-[11px] font-bold text-gray-500 uppercase">Facture</th>
                          <th className="px-4 py-2 text-left text-[11px] font-bold text-gray-500 uppercase">Client</th>
                          <th className="px-4 py-2 text-left text-[11px] font-bold text-gray-500 uppercase">Email</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {selectedEnvoyables.map(f => (
                          <tr key={f.id} className={!f.client_email ? 'bg-red-50/50' : ''}>
                            <td className="px-4 py-2 font-mono font-semibold text-gray-900 text-xs">{f.numero_facture}</td>
                            <td className="px-4 py-2 text-gray-700 text-xs">{f.client_raison_sociale || '—'}</td>
                            <td className="px-4 py-2 text-xs">{f.client_email ? <span className="text-gray-600">{f.client_email}</span> : <span className="text-red-600 font-medium">Aucun email</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
              <button onClick={() => setShowEnvoiModal(false)}
                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
              <button onClick={handleBulkEmail} disabled={selectedAvecEmail.length === 0 || !envoiSujet || envoiTemplateLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                Envoyer {selectedAvecEmail.length} facture(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 shadow-xl text-sm font-semibold transition-all ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
          )}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 p-0.5 rounded hover:bg-white/20 transition cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
