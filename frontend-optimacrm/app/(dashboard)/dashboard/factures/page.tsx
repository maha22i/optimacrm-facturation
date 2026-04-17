'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Facture, FactureStats, ContratAFacturer, PaginatedResponse, ApiResponse, StatutFacture, TypeOrigineFacture, GenerationLotResult, ReleveCompteur } from '@/lib/types';

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
  const [activeTab, setActiveTab] = useState<'factures' | 'releves'>('factures');
  const [releves, setReleves] = useState<ReleveCompteur[]>([]);
  const [relevesLoading, setRelevesLoading] = useState(false);

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
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
        const response = await fetch(`${apiUrl}/factures/${facture.id}/pdf`, {
          headers: { ...(token && { Authorization: `Bearer ${token}` }) },
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
        if (confirm('Supprimer cette facture brouillon ?')) {
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

  const loadReleves = useCallback(async () => {
    setRelevesLoading(true);
    try {
      const res = await api.get<ApiResponse<ReleveCompteur[]>>('/releves-compteurs');
      setReleves(res.data);
    } catch {
      setReleves([]);
    } finally {
      setRelevesLoading(false);
    }
  }, []);

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
            Générer des factures
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
            { label: 'CA du mois', value: `${fmt(stats.ca_mois.montant)} €`, sub: `${stats.ca_mois.count} facture(s)`, color: 'from-emerald-500 to-teal-500', icon: (<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 7.756a4.5 4.5 0 1 0 0 8.488M7.5 10.5h5.25m-5.25 3h5.25M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>) },
            { label: 'En attente', value: `${fmt(stats.en_attente.montant)} €`, sub: `${stats.en_attente.count} facture(s)`, color: 'from-blue-500 to-indigo-500', icon: (<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>) },
            { label: 'Envoyées ce mois', value: `${fmt(stats.envoyees_mois.montant)} €`, sub: `${stats.envoyees_mois.count} facture(s)`, color: 'from-violet-500 to-purple-500', icon: (<svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>) },
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
          onClick={() => { setActiveTab('releves'); loadReleves(); }}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${activeTab === 'releves' ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          Relevés importés
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

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80">
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
                <tr><td colSpan={9} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin h-8 w-8 border-[3px] border-violet-600 border-t-transparent rounded-full" />
                    <p className="text-sm text-gray-400">Chargement des factures...</p>
                  </div>
                </td></tr>
              ) : factures.length === 0 ? (
                <tr><td colSpan={9} className="py-20 text-center">
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
                  className="group hover:bg-violet-50/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-bold text-violet-700 font-mono">{facture.numero_facture}</span>
                    {facture.est_avoir && <span className="ml-1.5 text-[10px] font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">AVOIR</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-gray-600">{formatDate(facture.date_creation)}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-[160px]">{facture.client_raison_sociale || facture.client_nom || ''}</p>
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
                              {facture.statut === 'Brouillon' && (
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

      {/* Tab: Relevés importés */}
      {activeTab === 'releves' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/80">
                  <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Date relevé</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">N° Contrat / Machine</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Compteur NB</th>
                  <th className="px-4 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Compteur Couleur</th>
                  <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Statut</th>
                  <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {relevesLoading ? (
                  <tr><td colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="animate-spin h-8 w-8 border-[3px] border-violet-600 border-t-transparent rounded-full" />
                      <p className="text-sm text-gray-400">Chargement des relevés...</p>
                    </div>
                  </td></tr>
                ) : releves.length === 0 ? (
                  <tr><td colSpan={7} className="py-20 text-center">
                    <p className="text-sm text-gray-500">Aucun relevé importé</p>
                  </td></tr>
                ) : releves.map(r => (
                  <tr key={r.id} className="hover:bg-violet-50/40 transition-colors">
                    <td className="px-4 py-3.5 text-sm text-gray-600">{formatDate(r.date_releve)}</td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm font-mono font-semibold text-gray-900">{r.numero_contrat || '—'}</span>
                      <p className="text-[11px] text-gray-400">{r.numero_serie}</p>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">{r.client_raison_sociale || '—'}</td>
                    <td className="px-4 py-3.5 text-right text-sm font-medium text-gray-900">{r.compteur_nb?.toLocaleString('fr-FR') ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right text-sm font-medium text-gray-900">{r.compteur_couleur?.toLocaleString('fr-FR') ?? '—'}</td>
                    <td className="px-4 py-3.5">
                      {r.est_facture ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Facturé
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Non facturé
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      {r.contrat_id && (
                        <button
                          onClick={() => router.push(`/dashboard/contrats/${r.contrat_id}`)}
                          className="text-xs text-violet-600 hover:text-violet-700 font-medium cursor-pointer"
                        >
                          Voir le contrat
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
