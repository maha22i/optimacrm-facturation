'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { ApiResponse, ContratRenouvellement, RenouvellementsResponse } from '@/lib/types';

const HORIZONS = [
  { label: 'Préavis en cours', value: '' },
  { label: 'Échéance < 3 mois', value: '3' },
  { label: 'Échéance < 6 mois', value: '6' },
  { label: 'Échéance < 12 mois', value: '12' },
  { label: 'Échéance < 24 mois', value: '24' },
];

function formatDate(d: string | null) {
  if (!d) return '—';
  const [y, m, j] = d.split('-');
  return `${j}/${m}/${y}`;
}

function formatMoney(n: number | string | null | undefined) {
  const val = typeof n === 'string' ? parseFloat(n) : n;
  if (val == null || isNaN(val)) return '0,00 €';
  return val.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/**
 * Paliers d'urgence usuels du métier : le préavis court généralement sur 3 à 6
 * mois, le dernier mois est le point de non-retour pour dénoncer le contrat.
 */
function palier(jours: number): { label: string; classes: string } {
  if (jours < 0) return { label: 'Échéance passée', classes: 'bg-red-50 text-red-700 ring-red-600/20' };
  if (jours <= 31) return { label: `${jours} j`, classes: 'bg-red-50 text-red-700 ring-red-600/20' };
  if (jours <= 92) return { label: `${jours} j`, classes: 'bg-amber-50 text-amber-700 ring-amber-600/20' };
  return { label: `${jours} j`, classes: 'bg-blue-50 text-blue-700 ring-blue-600/20' };
}

export default function RenouvellementsPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('contrats_write');

  const [contrats, setContrats] = useState<ContratRenouvellement[]>([]);
  const [enAlerte, setEnAlerte] = useState(0);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState('');
  const [inclureTraites, setInclureTraites] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (horizon) params.set('horizon', horizon);
      if (inclureTraites) params.set('traites', '1');
      const res = await api.get<ApiResponse<RenouvellementsResponse>>(`/contrats/renouvellements?${params}`);
      setContrats(res.data.contrats);
      setEnAlerte(res.data.en_alerte);
    } catch {
      setContrats([]);
    } finally {
      setLoading(false);
    }
  }, [horizon, inclureTraites]);

  useEffect(() => { load(); }, [load]);

  const basculerTraitement = async (contrat: ContratRenouvellement) => {
    setBusyId(contrat.id);
    try {
      if (contrat.traite) {
        await api.delete(`/contrats/${contrat.id}/renouvellement-traite`);
        setToast({ message: `${contrat.numero_contrat} remis en attente`, type: 'success' });
      } else {
        await api.post(`/contrats/${contrat.id}/renouvellement-traite`, {});
        setToast({ message: `${contrat.numero_contrat} marqué comme traité`, type: 'success' });
      }
      await load();
    } catch {
      setToast({ message: 'Action impossible', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Renouvellements</h1>
          <p className="text-sm text-gray-500 mt-1">
            Contrats copieur à renouveler ou resigner. L&apos;alerte s&apos;ouvre au début du préavis,
            calculé sur la prochaine échéance réelle du contrat.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-gray-100 bg-white px-5 py-3 shadow-sm">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Préavis en cours</p>
            <p className="mt-0.5 text-2xl font-bold text-gray-900">{enAlerte}</p>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
            className="rounded-xl appearance-none border border-gray-200 py-2.5 pl-4 pr-10 text-sm text-gray-700 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none cursor-pointer"
          >
            {HORIZONS.map(h => (
              <option key={h.value} value={h.value}>{h.label}</option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={inclureTraites}
              onChange={(e) => setInclureTraites(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            Afficher les relances déjà traitées
          </label>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">N° Contrat</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Machine</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Installation</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Renouvellement</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Alerte depuis</th>
                <th className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Reste</th>
                <th className="text-right px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Montant HT</th>
                <th className="text-right px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
                      <span className="text-sm">Chargement...</span>
                    </div>
                  </td>
                </tr>
              ) : contrats.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      <p className="text-sm font-medium">Aucun contrat à renouveler</p>
                      <p className="text-xs text-gray-400">
                        {horizon ? 'Élargissez l\u2019horizon pour voir les échéances plus lointaines' : 'Aucun préavis n\u2019est encore ouvert'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : contrats.map((c) => {
                const reste = palier(c.jours_restants);
                return (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/dashboard/contrats/${c.id}`)}
                    className={`hover:bg-blue-50/30 cursor-pointer transition-colors ${c.traite ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-gray-900">{c.numero_contrat}</span>
                      {c.traite && (
                        <span className="ml-2 inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          Traité
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900 truncate max-w-[180px]">{c.client_raison_sociale}</p>
                      <p className="text-xs text-gray-400">{c.client_code}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-600 truncate max-w-[200px]">{c.machines_resume || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(c.date_installation || c.date_debut)}
                      <span className="block text-xs text-gray-400">{c.duree_contrat_mois} mois + {c.duree_reconduction_mois} mois</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-gray-900">{formatDate(c.date_renouvellement)}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(c.date_alerte)}
                      <span className="block text-xs text-gray-400">préavis {c.preavis_renouvellement_mois} mois</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${reste.classes}`}>
                        {reste.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-gray-900">{formatMoney(c.montant_ht)}</span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {canWrite && (
                        <button
                          onClick={() => basculerTraitement(c)}
                          disabled={busyId === c.id}
                          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
                            c.traite
                              ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {c.traite ? 'Remettre en attente' : 'Marquer traité'}
                        </button>
                      )}
                      {c.traite && c.renouvellement_traite_date && (
                        <p className="mt-1 text-[11px] text-gray-400">
                          {formatDate(c.renouvellement_traite_date)}
                          {c.renouvellement_traite_par ? ` — ${c.renouvellement_traite_par}` : ''}
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
