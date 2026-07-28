'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type { ApiResponse, ContratAFacturer, GenerationLotResult, GenerationLotErreur } from '@/lib/types';
import FacturesTypeListTab from '@/components/factures/FacturesTypeListTab';

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmt(v: number | string) {
  return parseFloat(String(v || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const RAISON_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  aucune_machine_active: { label: 'Aucune machine active', icon: '🖥️', color: 'text-gray-600 bg-gray-50 border-gray-200' },
  pas_de_tarification: { label: 'Tarification non définie', icon: '💰', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  releves_manquants: { label: 'Relevés compteurs manquants ou déjà facturés', icon: '📊', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  inconnu: { label: 'Raison non déterminée', icon: '❓', color: 'text-gray-600 bg-gray-50 border-gray-200' },
};

function LotResultDisplay({ lotResult, router }: { lotResult: GenerationLotResult; router: ReturnType<typeof useRouter> }) {
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());
  const toggleExpand = (idx: number) => {
    setExpandedErrors(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next; });
  };

  const groupedErrors = lotResult.erreurs.reduce<Record<string, GenerationLotErreur[]>>((acc, e) => {
    const key = e.raison || 'inconnu';
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-12 w-12 rounded-xl bg-emerald-100 flex items-center justify-center">
          <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Génération terminée</h2>
          <p className="text-sm text-gray-500">Résultat de la facturation copieur</p>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-5 p-4 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-xl border border-gray-200">
        {lotResult.generees.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
            </div>
            <div>
              <p className="text-lg font-bold text-emerald-700">{lotResult.generees.length}</p>
              <p className="text-[11px] text-gray-500 font-medium">facture(s) générée(s)</p>
            </div>
          </div>
        )}
        {lotResult.erreurs.length > 0 && (
          <>
            {lotResult.generees.length > 0 && <div className="h-10 w-px bg-gray-200" />}
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              </div>
              <div>
                <p className="text-lg font-bold text-amber-700">{lotResult.erreurs.length}</p>
                <p className="text-[11px] text-gray-500 font-medium">contrat(s) non facturé(s)</p>
              </div>
            </div>
          </>
        )}
      </div>

      {lotResult.generees.length > 0 && (
        <div className="mb-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
            <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
            Factures générées
          </h3>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {lotResult.generees.map((g, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 bg-emerald-50/70 rounded-lg cursor-pointer hover:bg-emerald-100 transition border border-emerald-100"
                onClick={() => router.push(`/dashboard/factures/${g.facture_id}`)}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">{g.numero_facture}</span>
                  <span className="text-sm text-gray-700">{g.client}</span>
                </div>
                <span className="font-semibold text-sm text-gray-900">{fmt(g.total_ttc)} €</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lotResult.erreurs.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
            <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
            Contrats non facturés — Diagnostic
          </h3>
          <div className="space-y-3">
            {Object.entries(groupedErrors).map(([raison, erreurs]) => {
              const cfg = RAISON_LABELS[raison] || RAISON_LABELS.inconnu;
              return (
                <div key={raison} className={`rounded-xl border ${cfg.color} overflow-hidden`}>
                  <div className="px-4 py-3 flex items-center gap-3">
                    <span className="text-lg">{cfg.icon}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{cfg.label}</p>
                      <p className="text-xs opacity-70">{erreurs.length} contrat(s)</p>
                    </div>
                  </div>
                  <div className="border-t border-inherit">
                    {erreurs.map((e, i) => {
                      const globalIdx = lotResult.erreurs.indexOf(e);
                      const isExpanded = expandedErrors.has(globalIdx);
                      return (
                        <div key={i} className={i > 0 ? 'border-t border-inherit' : ''}>
                          <button onClick={() => toggleExpand(globalIdx)} className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-white/50 transition cursor-pointer">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="font-mono text-xs font-bold shrink-0">{e.numero_contrat || `#${e.contrat_id}`}</span>
                              <span className="text-sm text-gray-700 truncate">{e.client || ''}</span>
                            </div>
                            <svg className={`h-4 w-4 text-gray-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                          </button>
                          {isExpanded && (
                            <div className="px-4 pb-3">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                {e.periodicite && (
                                  <div className="bg-white/80 rounded-lg px-3 py-2">
                                    <p className="text-gray-400 font-medium">Périodicité</p>
                                    <p className="font-semibold text-gray-700">{e.periodicite}</p>
                                  </div>
                                )}
                                {e.nb_machines != null && (
                                  <div className="bg-white/80 rounded-lg px-3 py-2">
                                    <p className="text-gray-400 font-medium">Machines</p>
                                    <p className="font-semibold text-gray-700">{e.nb_machines_actives || 0} active(s) / {e.nb_machines}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function GenerationCopieurTab() {
  const router = useRouter();
  const [contratsAFacturer, setContratsAFacturer] = useState<ContratAFacturer[]>([]);
  const [selection, setSelection] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [lotLoading, setLotLoading] = useState(false);
  const [lotResult, setLotResult] = useState<GenerationLotResult | null>(null);
  const [periodeDebut, setPeriodeDebut] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [periodeFin, setPeriodeFin] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  });

  const chargerContrats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<ContratAFacturer[]>>('/factures/contrats-a-facturer');
      setContratsAFacturer(res.data.filter(c => c.type_contrat === 'Copieur'));
      setSelection([]);
      setLotResult(null);
    } catch {
      setContratsAFacturer([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const setQuickPeriod = (type: 'mois_courant' | 'mois_precedent' | 'trimestre' | 'trimestre_precedent') => {
    const now = new Date();
    let debut: Date, fin: Date;
    if (type === 'mois_courant') {
      debut = new Date(now.getFullYear(), now.getMonth(), 1);
      fin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (type === 'mois_precedent') {
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
    setPeriodeDebut(debut.toISOString().slice(0, 10));
    setPeriodeFin(fin.toISOString().slice(0, 10));
  };

  const executerLot = async () => {
    if (selection.length === 0 || !periodeDebut || !periodeFin) return;
    setLotLoading(true);
    try {
      const res = await api.post<ApiResponse<GenerationLotResult>>('/factures/generer-lot', {
        contrat_ids: selection,
        periode_debut: periodeDebut,
        periode_fin: periodeFin,
      });
      setLotResult(res.data);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLotLoading(false);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');

  const filteredContrats = contratsAFacturer.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.numero_contrat.toLowerCase().includes(q) ||
      c.client_raison_sociale.toLowerCase().includes(q) ||
      (c.periodicite && c.periodicite.toLowerCase().includes(q))
    );
  });

  const contrats = filteredContrats;

  if (lotResult) {
    return (
      <div>
        <LotResultDisplay lotResult={lotResult} router={router} />
        <div className="mt-4 flex items-center gap-3">
          <button onClick={() => { setLotResult(null); chargerContrats(); }}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">
            Nouvelle génération
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Période + chargement */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <p className="text-sm font-semibold text-gray-700 mb-3">Période de facturation</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Du</label>
            <input type="date" value={periodeDebut} onChange={e => setPeriodeDebut(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Au</label>
            <input type="date" value={periodeFin} onChange={e => setPeriodeFin(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none" />
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setQuickPeriod('mois_courant')} className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-white hover:border-blue-300 transition cursor-pointer">Mois courant</button>
            <button onClick={() => setQuickPeriod('mois_precedent')} className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-white hover:border-blue-300 transition cursor-pointer">Mois précédent</button>
            <button onClick={() => setQuickPeriod('trimestre')} className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-white hover:border-blue-300 transition cursor-pointer">Trimestre</button>
            <button onClick={() => setQuickPeriod('trimestre_precedent')} className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-white hover:border-blue-300 transition cursor-pointer">Trim. précédent</button>
          </div>
          <button onClick={chargerContrats}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            Charger les contrats
          </button>
        </div>
      </div>

      {/* Barre de recherche */}
      {contratsAFacturer.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher par n° contrat, client, périodicité..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none transition placeholder:text-gray-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="mt-2 text-xs text-gray-400">
              {contrats.length} résultat(s) sur {contratsAFacturer.length} contrat(s)
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      {contrats.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelection(selection.length === contrats.length ? [] : contrats.map(c => c.id))}
              className="text-sm font-medium text-blue-600 hover:text-blue-700 cursor-pointer">
              {selection.length === contrats.length ? 'Tout désélectionner' : 'Tout sélectionner'}
            </button>
            {selection.length > 0 && (
              <span className="text-sm text-gray-500">{selection.length} contrat(s) sélectionné(s)</span>
            )}
          </div>
          <button onClick={executerLot}
            disabled={selection.length === 0 || !periodeDebut || !periodeFin || lotLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            {lotLoading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Génération...
              </span>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" /></svg>
                Générer {selection.length} facture(s)
              </>
            )}
          </button>
        </div>
      )}

      {/* Tableau contrats */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="px-3 py-3.5 w-10">
                  <input type="checkbox"
                    checked={selection.length === contrats.length && contrats.length > 0}
                    onChange={() => setSelection(selection.length === contrats.length ? [] : contrats.map(c => c.id))}
                    className="h-4 w-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer" />
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">N° Contrat</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Périodicité</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Dernière facture</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Prochaine</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
                    <p className="text-sm text-gray-400">Chargement des contrats copieur...</p>
                  </div>
                </td></tr>
              ) : contrats.length === 0 ? (
                <tr><td colSpan={6} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M9.75 8.25h.008v.008H9.75V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">
                        {searchQuery ? 'Aucun résultat pour cette recherche' : 'Aucun contrat copieur à facturer'}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {searchQuery ? 'Essayez avec un autre terme de recherche' : 'Cliquez sur "Charger les contrats" pour rechercher'}
                      </p>
                    </div>
                  </div>
                </td></tr>
              ) : contrats.map(c => (
                <tr key={c.id} className={`transition ${selection.includes(c.id) ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" checked={selection.includes(c.id)}
                      onChange={() => setSelection(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                      className="h-4 w-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer" />
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-gray-900">{c.numero_contrat}</td>
                  <td className="px-4 py-2.5 text-gray-600">{c.client_raison_sociale}</td>
                  <td className="px-4 py-2.5 text-gray-500">{c.periodicite || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{c.derniere_date_facturation ? formatDate(c.derniere_date_facturation) : 'Jamais'}</td>
                  <td className="px-4 py-2.5">
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
      </div>
    </div>
  );
}

export default function FacturesCopieurPage() {
  const { user } = useAuth();
  // La génération en lot dépend des contrats copieur (backend gated par
  // requireModule('contrats') sur /factures/contrats-a-facturer) : sans ce
  // module, l'onglet "Générer" n'a plus de sens, seule la liste reste utile.
  const contratsModuleActive = user?.modules_actifs?.contrats !== false;
  const [activeTab, setActiveTab] = useState<'liste' | 'generation'>('liste');

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M9.75 8.25h.008v.008H9.75V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
            </span>
            Facturation Copieur
          </h1>
          <p className="mt-1 text-sm text-gray-500 ml-[52px]">Gestion des factures copieur</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        <button
          onClick={() => setActiveTab('liste')}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${activeTab === 'liste' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
            Factures
          </span>
        </button>
        {contratsModuleActive && (
          <button
            onClick={() => setActiveTab('generation')}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${activeTab === 'generation' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" /></svg>
              Générer
            </span>
          </button>
        )}
      </div>

      {/* Content */}
      {activeTab === 'liste' && <FacturesTypeListTab typeContrat="Copieur" />}
      {activeTab === 'generation' && contratsModuleActive && <GenerationCopieurTab />}
    </div>
  );
}
