'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Avoir, PaginatedResponse, StatutAvoir } from '@/lib/types';

const STATUT_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  'Brouillon': { label: 'Brouillon', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  'Validé': { label: 'Validé', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'Remboursé': { label: 'Remboursé', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'Imputé': { label: 'Imputé', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  'Annulé': { label: 'Annulé', bg: 'bg-gray-100', text: 'text-gray-400 line-through', dot: 'bg-gray-300' },
};

const STATUT_TABS: { label: string; value: StatutAvoir | '' }[] = [
  { label: 'Tous', value: '' },
  { label: 'Brouillons', value: 'Brouillon' },
  { label: 'Validés', value: 'Validé' },
  { label: 'Remboursés', value: 'Remboursé' },
  { label: 'Imputés', value: 'Imputé' },
  { label: 'Annulés', value: 'Annulé' },
];

function StatusBadge({ statut }: { statut: string }) {
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

function fmt(v: number | string) {
  return parseFloat(String(v || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AvoirsListPage() {
  const router = useRouter();
  const [avoirs, setAvoirs] = useState<Avoir[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<StatutAvoir | ''>('');
  const [loading, setLoading] = useState(true);
  const [searchDebounce, setSearchDebounce] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchAvoirs = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (statutFilter) params.set('statut', statutFilter);
      if (searchDebounce) params.set('search', searchDebounce);
      const res = await api.get<PaginatedResponse<Avoir>>(`/avoirs?${params}`);
      setAvoirs(res.data);
      setPagination(res.pagination);
    } catch { setAvoirs([]); }
    finally { setLoading(false); }
  }, [statutFilter, searchDebounce]);

  useEffect(() => { fetchAvoirs(1); }, [fetchAvoirs]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <button onClick={() => router.push('/dashboard/factures')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3 transition cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Factures
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185Z" /></svg>
            </span>
            Avoirs
            <span className="text-base font-normal text-gray-400">({pagination.total})</span>
          </h1>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
          <div className="flex-1 relative w-full lg:max-w-md">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            <input type="text" placeholder="Rechercher par n° avoir, client, facture..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-10 pr-4 text-sm placeholder-gray-400 focus:bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none transition" />
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUT_TABS.map(tab => (
              <button key={tab.value} onClick={() => setStatutFilter(tab.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${statutFilter === tab.value ? 'bg-red-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">N° Avoir</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Facture liée</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Montant TTC</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Mode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin h-8 w-8 border-[3px] border-red-600 border-t-transparent rounded-full" />
                    <p className="text-sm text-gray-400">Chargement des avoirs...</p>
                  </div>
                </td></tr>
              ) : avoirs.length === 0 ? (
                <tr><td colSpan={7} className="py-20 text-center">
                  <p className="text-sm text-gray-500">Aucun avoir trouvé</p>
                  <p className="text-xs text-gray-400 mt-1">Les avoirs se créent depuis le détail d&apos;une facture validée</p>
                </td></tr>
              ) : avoirs.map(avoir => (
                <tr key={avoir.id} onClick={() => router.push(`/dashboard/factures/avoirs/${avoir.id}`)}
                  className="group hover:bg-red-50/40 cursor-pointer transition-colors">
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-bold text-red-700 font-mono">{avoir.numero}</span>
                    <span className={`ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${avoir.type_avoir === 'TOTAL' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{avoir.type_avoir}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-violet-600 font-mono font-semibold cursor-pointer hover:underline"
                      onClick={e => { e.stopPropagation(); router.push(`/dashboard/factures/${avoir.facture_id}`); }}>
                      {avoir.numero_facture}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-medium text-gray-900 truncate max-w-[160px]">{avoir.client_nom || ''}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-gray-600">{formatDate(avoir.date_avoir)}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm font-semibold text-red-700">-{fmt(avoir.montant_ttc)} €</span>
                  </td>
                  <td className="px-4 py-3.5"><StatusBadge statut={avoir.statut} /></td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs text-gray-500">{avoir.mode_utilisation || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
            <p className="text-sm text-gray-500">
              Page <span className="font-medium">{pagination.page}</span> sur <span className="font-medium">{pagination.totalPages}</span>
            </p>
            <div className="flex items-center gap-1">
              <button disabled={pagination.page <= 1} onClick={() => fetchAvoirs(pagination.page - 1)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition cursor-pointer">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              </button>
              <button disabled={pagination.page >= pagination.totalPages} onClick={() => fetchAvoirs(pagination.page + 1)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition cursor-pointer">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
