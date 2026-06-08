'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContratAbonnement {
  id: number;
  numero_contrat: string;
  type_contrat: string;
  client_raison_sociale: string;
  client_code: string;
  periodicite: string;
  prochaine_facturation: string;
  periode_debut: string;
  periode_fin: string;
  montant_abonnement_ht: number;
  ftc: number;
  total_ht: number;
  rubriques: string[];
}

interface ContratsResponse {
  contrats: ContratAbonnement[];
  total_ht: number;
  total_ttc: number;
  count: number;
  types_inclus: string[];
}

interface FactureGeneree {
  facture_id: number;
  numero_facture: string;
  contrat_id: number;
  numero_contrat: string;
  type_contrat: string;
  client: string;
  client_code: string;
  montant_ht: number;
  montant_ttc: number;
  periode_debut: string;
  periode_fin: string;
}

interface RapportGeneration {
  factures_creees: number;
  montant_total_ht: number;
  montant_total_ttc: number;
  factures: FactureGeneree[];
  augmentations: unknown[];
}

interface SimulationLigne {
  categorie: string;
  reference: string | null;
  designation: string;
  quantite: number;
  prix_unitaire_ht: number;
  remise_pourcentage: number;
  total_ht: number;
  periode: string;
}

interface SimulationResult {
  contrat: { id: number; numero_contrat: string; type_contrat: string; client: string; client_code: string; periodicite: string };
  periode_debut: string;
  periode_fin: string;
  lignes: SimulationLigne[];
  ftc: number;
  total_ht: number;
  montant_tva: number;
  total_ttc: number;
}

// ---------------------------------------------------------------------------
// Config visuelle par type
// ---------------------------------------------------------------------------

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; gradient: string; shadow: string; bgAccent: string; textAccent: string; borderAccent: string }> = {
  Tous: {
    label: 'Facturation par abonnement',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />,
    gradient: 'from-violet-500 to-purple-600',
    shadow: 'shadow-violet-500/20',
    bgAccent: 'bg-violet-50',
    textAccent: 'text-violet-700',
    borderAccent: 'border-violet-200',
  },
  Telephonie: {
    label: 'Facturation téléphonie',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />,
    gradient: 'from-amber-500 to-orange-600',
    shadow: 'shadow-amber-500/20',
    bgAccent: 'bg-amber-50',
    textAccent: 'text-amber-700',
    borderAccent: 'border-amber-200',
  },
  Informatique: {
    label: 'Facturation informatique',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z" />,
    gradient: 'from-cyan-500 to-blue-600',
    shadow: 'shadow-cyan-500/20',
    bgAccent: 'bg-cyan-50',
    textAccent: 'text-cyan-700',
    borderAccent: 'border-cyan-200',
  },
};

const RUBRIQUE_COLORS: Record<string, string> = {
  'Forfait Fixe': 'bg-blue-100 text-blue-700',
  'Forfait Mobile': 'bg-indigo-100 text-indigo-700',
  'Lien Internet': 'bg-purple-100 text-purple-700',
  'Location Matériel': 'bg-amber-100 text-amber-700',
  'Services': 'bg-emerald-100 text-emerald-700',
  'Autre': 'bg-gray-100 text-gray-700',
  'Personnalisé': 'bg-pink-100 text-pink-700',
  'Vidéosurveillance': 'bg-red-100 text-red-700',
  'Contrôle d\'accès': 'bg-orange-100 text-orange-700',
  'Téléassistance': 'bg-teal-100 text-teal-700',
  'Générateur de brouillard': 'bg-slate-100 text-slate-700',
  'Maintenance serveur': 'bg-sky-100 text-sky-700',
  'Maintenance informatique': 'bg-cyan-100 text-cyan-700',
  'Cloud': 'bg-violet-100 text-violet-700',
  'Office 365': 'bg-blue-100 text-blue-700',
  'Logiciel / Licence': 'bg-fuchsia-100 text-fuchsia-700',
};

const TYPE_BADGE: Record<string, string> = {
  Telephonie: 'bg-amber-100 text-amber-700',
  Informatique: 'bg-cyan-100 text-cyan-700',
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmt(v: number) {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function FacturationAbonnementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = searchParams.get('type') || 'Tous';

  const [typeFilter, setTypeFilter] = useState(initialType);
  const config = TYPE_CONFIG[typeFilter] || TYPE_CONFIG.Tous;

  const [dateFacturation, setDateFacturation] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(false);
  const [contrats, setContrats] = useState<ContratAbonnement[]>([]);
  const [stats, setStats] = useState<{ count: number; total_ht: number; total_ttc: number } | null>(null);
  const [selection, setSelection] = useState<number[]>([]);
  const [generating, setGenerating] = useState(false);
  const [rapport, setRapport] = useState<RapportGeneration | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [simulationLoading, setSimulationLoading] = useState<number | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [showSimulationModal, setShowSimulationModal] = useState(false);

  const chargerContrats = useCallback(async () => {
    setLoading(true);
    try {
      const typeParam = typeFilter !== 'Tous' ? `&type=${typeFilter}` : '';
      const res = await api.get<ApiResponse<ContratsResponse>>(`/factures/contrats-abonnement-a-facturer?date=${dateFacturation}${typeParam}`);
      setContrats(res.data.contrats);
      setStats({ count: res.data.count, total_ht: res.data.total_ht, total_ttc: res.data.total_ttc });
      setSelection([]);
      setRapport(null);
    } catch {
      setContrats([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [dateFacturation, typeFilter]);

  useEffect(() => { chargerContrats(); }, [chargerContrats]);

  const toggleSelection = (id: number) => {
    setSelection(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toutSelectionner = () => {
    setSelection(selection.length === contrats.length ? [] : contrats.map(c => c.id));
  };

  const selectedTotal = contrats.filter(c => selection.includes(c.id)).reduce((sum, c) => sum + c.total_ht, 0);

  const lancerGeneration = async () => {
    setShowConfirmModal(false);
    setGenerating(true);
    try {
      const res = await api.post<ApiResponse<RapportGeneration>>('/factures/generer-abonnement', {
        date_facturation: dateFacturation,
        contrat_ids: selection,
      });
      setRapport(res.data);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la génération');
    } finally {
      setGenerating(false);
    }
  };

  const lancerSimulation = async (contratId: number) => {
    setSimulationLoading(contratId);
    try {
      const res = await api.get<ApiResponse<SimulationResult>>(`/factures/simuler-abonnement/${contratId}?date=${dateFacturation}`);
      setSimulation(res.data);
      setShowSimulationModal(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur lors de la simulation');
    } finally {
      setSimulationLoading(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className={`h-10 w-10 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-lg ${config.shadow}`}>
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">{config.icon}</svg>
            </span>
            {config.label}
          </h1>
          <p className="mt-1 text-sm text-gray-500 ml-[52px]">
            Génération des factures d&apos;abonnement{typeFilter !== 'Tous' ? ` ${typeFilter.toLowerCase()}` : ''}
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/factures')}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
          Retour aux factures
        </button>
      </div>

      {/* Si rapport affiché */}
      {rapport && (
        <div className="mb-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Génération terminée</h2>
                <p className="text-sm text-gray-500">Toutes les factures ont été créées en brouillon</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <p className="text-2xl font-bold text-emerald-700">{rapport.factures_creees}</p>
                <p className="text-xs text-emerald-600 font-medium mt-1">Factures créées en brouillon</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                <p className="text-2xl font-bold text-blue-700">{fmt(rapport.montant_total_ht)} €</p>
                <p className="text-xs text-blue-600 font-medium mt-1">Montant total HT</p>
              </div>
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                <p className="text-2xl font-bold text-indigo-700">{fmt(rapport.montant_total_ttc)} €</p>
                <p className="text-xs text-indigo-600 font-medium mt-1">Montant total TTC</p>
              </div>
            </div>

            <div className="space-y-1.5 max-h-80 overflow-y-auto mb-4">
              {rapport.factures.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-emerald-50 transition cursor-pointer border border-gray-100"
                  onClick={() => router.push(`/dashboard/factures/${f.facture_id}`)}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">{f.numero_facture}</span>
                    {typeFilter === 'Tous' && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TYPE_BADGE[f.type_contrat] || 'bg-gray-100 text-gray-700'}`}>
                        {f.type_contrat}
                      </span>
                    )}
                    <div>
                      <span className="text-sm font-medium text-gray-900">{f.client}</span>
                      <span className="text-xs text-gray-400 ml-2">{f.numero_contrat}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-sm text-gray-900">{fmt(f.montant_ttc)} € TTC</span>
                    <p className="text-[11px] text-gray-400">{formatDate(f.periode_debut)} → {formatDate(f.periode_fin)}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/dashboard/factures?statut=Brouillon')}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition cursor-pointer"
              >
                Voir les factures brouillon
              </button>
              <button
                onClick={() => { setRapport(null); chargerContrats(); }}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Nouvelle génération
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contenu principal (masqué si rapport) */}
      {!rapport && (
        <>
          {/* Sélection de date + filtre type */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date de facturation</label>
                <input
                  type="date"
                  value={dateFacturation}
                  onChange={e => setDateFacturation(e.target.value)}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Type de contrat</label>
                <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                  {['Tous', 'Telephonie', 'Informatique'].map(t => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-4 py-2.5 text-sm font-medium transition cursor-pointer ${
                        typeFilter === t
                          ? `${(TYPE_CONFIG[t] || TYPE_CONFIG.Tous).bgAccent} ${(TYPE_CONFIG[t] || TYPE_CONFIG.Tous).textAccent} font-semibold`
                          : 'bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {t === 'Tous' ? 'Tous' : t}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={chargerContrats}
                className={`inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition cursor-pointer ${config.bgAccent} ${config.borderAccent} ${config.textAccent} hover:opacity-80`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
                Rechercher
              </button>
              <p className="text-xs text-gray-400 self-center">
                Affiche les contrats dont la prochaine facturation est ≤ à la date sélectionnée
              </p>
            </div>
          </div>

          {/* KPI */}
          {stats && stats.count > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Contrats à facturer</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{stats.count}</p>
                  </div>
                  <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-sm`}>
                    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Montant total HT</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{fmt(stats.total_ht)} €</p>
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
                    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.25 7.756a4.5 4.5 0 1 0 0 8.488M7.5 10.5h5.25m-5.25 3h5.25M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Montant total TTC</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{fmt(stats.total_ttc)} €</p>
                  </div>
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
                    <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          {contrats.length > 0 && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <button onClick={toutSelectionner} className="text-sm font-medium text-blue-600 hover:text-blue-700 cursor-pointer">
                  {selection.length === contrats.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
                {selection.length > 0 && (
                  <span className="text-sm text-gray-500">
                    {selection.length} contrat(s) sélectionné(s) — <span className="font-semibold text-gray-700">{fmt(selectedTotal)} € HT</span>
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={selection.length === 0 || generating}
                className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${config.gradient} px-5 py-2.5 text-sm font-semibold text-white shadow-lg ${config.shadow} hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
              >
                {generating ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Génération...
                  </span>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" /></svg>
                    Générer les factures
                  </>
                )}
              </button>
            </div>
          )}

          {/* Tableau des contrats */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="px-3 py-3.5 w-10">
                      <input
                        type="checkbox"
                        checked={selection.length === contrats.length && contrats.length > 0}
                        onChange={toutSelectionner}
                        className="h-4 w-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">N° Contrat</th>
                    {typeFilter === 'Tous' && (
                      <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Type</th>
                    )}
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Période</th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Rubriques</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Abonnement HT</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">FTC</th>
                    <th className="px-4 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Total HT</th>
                    <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={typeFilter === 'Tous' ? 10 : 9} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className={`animate-spin h-8 w-8 border-[3px] border-t-transparent rounded-full`} style={{ borderColor: typeFilter === 'Telephonie' ? '#d97706' : typeFilter === 'Informatique' ? '#0891b2' : '#7c3aed', borderTopColor: 'transparent' }} />
                        <p className="text-sm text-gray-400">Recherche des contrats à facturer...</p>
                      </div>
                    </td></tr>
                  ) : contrats.length === 0 ? (
                    <tr><td colSpan={typeFilter === 'Tous' ? 10 : 9} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                          <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-500">Aucun contrat à facturer</p>
                          <p className="text-xs text-gray-400 mt-0.5">Tous les contrats{typeFilter !== 'Tous' ? ` ${typeFilter.toLowerCase()}` : ''} sont à jour pour cette date</p>
                        </div>
                      </div>
                    </td></tr>
                  ) : contrats.map(contrat => (
                    <tr key={contrat.id} className={`transition ${selection.includes(contrat.id) ? 'bg-blue-50/40' : 'hover:bg-gray-50/50'}`}>
                      <td className="px-3 py-3.5">
                        <input
                          type="checkbox"
                          checked={selection.includes(contrat.id)}
                          onChange={() => toggleSelection(contrat.id)}
                          className="h-4 w-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-sm font-bold text-gray-900">{contrat.numero_contrat}</span>
                      </td>
                      {typeFilter === 'Tous' && (
                        <td className="px-4 py-3.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${TYPE_BADGE[contrat.type_contrat] || 'bg-gray-100 text-gray-700'}`}>
                            {contrat.type_contrat}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[180px]">{contrat.client_raison_sociale}</p>
                        <p className="text-[11px] text-gray-400">{contrat.client_code}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-sm text-gray-600">{formatDate(contrat.periode_debut)} → {formatDate(contrat.periode_fin)}</p>
                        <p className="text-[11px] text-gray-400">{contrat.periodicite}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {contrat.rubriques.map((r, i) => (
                            <span key={i} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${RUBRIQUE_COLORS[r] || 'bg-gray-100 text-gray-700'}`}>
                              {r}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-sm text-gray-600">{fmt(contrat.montant_abonnement_ht)} €</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-sm text-gray-500">{contrat.ftc > 0 ? `${fmt(contrat.ftc)} €` : '—'}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-sm font-semibold text-gray-900">{fmt(contrat.total_ht)} €</span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => lancerSimulation(contrat.id)}
                          disabled={simulationLoading === contrat.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-600 hover:bg-blue-50 transition cursor-pointer disabled:opacity-50"
                          title="Aperçu"
                        >
                          {simulationLoading === contrat.id ? (
                            <span className="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full" />
                          ) : (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                          )}
                          Aperçu
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modale confirmation */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowConfirmModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-10 w-10 rounded-xl ${config.bgAccent} flex items-center justify-center`}>
                <svg className={`h-5 w-5 ${config.textAccent}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Confirmer la génération</h3>
                <p className="text-sm text-gray-500">Cette action est irréversible</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Contrats sélectionnés :</span>
                <span className="font-semibold text-gray-900">{selection.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Montant total HT :</span>
                <span className="font-semibold text-gray-900">{fmt(selectedTotal)} €</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Montant total TTC :</span>
                <span className="font-semibold text-gray-900">{fmt(selectedTotal * 1.2)} €</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Date de facturation :</span>
                <span className="font-semibold text-gray-900">{formatDate(dateFacturation)}</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-5">Les factures seront créées en statut <strong>Brouillon</strong>. Vous pourrez les modifier, valider ou supprimer après génération.</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={lancerGeneration}
                className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${config.gradient} px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition cursor-pointer`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale simulation */}
      {showSimulationModal && simulation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowSimulationModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  Aperçu facture
                  {simulation.contrat.type_contrat && (
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${TYPE_BADGE[simulation.contrat.type_contrat] || 'bg-gray-100 text-gray-700'}`}>
                      {simulation.contrat.type_contrat}
                    </span>
                  )}
                </h3>
                <p className="text-sm text-gray-500">{simulation.contrat.client} — {simulation.contrat.numero_contrat}</p>
              </div>
              <button onClick={() => setShowSimulationModal(false)} className="text-gray-400 hover:text-gray-600 transition cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-400">Période :</span> <span className="font-medium text-gray-700">{formatDate(simulation.periode_debut)} → {formatDate(simulation.periode_fin)}</span></div>
                  <div><span className="text-gray-400">Périodicité :</span> <span className="font-medium text-gray-700">{simulation.contrat.periodicite}</span></div>
                </div>
              </div>

              <div className="space-y-3">
                {(() => {
                  const grouped: Record<string, SimulationLigne[]> = {};
                  for (const l of simulation.lignes) {
                    if (!grouped[l.categorie]) grouped[l.categorie] = [];
                    grouped[l.categorie].push(l);
                  }
                  return Object.entries(grouped).map(([cat, lignes]) => (
                    <div key={cat} className="border border-gray-100 rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${RUBRIQUE_COLORS[cat] || 'bg-gray-100 text-gray-700'}`}>{cat}</span>
                        <span className="text-xs text-gray-400 ml-2">Période du {lignes[0]?.periode}</span>
                      </div>
                      <table className="w-full text-sm">
                        <tbody>
                          {lignes.map((l, i) => (
                            <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                              <td className="px-4 py-2 text-xs text-gray-400 w-16">{l.reference || ''}</td>
                              <td className="px-4 py-2 text-gray-700">{l.designation}</td>
                              <td className="px-4 py-2 text-center text-gray-500 w-16">{l.quantite}</td>
                              <td className="px-4 py-2 text-right text-gray-500 w-24">{fmt(l.prix_unitaire_ht)} €</td>
                              <td className="px-4 py-2 text-right font-semibold text-gray-900 w-24">{fmt(l.total_ht)} €</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ));
                })()}
              </div>

              {simulation.ftc > 0 && (
                <div className="mt-3 border border-gray-100 rounded-xl px-4 py-2.5 flex justify-between items-center">
                  <span className="text-sm text-gray-600">Frais techniques complémentaires (FTC)</span>
                  <span className="text-sm font-semibold text-gray-900">{fmt(simulation.ftc)} €</span>
                </div>
              )}

              <div className="mt-4 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-xl p-4 border border-gray-200">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Total HT</span><span className="font-semibold text-gray-900">{fmt(simulation.total_ht)} €</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">TVA 20%</span><span className="text-gray-700">{fmt(simulation.montant_tva)} €</span></div>
                  <div className="border-t border-gray-200 pt-1.5 flex justify-between text-base"><span className="font-bold text-gray-900">Total TTC</span><span className={`font-bold ${config.textAccent}`}>{fmt(simulation.total_ttc)} €</span></div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <button
                onClick={() => setShowSimulationModal(false)}
                className="w-full rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
