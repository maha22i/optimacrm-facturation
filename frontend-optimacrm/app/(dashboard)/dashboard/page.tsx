'use client';

import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';

interface StatValue { count: number; montant: number }
interface MoisData { mois: string; montant: number; count: number }
interface FactureRecente {
  id: number; numero_facture: string; client_raison_sociale: string;
  total_ttc: number; net_a_payer: number; statut: string;
  date_creation: string; date_echeance: string;
}
interface ActivityRecente {
  id: number; action: string; module: string; description: string;
  user_nom: string; entity_label: string; created_at: string;
}
interface DashboardData {
  clients: { total: number; actifs: number; nouveaux_mois: number };
  factures: {
    ca_mois: StatValue; evolution_ca: number; en_attente: StatValue;
    en_retard: StatValue; payees_mois: StatValue;
    recentes: FactureRecente[]; par_mois: MoisData[];
  };
  devis: {
    total_mois: StatValue; en_attente: StatValue;
    acceptes_mois: StatValue; taux_conversion: number; par_mois: MoisData[];
  };
  contrats: {
    total_actifs: number; par_type: Record<string, number>;
    a_facturer_ce_mois: number; echeance_3_mois: number;
    ca_recurrent_mensuel: number;
  };
  parc: {
    total: number; en_service: number; en_stock: number;
    en_sav: number; alertes_compteurs: number;
  };
  catalogue: { produits_actifs: number };
  activite: { recentes: ActivityRecente[]; actions_aujourdhui: number };
}

function formatMontant(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
}

function formatMontantPrecis(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
}

function formatMoisLabel(mois: string) {
  const d = new Date(mois + '-01');
  return d.toLocaleDateString('fr-FR', { month: 'short' });
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Il y a ${days}j`;
}

const STATUT_FACTURE_COLORS: Record<string, string> = {
  'Brouillon': 'bg-gray-100 text-gray-600',
  'Validée': 'bg-blue-50 text-blue-700',
  'Envoyée': 'bg-amber-50 text-amber-700',
  'Payée': 'bg-emerald-50 text-emerald-700',
  'Annulée': 'bg-red-50 text-red-600',
};

const MODULE_ICONS: Record<string, string> = {
  clients: 'text-blue-500 bg-blue-50',
  devis: 'text-violet-500 bg-violet-50',
  factures: 'text-amber-500 bg-amber-50',
  contrats: 'text-emerald-500 bg-emerald-50',
  parc: 'text-cyan-500 bg-cyan-50',
  catalogue: 'text-orange-500 bg-orange-50',
  releves: 'text-teal-500 bg-teal-50',
};

function MiniBarChart({ data, maxHeight = 48 }: { data: MoisData[]; maxHeight?: number }) {
  const max = Math.max(...data.map(d => d.montant), 1);
  return (
    <div className="flex items-end gap-1.5 h-12">
      {data.map((d, i) => {
        const h = Math.max((d.montant / max) * maxHeight, 2);
        const isLast = i === data.length - 1;
        return (
          <div key={d.mois} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`w-full rounded-sm transition-all duration-500 ${isLast ? 'bg-blue-500' : 'bg-blue-200'}`}
              style={{ height: `${h}px` }}
              title={`${formatMoisLabel(d.mois)}: ${formatMontant(d.montant)}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function ContratTypeBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">{count}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setDenied(false);
      const res = await api.get<{ data: DashboardData }>('/dashboard/stats');
      setData(res.data);
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 403) {
        setDenied(true);
      } else {
        setError(e instanceof Error ? e.message : 'Erreur de chargement');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && hasPermission('dashboard')) {
      fetchData();
    } else if (user) {
      setLoading(false);
      setDenied(true);
    }
  }, [fetchData, user, hasPermission]);

  if (!user) return null;

  if (denied) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase();

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-24 bg-white rounded-2xl border border-gray-100" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-white rounded-2xl border border-gray-100" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-64 bg-white rounded-2xl border border-gray-100" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <button onClick={fetchData} className="mt-3 text-sm text-red-500 hover:text-red-700 underline cursor-pointer">
          Réessayer
        </button>
      </div>
    );
  }

  if (!data) return null;

  const totalContrats = Object.values(data.contrats.par_type).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* En-tête avec salutation */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-blue-500/30">
              {initials}
            </div>
            <div>
              <h1 className="text-xl font-bold">{greeting}, {user.first_name} !</h1>
              <p className="text-sm text-slate-300 mt-0.5">Voici le résumé de votre activité sur OptimaCRM</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-400">Aujourd&apos;hui</p>
              <p className="text-sm font-semibold">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
              <svg className="h-5 w-5 text-blue-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* KPI principaux */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Clients actifs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5 group">
          <div className="flex items-center justify-between mb-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
            </div>
            {data.clients.nouveaux_mois > 0 && (
              <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                +{data.clients.nouveaux_mois} ce mois
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900">{data.clients.actifs}</p>
          <p className="text-xs text-gray-500 mt-1">Clients actifs</p>
          <div className="mt-3 pt-3 border-t border-gray-50">
            <p className="text-[11px] text-gray-400">{data.clients.total} clients au total</p>
          </div>
        </div>

        {/* CA ce mois */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5 group">
          <div className="flex items-center justify-between mb-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
              </svg>
            </div>
            {data.factures.evolution_ca !== 0 && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                data.factures.evolution_ca > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'
              }`}>
                <svg className={`h-3 w-3 ${data.factures.evolution_ca < 0 ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
                </svg>
                {Math.abs(data.factures.evolution_ca)}%
              </span>
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatMontant(data.factures.ca_mois.montant)}</p>
          <p className="text-xs text-gray-500 mt-1">CA ce mois</p>
          <div className="mt-3 pt-3 border-t border-gray-50">
            <MiniBarChart data={data.factures.par_mois} />
          </div>
        </div>

        {/* Factures en attente */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-5 group">
          <div className="flex items-center justify-between mb-3">
            <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              {data.factures.en_attente.count} factures
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatMontant(data.factures.en_attente.montant)}</p>
          <p className="text-xs text-gray-500 mt-1">En attente de paiement</p>
          <div className="mt-3 pt-3 border-t border-gray-50">
            <p className="text-[11px] text-gray-400">{data.factures.payees_mois.count} payées ce mois ({formatMontant(data.factures.payees_mois.montant)})</p>
          </div>
        </div>

        {/* Impayés / retard */}
        <div className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all p-5 group ${
          data.factures.en_retard.count > 0 ? 'border-red-200' : 'border-gray-100'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
              data.factures.en_retard.count > 0 ? 'bg-red-50' : 'bg-gray-50'
            }`}>
              <svg className={`h-5 w-5 ${data.factures.en_retard.count > 0 ? 'text-red-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            {data.factures.en_retard.count > 0 && (
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
            )}
          </div>
          <p className={`text-2xl font-bold ${data.factures.en_retard.count > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {formatMontant(data.factures.en_retard.montant)}
          </p>
          <p className="text-xs text-gray-500 mt-1">Impayés en retard</p>
          <div className="mt-3 pt-3 border-t border-gray-50">
            <p className="text-[11px] text-gray-400">{data.factures.en_retard.count} facture{data.factures.en_retard.count > 1 ? 's' : ''} en retard</p>
          </div>
        </div>
      </div>

      {/* Section Devis + Contrats + Parc */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Devis */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center">
                <svg className="h-4 w-4 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Devis</h3>
            </div>
            <Link href="/dashboard/devis" className="text-xs text-violet-600 hover:text-violet-700 font-medium">
              Voir tout &rarr;
            </Link>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50/80">
              <div>
                <p className="text-lg font-bold text-gray-900">{data.devis.total_mois.count}</p>
                <p className="text-[11px] text-gray-500">Ce mois</p>
              </div>
              <p className="text-sm font-semibold text-gray-700">{formatMontant(data.devis.total_mois.montant)}</p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/50">
              <div>
                <p className="text-lg font-bold text-amber-700">{data.devis.en_attente.count}</p>
                <p className="text-[11px] text-gray-500">En attente</p>
              </div>
              <p className="text-sm font-semibold text-amber-700">{formatMontant(data.devis.en_attente.montant)}</p>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/50">
              <div>
                <p className="text-lg font-bold text-emerald-700">{data.devis.acceptes_mois.count}</p>
                <p className="text-[11px] text-gray-500">Acceptés ce mois</p>
              </div>
              <p className="text-sm font-semibold text-emerald-700">{formatMontant(data.devis.acceptes_mois.montant)}</p>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
            <span className="text-[11px] text-gray-400">Taux de conversion</span>
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min(data.devis.taux_conversion, 100)}%` }} />
              </div>
              <span className="text-xs font-bold text-violet-600">{data.devis.taux_conversion}%</span>
            </div>
          </div>
        </div>

        {/* Contrats */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Contrats</h3>
            </div>
            <Link href="/dashboard/contrats" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
              Voir tout &rarr;
            </Link>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 p-3 rounded-xl bg-gray-50/80 text-center">
              <p className="text-xl font-bold text-gray-900">{data.contrats.total_actifs}</p>
              <p className="text-[11px] text-gray-500">Actifs</p>
            </div>
            <div className="flex-1 p-3 rounded-xl bg-blue-50/50 text-center">
              <p className="text-xl font-bold text-blue-700">{formatMontant(data.contrats.ca_recurrent_mensuel)}</p>
              <p className="text-[11px] text-gray-500">CA récurrent/mois</p>
            </div>
          </div>
          <div className="space-y-2.5">
            <ContratTypeBar label="Copieur" count={data.contrats.par_type.Copieur || 0} total={totalContrats} color="bg-blue-500" />
            <ContratTypeBar label="Téléphonie" count={data.contrats.par_type.Telephonie || 0} total={totalContrats} color="bg-emerald-500" />
            <ContratTypeBar label="Informatique" count={data.contrats.par_type.Informatique || 0} total={totalContrats} color="bg-violet-500" />
            <ContratTypeBar label="Sécurité" count={data.contrats.par_type.Securite || 0} total={totalContrats} color="bg-amber-500" />
          </div>
          <div className="mt-4 pt-3 border-t border-gray-50 flex gap-3">
            {data.contrats.a_facturer_ce_mois > 0 && (
              <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                {data.contrats.a_facturer_ce_mois} à facturer
              </span>
            )}
            {data.contrats.echeance_3_mois > 0 && (
              <span className="text-[11px] font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
                {data.contrats.echeance_3_mois} échéance &lt;3 mois
              </span>
            )}
          </div>
        </div>

        {/* Parc Machines */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-cyan-50 flex items-center justify-center">
                <svg className="h-4 w-4 text-cyan-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M9.75 8.25h.008v.008H9.75V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Parc Machines</h3>
            </div>
            <Link href="/dashboard/parc-machines" className="text-xs text-cyan-600 hover:text-cyan-700 font-medium">
              Voir tout &rarr;
            </Link>
          </div>
          <div className="text-center mb-4">
            <p className="text-3xl font-bold text-gray-900">{data.parc.total}</p>
            <p className="text-xs text-gray-500">machines au total</p>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="p-2.5 rounded-xl bg-emerald-50/50 text-center">
              <p className="text-lg font-bold text-emerald-700">{data.parc.en_service}</p>
              <p className="text-[10px] text-gray-500">En service</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-50/50 text-center">
              <p className="text-lg font-bold text-blue-700">{data.parc.en_stock}</p>
              <p className="text-[10px] text-gray-500">En stock</p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50/50 text-center">
              <p className="text-lg font-bold text-amber-700">{data.parc.en_sav}</p>
              <p className="text-[10px] text-gray-500">En SAV</p>
            </div>
          </div>
          {data.parc.alertes_compteurs > 0 && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2.5">
              <div className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </div>
              <p className="text-xs text-red-700 font-medium">
                {data.parc.alertes_compteurs} machine{data.parc.alertes_compteurs > 1 ? 's' : ''} sans relevé depuis 90j+
              </p>
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-gray-50">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Produits au catalogue</span>
              <span className="text-xs font-bold text-gray-700">{data.catalogue.produits_actifs}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Factures récentes + Activité récente + Actions rapides */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Factures récentes */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Dernières factures</h3>
            </div>
            <Link href="/dashboard/factures" className="text-xs text-amber-600 hover:text-amber-700 font-medium">
              Voir tout &rarr;
            </Link>
          </div>
          {data.factures.recentes.length === 0 ? (
            <div className="text-center py-8">
              <div className="h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <svg className="h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12H9.75m0 0-3-3m3 3 3-3M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">Aucune facture pour le moment</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50">
                    <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider pb-3 pr-4">N°</th>
                    <th className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider pb-3 pr-4">Client</th>
                    <th className="text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider pb-3 pr-4">Montant</th>
                    <th className="text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider pb-3 pr-4">Statut</th>
                    <th className="text-right text-[11px] font-semibold text-gray-400 uppercase tracking-wider pb-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.factures.recentes.map(f => (
                    <tr key={f.id} className="group hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 pr-4">
                        <Link href={`/dashboard/factures/${f.id}`} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                          {f.numero_facture}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-xs text-gray-700 font-medium truncate max-w-[200px]">{f.client_raison_sociale}</p>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <p className="text-xs font-semibold text-gray-900">{formatMontantPrecis(parseFloat(String(f.total_ttc)))}</p>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUT_FACTURE_COLORS[f.statut] || 'bg-gray-100 text-gray-600'}`}>
                          {f.statut}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <p className="text-[11px] text-gray-400">{new Date(f.date_creation).toLocaleDateString('fr-FR')}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Activité récente */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">Activité récente</h3>
            </div>
            <Link href="/dashboard/journal" className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              Journal &rarr;
            </Link>
          </div>
          {data.activite.actions_aujourdhui > 0 && (
            <div className="mb-3 p-2 rounded-lg bg-indigo-50/50 text-center">
              <p className="text-xs text-indigo-600 font-medium">{data.activite.actions_aujourdhui} action{data.activite.actions_aujourdhui > 1 ? 's' : ''} aujourd&apos;hui</p>
            </div>
          )}
          {data.activite.recentes.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400">Aucune activité récente</p>
            </div>
          ) : (
            <div className="space-y-1">
              {data.activite.recentes.slice(0, 6).map(a => {
                const moduleStyle = MODULE_ICONS[a.module] || 'text-gray-500 bg-gray-50';
                return (
                  <div key={a.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-gray-50/50 transition-colors">
                    <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${moduleStyle}`}>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-gray-700 font-medium leading-snug truncate">{a.description}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-gray-400">{a.user_nom}</span>
                        <span className="text-gray-200">&middot;</span>
                        <span className="text-[10px] text-gray-400">{timeAgo(a.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Actions rapides */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center">
            <svg className="h-4 w-4 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-gray-900">Actions rapides</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Nouveau client', href: '/dashboard/clients/nouveau', icon: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z', color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
            { label: 'Nouveau devis', href: '/dashboard/devis/nouveau', icon: 'M12 4.5v15m7.5-7.5h-15', color: 'text-violet-600 bg-violet-50 hover:bg-violet-100' },
            { label: 'Nouvelle facture', href: '/dashboard/factures/nouveau', icon: 'M12 4.5v15m7.5-7.5h-15', color: 'text-amber-600 bg-amber-50 hover:bg-amber-100' },
            { label: 'Nouveau contrat', href: '/dashboard/contrats/nouveau', icon: 'M12 4.5v15m7.5-7.5h-15', color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' },
            { label: 'Nouvelle machine', href: '/dashboard/parc-machines/nouveau', icon: 'M12 4.5v15m7.5-7.5h-15', color: 'text-cyan-600 bg-cyan-50 hover:bg-cyan-100' },
            { label: 'Catalogue', href: '/dashboard/catalogue', icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z', color: 'text-orange-600 bg-orange-50 hover:bg-orange-100' },
          ].map(action => (
            <Link
              key={action.href}
              href={action.href}
              className={`flex flex-col items-center gap-2.5 p-4 rounded-xl transition-all duration-200 group ${action.color}`}
            >
              <div className="h-10 w-10 rounded-xl bg-white/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d={action.icon} />
                </svg>
              </div>
              <p className="text-xs font-semibold text-center">{action.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
