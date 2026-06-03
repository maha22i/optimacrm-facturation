'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Facture, FactureStats, ContratAFacturer, PaginatedResponse, ApiResponse, StatutFacture, TypeOrigineFacture, GenerationLotResult, ImportReleve, EmailTemplate } from '@/lib/types';

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

const ORIGINE_OPTIONS: { label: string; value: TypeOrigineFacture | '' }[] = [
  { label: 'Toutes origines', value: '' },
  { label: 'Manuelle', value: 'Manuelle' },
  { label: 'Contrat', value: 'Contrat' },
  { label: 'Devis', value: 'Devis' },
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

export default function FacturesListPage() {
  const router = useRouter();
  const [factures, setFactures] = useState<Facture[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<FactureStats | null>(null);
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutFacture | ''>('');
  const [origineFilter, setOrigineFilter] = useState<TypeOrigineFacture | ''>('');
  const [loading, setLoading] = useState(true);
  const [searchDebounce, setSearchDebounce] = useState('');
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [showLotModal, setShowLotModal] = useState(false);
  const [contratsAFacturer, setContratsAFacturer] = useState<ContratAFacturer[]>([]);
  const [lotSelection, setLotSelection] = useState<number[]>([]);
  const [lotLoading, setLotLoading] = useState(false);
  const [lotResult, setLotResult] = useState<GenerationLotResult | null>(null);
  const [lotPeriodeDebut, setLotPeriodeDebut] = useState('');
  const [lotPeriodeFin, setLotPeriodeFin] = useState('');
  const [lotTypeFilter, setLotTypeFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'factures' | 'imports'>('factures');
  const [recentImports, setRecentImports] = useState<ImportReleve[]>([]);
  const [importsLoading, setImportsLoading] = useState(false);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkLoading, setBulkLoading] = useState<'valider' | 'telecharger' | 'envoyer' | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showEnvoiModal, setShowEnvoiModal] = useState(false);
  const [envoiSujet, setEnvoiSujet] = useState('');
  const [envoiCorps, setEnvoiCorps] = useState('');
  const [envoiTemplateLoading, setEnvoiTemplateLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadStats = useCallback(() => {
    api.get<ApiResponse<FactureStats>>('/factures/stats').then(r => setStats(r.data)).catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const fetchFactures = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (statutFilter) params.set('statut', statutFilter);
      if (origineFilter) params.set('type_origine', origineFilter);
      if (searchDebounce) params.set('search', searchDebounce);

      const res = await api.get<PaginatedResponse<Facture>>(`/factures?${params}`);
      setFactures(res.data);
      setPagination(res.pagination);
    } catch {
      setFactures([]);
    } finally {
      setLoading(false);
    }
  }, [statutFilter, origineFilter, searchDebounce]);

  useEffect(() => { fetchFactures(1); }, [fetchFactures]);

  const handleAction = async (action: string, facture: Facture) => {
    setMenuOpen(null);
    try {
      if (action === 'pdf') {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
        const response = await fetch(`${apiUrl}/factures/${facture.id}/pdf`, {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Erreur génération PDF');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } else if (action === 'dupliquer') {
        const res = await api.post<ApiResponse<{ id: number }>>(`/factures/${facture.id}/dupliquer`, {});
        router.push(`/dashboard/factures/${res.data.id}/modifier`);
      } else if (action === 'valider') {
        await api.post(`/factures/${facture.id}/valider`, {});
        fetchFactures(pagination.page);
        loadStats();
      } else if (action === 'envoyer') {
        await api.post(`/factures/${facture.id}/envoyer`, {});
        fetchFactures(pagination.page);
        loadStats();
      } else if (action === 'annuler') {
        if (confirm('Annuler cette facture ?')) {
          await api.post(`/factures/${facture.id}/annuler`, {});
          fetchFactures(pagination.page);
          loadStats();
        }
      } else if (action === 'supprimer') {
        if (confirm('Supprimer cette facture ?')) {
          await api.delete(`/factures/${facture.id}`);
          fetchFactures(pagination.page);
          loadStats();
        }
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const getDefaultPeriode = () => {
    const now = new Date();
    const debut = new Date(now.getFullYear(), now.getMonth(), 1);
    const fin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { debut: debut.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) };
  };

  const openLotModal = async () => {
    try {
      const res = await api.get<ApiResponse<ContratAFacturer[]>>('/factures/contrats-a-facturer');
      setContratsAFacturer(res.data);
      setLotSelection([]);
      setLotResult(null);
      setLotTypeFilter('');
      const p = getDefaultPeriode();
      setLotPeriodeDebut(p.debut);
      setLotPeriodeFin(p.fin);
      setShowLotModal(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur lors du chargement des contrats');
    }
  };

  const setQuickPeriod = (type: 'mois_precedent' | 'trimestre' | 'trimestre_precedent') => {
    const now = new Date();
    let debut: Date, fin: Date;
    if (type === 'mois_precedent') {
      debut = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      fin = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (type === 'trimestre') {
      const q = Math.floor(now.getMonth() / 3);
      debut = new Date(now.getFullYear(), q * 3, 1);
      fin = new Date(now.getFullYear(), q * 3 + 3, 0);
    } else {
      const q = Math.floor(now.getMonth() / 3);
      const prevQ = q === 0 ? 3 : q - 1;
      const year = q === 0 ? now.getFullYear() - 1 : now.getFullYear();
      debut = new Date(year, prevQ * 3, 1);
      fin = new Date(year, prevQ * 3 + 3, 0);
    }
    setLotPeriodeDebut(debut.toISOString().slice(0, 10));
    setLotPeriodeFin(fin.toISOString().slice(0, 10));
  };

  const filteredContrats = contratsAFacturer.filter(c => !lotTypeFilter || c.type_contrat === lotTypeFilter);

  const executerLot = async () => {
    if (lotSelection.length === 0 || !lotPeriodeDebut || !lotPeriodeFin) return;
    setLotLoading(true);
    try {
      const res = await api.post<ApiResponse<GenerationLotResult>>('/factures/generer-lot', {
        contrat_ids: lotSelection,
        periode_debut: lotPeriodeDebut,
        periode_fin: lotPeriodeFin,
      });
      setLotResult(res.data);
      fetchFactures(1);
      loadStats();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLotLoading(false);
    }
  };

  const loadRecentImports = useCallback(async () => {
    setImportsLoading(true);
    try {
      const res = await api.get<ApiResponse<{ imports: ImportReleve[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>>('/imports-releves?limit=10&page=1');
      setRecentImports(res.data?.imports || []);
    } catch {
      setRecentImports([]);
    } finally {
      setImportsLoading(false);
    }
  }, []);

  useEffect(() => { setSelectedIds([]); }, [factures]);

  const allVisibleIds = factures.map(f => f.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.includes(id));
  const someSelected = selectedIds.length > 0;
  const allSelectedAreBrouillon = someSelected && selectedIds.every(id => {
    const f = factures.find(fac => fac.id === id);
    return f?.statut === 'Brouillon';
  });
  const allSelectedAreValidee = someSelected && selectedIds.every(id => {
    const f = factures.find(fac => fac.id === id);
    return f?.statut === 'Validée';
  });
  const selectedFactures = factures.filter(f => selectedIds.includes(f.id));
  const selectedEnvoyables = selectedFactures.filter(f => f.statut === 'Validée');
  const selectedSansEmail = selectedEnvoyables.filter(f => !f.client_email);
  const selectedAvecEmail = selectedEnvoyables.filter(f => !!f.client_email);
  const selectedNonEnvoyables = selectedFactures.filter(f => f.statut !== 'Validée');

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allVisibleIds);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleBulkValidate = async () => {
    if (!allSelectedAreBrouillon) return;
    if (!confirm(`Valider ${selectedIds.length} facture(s) brouillon ?`)) return;
    setBulkLoading('valider');
    try {
      const res = await api.post<ApiResponse<{ valides: number; erreurs: { id: number; message: string }[] }>>('/factures/valider-lot', { ids: selectedIds });
      const { valides, erreurs } = res.data;
      const msg = erreurs.length > 0
        ? `${valides} validée(s), ${erreurs.length} en erreur`
        : `${valides} facture(s) validée(s) avec succès`;
      setToast({ message: msg, type: erreurs.length > 0 ? 'error' : 'success' });
      setSelectedIds([]);
      fetchFactures(pagination.page);
      loadStats();
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors de la validation', type: 'error' });
    } finally {
      setBulkLoading(null);
    }
  };

  const handleBulkDownload = async () => {
    setBulkLoading('telecharger');
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${apiUrl}/factures/telecharger-lot`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || 'Erreur lors du téléchargement');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = response.headers.get('Content-Disposition');
      a.download = disposition?.match(/filename="(.+)"/)?.[1] || 'factures.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setToast({ message: `${selectedIds.length} facture(s) téléchargée(s) en ZIP`, type: 'success' });
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors du téléchargement', type: 'error' });
    } finally {
      setBulkLoading(null);
    }
  };

  const handleBulkEmail = async () => {
    const idsToSend = selectedAvecEmail.map(f => f.id);
    if (idsToSend.length === 0 || !envoiSujet) return;
    setShowEnvoiModal(false);
    setBulkLoading('envoyer');
    try {
      const res = await api.post<ApiResponse<{ envoyees: number; erreurs: { numero: string; client: string; motif: string }[] }>>('/factures/envoyer-lot', {
        ids: idsToSend,
        sujet: envoiSujet,
        corps: envoiCorps,
      });
      const { envoyees, erreurs } = res.data;
      const msg = erreurs.length > 0
        ? `${envoyees} envoyée(s), ${erreurs.length} en erreur`
        : `${envoyees} facture(s) envoyée(s) par email avec succès`;
      setToast({ message: msg, type: erreurs.length > 0 ? 'error' : 'success' });
      setSelectedIds([]);
      fetchFactures(pagination.page);
      loadStats();
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors de l\'envoi', type: 'error' });
    } finally {
      setBulkLoading(null);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

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
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            </span>
            Factures
            <span className="text-base font-normal text-gray-400">({pagination.total} au total)</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500 ml-[52px]">Gestion de vos factures</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openLotModal}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-orange-300 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-700 hover:bg-orange-100 transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" /></svg>
            Générer par période
          </button>
          <button
            onClick={() => router.push('/dashboard/factures/nouveau')}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:from-violet-700 hover:to-purple-700 transition-all cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Nouvelle facture
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'CA Total', value: `${fmt(stats.ca_mois.montant)} €`, sub: `${stats.ca_mois.count} facture(s)`, color: 'from-emerald-500 to-teal-500', icon: (<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 7.756a4.5 4.5 0 1 0 0 8.488M7.5 10.5h5.25m-5.25 3h5.25M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>) },
            { label: 'En attente', value: `${fmt(stats.en_attente.montant)} €`, sub: `${stats.en_attente.count} facture(s)`, color: 'from-blue-500 to-indigo-500', icon: (<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>) },
            { label: 'Envoyées', value: `${fmt(stats.envoyees_mois.montant)} €`, sub: `${stats.envoyees_mois.count} facture(s)`, color: 'from-violet-500 to-purple-500', icon: (<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>) },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{stat.label}</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{stat.sub}</p>
                </div>
                <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-sm`}>{stat.icon}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs: Factures / Relevés */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setActiveTab('factures')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${activeTab === 'factures' ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          Factures
        </button>
        <button
          onClick={() => { setActiveTab('imports'); loadRecentImports(); }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${activeTab === 'imports' ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          Imports récents
        </button>
      </div>

      {activeTab === 'factures' && (<>
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
              className="w-full rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-10 pr-4 text-sm placeholder-gray-400 focus:bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none transition"
            />
          </div>
          <select
            value={origineFilter}
            onChange={e => setOrigineFilter(e.target.value as TypeOrigineFacture | '')}
            className="rounded-xl bg-gray-50 border border-gray-200 py-2.5 px-4 text-sm text-gray-600 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none transition cursor-pointer"
          >
            {ORIGINE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="flex flex-wrap gap-1">
            {STATUT_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setStatutFilter(tab.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  statutFilter === tab.value
                    ? 'bg-violet-600 text-white shadow-sm'
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
        <div className="sticky top-0 z-20 mb-4 bg-violet-50 border-2 border-violet-200 rounded-2xl px-5 py-3 flex items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-violet-600 text-white text-sm font-bold">{selectedIds.length}</span>
            <span className="text-sm font-semibold text-violet-900">facture(s) sélectionnée(s)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkDownload}
              disabled={bulkLoading !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-white border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {bulkLoading === 'telecharger' ? (
                <span className="animate-spin h-4 w-4 border-2 border-violet-600 border-t-transparent rounded-full" />
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              )}
              Télécharger en PDF
            </button>
            <button
              onClick={handleBulkValidate}
              disabled={bulkLoading !== null || !allSelectedAreBrouillon}
              title={!allSelectedAreBrouillon ? 'Seules les factures Brouillon peuvent être validées' : ''}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {bulkLoading === 'valider' ? (
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
              )}
              Valider la sélection
            </button>
            <button
              onClick={async () => {
                setShowEnvoiModal(true);
                setEnvoiTemplateLoading(true);
                try {
                  const firstWithEmail = selectedEnvoyables.find(f => f.client_email);
                  if (firstWithEmail) {
                    const res = await api.get<ApiResponse<EmailTemplate>>(`/factures/${firstWithEmail.id}/email-template`);
                    setEnvoiSujet(res.data.sujet || '');
                    setEnvoiCorps(res.data.corps || '');
                  } else {
                    setEnvoiSujet('');
                    setEnvoiCorps('Bonjour,\n\nVeuillez trouver ci-joint votre facture.\n\nCordialement');
                  }
                } catch {
                  setEnvoiSujet('');
                  setEnvoiCorps('Bonjour,\n\nVeuillez trouver ci-joint votre facture.\n\nCordialement');
                } finally {
                  setEnvoiTemplateLoading(false);
                }
              }}
              disabled={bulkLoading !== null || !allSelectedAreValidee}
              title={!allSelectedAreValidee ? 'Seules les factures au statut Validée peuvent être envoyées par email' : ''}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {bulkLoading === 'envoyer' ? (
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
              )}
              Envoyer par email
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              Désélectionner
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="px-3 py-3.5 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded text-violet-600 border-gray-300 focus:ring-violet-500 cursor-pointer"
                  />
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
                    <div className="animate-spin h-8 w-8 border-[3px] border-violet-600 border-t-transparent rounded-full" />
                    <p className="text-sm text-gray-400">Chargement des factures...</p>
                  </div>
                </td></tr>
              ) : factures.length === 0 ? (
                <tr><td colSpan={10} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Aucune facture trouvée</p>
                      <p className="text-xs text-gray-400 mt-0.5">Créez votre première facture</p>
                    </div>
                    <button onClick={() => router.push('/dashboard/factures/nouveau')} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 transition cursor-pointer">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      Créer une facture
                    </button>
                  </div>
                </td></tr>
              ) : factures.map(facture => (
                <tr
                  key={facture.id}
                  onClick={() => router.push(`/dashboard/factures/${facture.id}`)}
                  className={`group hover:bg-violet-50/40 cursor-pointer transition-colors ${selectedIds.includes(facture.id) ? 'bg-violet-50/60' : ''}`}
                >
                  <td className="px-3 py-3.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(facture.id)}
                      onChange={() => toggleSelect(facture.id)}
                      className="h-4 w-4 rounded text-violet-600 border-gray-300 focus:ring-violet-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-bold text-violet-700 font-mono">{facture.numero_facture}</span>
                    {facture.est_avoir && <span className="ml-1.5 text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">AVOIR</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-gray-600">{formatDate(facture.date_creation)}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-[160px]">{facture.client_nom || facture.client_raison_sociale || ''}</p>
                    <p className="text-[11px] text-gray-400">{facture.code_client}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-gray-500">{facture.numero_contrat || '—'}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-gray-500">{formatPeriode(facture.periode_debut, facture.periode_fin)}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm text-gray-600">{fmt(facture.total_ht)} €</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm font-semibold text-gray-900">{fmt(facture.total_ttc)} €</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge statut={facture.statut} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/dashboard/factures/${facture.id}`); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition cursor-pointer" title="Voir"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleAction('pdf', facture); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition cursor-pointer" title="PDF"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                      </button>
                      <div className="relative">
                        <button
                          onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === facture.id ? null : facture.id); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM12.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0ZM18.75 12a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" /></svg>
                        </button>
                        {menuOpen === facture.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-gray-200 shadow-xl z-20 py-1">
                              {facture.statut === 'Brouillon' && (
                                <button onClick={e => { e.stopPropagation(); handleAction('valider', facture); }} className="w-full text-left px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 cursor-pointer">Valider</button>
                              )}
                              {facture.statut === 'Validée' && (
                                <button onClick={e => { e.stopPropagation(); handleAction('envoyer', facture); }} className="w-full text-left px-4 py-2 text-sm text-violet-700 hover:bg-violet-50 cursor-pointer">Envoyer</button>
                              )}
                              <button onClick={e => { e.stopPropagation(); handleAction('dupliquer', facture); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">Dupliquer</button>
                              {facture.statut !== 'Annulée' && (
                                <>
                                  <div className="border-t border-gray-100 my-1" />
                                  <button onClick={e => { e.stopPropagation(); handleAction('annuler', facture); }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer">Annuler</button>
                                </>
                              )}
                              {facture.statut === 'Annulée' && (
                                <>
                                  <div className="border-t border-gray-100 my-1" />
                                  <button onClick={e => { e.stopPropagation(); router.push(`/dashboard/factures/${facture.id}/modifier`); setMenuOpen(null); }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">Modifier</button>
                                </>
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
                  <button key={p} onClick={() => fetchFactures(p)} className={`h-8 w-8 rounded-lg text-sm font-medium transition cursor-pointer ${p === pagination.page ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>{p}</button>
                )
              )}
              <button disabled={pagination.page >= pagination.totalPages} onClick={() => fetchFactures(pagination.page + 1)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      </>)}

      {/* Tab: Imports récents */}
      {activeTab === 'imports' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Derniers imports de relevés compteurs</p>
            <button onClick={() => router.push('/dashboard/parc-machines/imports')} className="text-sm font-medium text-violet-600 hover:text-violet-700 cursor-pointer">
              Voir tout l&apos;historique des imports →
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">N° Batch</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Date import</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Fichier</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Relevés</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Factures</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Montant HT</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Statut</th>
                    <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {importsLoading ? (
                    <tr><td colSpan={8} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="animate-spin h-8 w-8 border-[3px] border-violet-600 border-t-transparent rounded-full" />
                        <p className="text-sm text-gray-400">Chargement des imports...</p>
                      </div>
                    </td></tr>
                  ) : recentImports.length === 0 ? (
                    <tr><td colSpan={8} className="py-20 text-center">
                      <p className="text-sm text-gray-500">Aucun import de relevés</p>
                    </td></tr>
                  ) : recentImports.map(imp => (
                    <tr key={imp.id} className={`hover:bg-violet-50/40 transition-colors cursor-pointer ${imp.statut === 'Annule' ? 'opacity-50' : ''}`}
                        onClick={() => router.push(`/dashboard/parc-machines/imports/${imp.id}`)}>
                      <td className="px-4 py-3.5">
                        <span className="text-sm font-mono font-semibold text-gray-900">{imp.numero_batch}</span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600">{formatDate(imp.date_import)}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-gray-700 max-w-[200px] truncate block">{imp.nom_fichier}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right text-sm font-medium text-gray-900">{imp.nb_releves_crees}</td>
                      <td className="px-4 py-3.5 text-right text-sm font-medium text-gray-900">{imp.nb_factures ?? '—'}</td>
                      <td className="px-4 py-3.5 text-right text-sm font-medium text-gray-900">
                        {imp.montant_total_ht != null ? fmt(imp.montant_total_ht) + ' €' : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          imp.statut === 'Actif' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${imp.statut === 'Actif' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          {imp.statut === 'Actif' ? 'Actif' : 'Annulé'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/parc-machines/imports/${imp.id}`); }}
                          className="text-xs text-violet-600 hover:text-violet-700 font-medium cursor-pointer">
                          Voir détail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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
                  <p className="text-xs text-gray-400">{selectedAvecEmail.length} facture(s) — Le PDF de chaque facture sera joint automatiquement</p>
                </div>
              </div>
              <button onClick={() => setShowEnvoiModal(false)} className="text-gray-400 hover:text-gray-600 transition cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {envoiTemplateLoading ? (
              <div className="p-10 flex justify-center">
                <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {selectedSansEmail.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3.5">
                    <p className="text-sm font-semibold text-red-800">
                      {selectedSansEmail.length} facture(s) sans email client — seront ignorée(s)
                    </p>
                    <div className="mt-2 space-y-0.5">
                      {selectedSansEmail.map(f => (
                        <p key={f.id} className="text-xs text-red-700">
                          {f.numero_facture} — {f.client_raison_sociale || 'Client'}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Objet de l&apos;email</label>
                  <input
                    value={envoiSujet}
                    onChange={e => setEnvoiSujet(e.target.value)}
                    placeholder="Objet du mail..."
                    className="w-full rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-blue-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition"
                  />
                  <p className="mt-1.5 text-[11px] text-gray-400">
                    L&apos;objet sera identique pour toutes les factures. Variables disponibles : {"{{numero}}"}, {"{{client}}"}, {"{{montant_ttc}}"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Message</label>
                  <textarea
                    value={envoiCorps}
                    onChange={e => setEnvoiCorps(e.target.value)}
                    rows={6}
                    placeholder="Rédigez votre message..."
                    className="w-full rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-blue-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition resize-y"
                  />
                </div>

                <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                    <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">{selectedAvecEmail.length} PDF joint(s) automatiquement</p>
                    <p className="text-xs text-gray-400">Chaque facture sera envoyée avec son propre PDF en pièce jointe</p>
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
                            <td className="px-4 py-2 text-xs">
                              {f.client_email ? (
                                <span className="text-gray-600">{f.client_email}</span>
                              ) : (
                                <span className="text-red-600 font-medium">Aucun email</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
              <button
                onClick={() => setShowEnvoiModal(false)}
                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleBulkEmail}
                disabled={selectedAvecEmail.length === 0 || !envoiSujet || envoiTemplateLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                Envoyer {selectedAvecEmail.length} facture(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 shadow-xl text-sm font-semibold transition-all ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? (
            <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          ) : (
            <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
          )}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 p-0.5 rounded hover:bg-white/20 transition cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Modale Génération en lot */}
      {showLotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowLotModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Générer des factures depuis les contrats</h2>
              <button onClick={() => setShowLotModal(false)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {lotResult ? (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{lotResult.generees.length} facture(s) générée(s)</p>
                      {lotResult.erreurs.length > 0 && <p className="text-sm text-red-600">{lotResult.erreurs.length} erreur(s)</p>}
                    </div>
                  </div>

                  {lotResult.generees.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-2">Factures générées</h3>
                      <div className="space-y-2">
                        {lotResult.generees.map((g, i) => (
                          <div key={i} className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg cursor-pointer hover:bg-emerald-100 transition" onClick={() => { setShowLotModal(false); router.push(`/dashboard/factures/${g.facture_id}`); }}>
                            <div>
                              <span className="font-mono font-semibold text-emerald-700">{g.numero_facture}</span>
                              <span className="ml-2 text-sm text-gray-600">{g.client}</span>
                            </div>
                            <span className="font-semibold text-gray-900">{fmt(g.total_ttc)} €</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {lotResult.erreurs.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-red-700 mb-2">Erreurs</h3>
                      <div className="space-y-2">
                        {lotResult.erreurs.map((e, i) => (
                          <div key={i} className="p-3 bg-red-50 rounded-lg text-sm text-red-700">
                            Contrat #{e.contrat_id} : {e.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {/* Sélection de période */}
                  <div className="bg-gray-50 rounded-xl p-4 mb-4">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Période de facturation</p>
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Période du</label>
                        <input type="date" value={lotPeriodeDebut} onChange={e => setLotPeriodeDebut(e.target.value)}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">au</label>
                        <input type="date" value={lotPeriodeFin} onChange={e => setLotPeriodeFin(e.target.value)}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => setQuickPeriod('trimestre')} className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-white hover:border-violet-300 transition cursor-pointer">Ce trimestre</button>
                        <button onClick={() => setQuickPeriod('mois_precedent')} className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-white hover:border-violet-300 transition cursor-pointer">Mois précédent</button>
                        <button onClick={() => setQuickPeriod('trimestre_precedent')} className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-white hover:border-violet-300 transition cursor-pointer">Trimestre précédent</button>
                      </div>
                    </div>
                  </div>

                  {/* Filtre type + Tout sélectionner */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-600">{filteredContrats.length} contrat(s) actif(s)</p>
                      <select value={lotTypeFilter} onChange={e => { setLotTypeFilter(e.target.value); setLotSelection([]); }}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 focus:border-violet-400 outline-none cursor-pointer">
                        <option value="">Tous les types</option>
                        <option value="Copieur">Copieur</option>
                        <option value="Telephonie">Téléphonie</option>
                        <option value="Informatique">Informatique</option>
                        <option value="Securite">Sécurité</option>
                      </select>
                    </div>
                    <button
                      onClick={() => setLotSelection(lotSelection.length === filteredContrats.length ? [] : filteredContrats.map(c => c.id))}
                      className="text-sm text-violet-600 hover:text-violet-700 font-medium cursor-pointer"
                    >
                      {lotSelection.length === filteredContrats.length && filteredContrats.length > 0 ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>
                  </div>

                  {filteredContrats.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500">Aucun contrat actif</p>
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50/80">
                            <th className="px-3 py-2 text-left w-8">
                              <input type="checkbox"
                                checked={lotSelection.length === filteredContrats.length && filteredContrats.length > 0}
                                onChange={() => setLotSelection(lotSelection.length === filteredContrats.length ? [] : filteredContrats.map(c => c.id))}
                                className="h-4 w-4 rounded text-violet-600 border-gray-300 focus:ring-violet-500 cursor-pointer" />
                            </th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-500 uppercase">N° Contrat</th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-500 uppercase">Client</th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-500 uppercase">Type</th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-500 uppercase">Périodicité</th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-500 uppercase">Dernière facture</th>
                            <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-500 uppercase">Prochaine</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {filteredContrats.map(c => (
                            <tr key={c.id} className={`transition ${lotSelection.includes(c.id) ? 'bg-violet-50/50' : 'hover:bg-gray-50'}`}>
                              <td className="px-3 py-2.5">
                                <input type="checkbox"
                                  checked={lotSelection.includes(c.id)}
                                  onChange={() => setLotSelection(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                                  className="h-4 w-4 rounded text-violet-600 border-gray-300 focus:ring-violet-500 cursor-pointer" />
                              </td>
                              <td className="px-3 py-2.5 font-mono font-semibold text-gray-900">{c.numero_contrat}</td>
                              <td className="px-3 py-2.5 text-gray-600">{c.client_raison_sociale}</td>
                              <td className="px-3 py-2.5">
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  c.type_contrat === 'Copieur' ? 'bg-blue-100 text-blue-700' :
                                  c.type_contrat === 'Telephonie' ? 'bg-amber-100 text-amber-700' :
                                  c.type_contrat === 'Informatique' ? 'bg-purple-100 text-purple-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>{c.type_contrat}</span>
                              </td>
                              <td className="px-3 py-2.5 text-gray-500">{c.periodicite || '—'}</td>
                              <td className="px-3 py-2.5 text-gray-500">{c.derniere_date_facturation ? formatDate(c.derniere_date_facturation) : 'Jamais'}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-gray-500">{c.prochaine_date_facturation ? formatDate(c.prochaine_date_facturation) : 'Non défini'}</span>
                                  {c.en_retard && (
                                    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-red-50 text-red-700">
                                      <span className="h-1 w-1 rounded-full bg-red-500" />En retard
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              {lotResult ? (
                <>
                  <button onClick={() => { setShowLotModal(false); fetchFactures(1); }} className="px-5 py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 transition cursor-pointer">
                    Voir les factures générées
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setShowLotModal(false)} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50 transition cursor-pointer">Annuler</button>
                  <button
                    onClick={executerLot}
                    disabled={lotSelection.length === 0 || !lotPeriodeDebut || !lotPeriodeFin || lotLoading}
                    className="px-5 py-2.5 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
                  >
                    {lotLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                        Génération...
                      </span>
                    ) : `Générer ${lotSelection.length} facture(s)`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
