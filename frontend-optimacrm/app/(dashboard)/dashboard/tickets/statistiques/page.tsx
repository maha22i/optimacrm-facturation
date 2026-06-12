'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type { TicketStats, ApiResponse } from '@/lib/types';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// ─── Couleurs cohérentes avec le reste du module ─────────────────────────────

const STATUT_COLORS: Record<string, { label: string; color: string }> = {
  nouveau:    { label: 'Nouveau',    color: '#3B82F6' },
  assigne:    { label: 'Assigné',    color: '#6366F1' },
  en_cours:   { label: 'En cours',   color: '#EAB308' },
  en_attente: { label: 'En attente', color: '#F97316' },
  resolu:     { label: 'Résolu',     color: '#10B981' },
  cloture:    { label: 'Clôturé',    color: '#9CA3AF' },
};

const PRIORITE_COLORS: Record<string, { label: string; color: string }> = {
  urgente: { label: 'Urgente', color: '#EF4444' },
  haute:   { label: 'Haute',   color: '#F97316' },
  normale: { label: 'Normale', color: '#3B82F6' },
  basse:   { label: 'Basse',   color: '#9CA3AF' },
};

type PeriodePreset = 'cette_semaine' | 'ce_mois' | 'ce_trimestre' | 'personnalise';

function getPresetDates(preset: PeriodePreset): { debut: string; fin: string } {
  const now = new Date();
  const fin = now.toISOString().split('T')[0];

  if (preset === 'cette_semaine') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diff);
    return { debut: monday.toISOString().split('T')[0], fin };
  }
  if (preset === 'ce_mois') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { debut: first.toISOString().split('T')[0], fin };
  }
  if (preset === 'ce_trimestre') {
    const qMonth = Math.floor(now.getMonth() / 3) * 3;
    const first = new Date(now.getFullYear(), qMonth, 1);
    return { debut: first.toISOString().split('T')[0], fin };
  }
  return { debut: '', fin: '' };
}

// ─── Tooltip personnalisé pour le Donut ──────────────────────────────────────

function DonutTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.payload.color }} />
        <span className="text-sm font-semibold text-gray-800">{d.name}</span>
      </div>
      <p className="text-lg font-bold text-gray-900 mt-0.5">{d.value} ticket{d.value > 1 ? 's' : ''}</p>
    </div>
  );
}

// ─── Tooltip personnalisé pour les barres ────────────────────────────────────

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: { fill: string } }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-lg px-4 py-2.5">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <p className="text-lg font-bold text-gray-900 mt-0.5">{payload[0].value} ticket{payload[0].value > 1 ? 's' : ''}</p>
    </div>
  );
}

// ─── Label au centre du donut ────────────────────────────────────────────────

function CenterLabel({ viewBox, total }: { viewBox?: { cx: number; cy: number }; total: number }) {
  if (!viewBox) return null;
  const { cx, cy } = viewBox;
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan x={cx} y={cy - 8} className="fill-gray-900 text-2xl font-bold">{total}</tspan>
      <tspan x={cx} y={cy + 14} className="fill-gray-400 text-xs">tickets</tspan>
    </text>
  );
}

export default function TicketStatistiquesPage() {
  const router = useRouter();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin';
  const isAdminTechnique = user?.role === 'admin_technique';
  const canView = isAdmin || isAdminTechnique;

  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [preset, setPreset] = useState<PeriodePreset>('ce_mois');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  useEffect(() => {
    if (!canView) {
      router.replace('/dashboard/tickets');
    }
  }, [canView, router]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let debut = dateDebut;
      let fin = dateFin;

      if (preset !== 'personnalise') {
        const d = getPresetDates(preset);
        debut = d.debut;
        fin = d.fin;
      }

      const params = new URLSearchParams();
      if (debut) params.set('date_debut', debut);
      if (fin) params.set('date_fin', fin);

      const qs = params.toString();
      const res = await api.get<ApiResponse<TicketStats>>(`/tickets/stats${qs ? `?${qs}` : ''}`);
      setStats(res.data);
    } catch {
      setError('Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
    }
  }, [preset, dateDebut, dateFin]);

  useEffect(() => {
    if (canView) fetchStats();
  }, [fetchStats, canView]);

  if (!canView) return null;

  // ─── Données transformées pour les graphiques ──────────────────────────────

  const statutData = stats
    ? Object.entries(STATUT_COLORS)
        .map(([key, cfg]) => ({
          name: cfg.label,
          value: stats.par_statut[key] || 0,
          color: cfg.color,
        }))
        .filter(d => d.value > 0)
    : [];

  const prioriteData = stats
    ? Object.entries(PRIORITE_COLORS).map(([key, cfg]) => ({
        name: cfg.label,
        value: stats.par_priorite[key] || 0,
        fill: cfg.color,
      }))
    : [];

  const categorieData = stats?.par_categorie || [];

  const hasData = stats && stats.total > 0;

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push('/dashboard/tickets')}
            className="mt-1 p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25 shrink-0">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Statistiques Tickets</h1>
            <p className="mt-0.5 text-sm text-gray-500">Tableau de bord de performance support</p>
          </div>
        </div>
        <button
          onClick={fetchStats}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition-all cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
          Actualiser
        </button>
      </div>

      {/* Filtre période */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-gray-700">Période :</span>
          <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
            {([
              { key: 'cette_semaine', label: 'Cette semaine' },
              { key: 'ce_mois', label: 'Ce mois' },
              { key: 'ce_trimestre', label: 'Ce trimestre' },
              { key: 'personnalise', label: 'Personnalisé' },
            ] as { key: PeriodePreset; label: string }[]).map(p => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  preset === p.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'personnalise' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400">Du</span>
              <input
                type="date"
                value={dateDebut}
                onChange={e => setDateDebut(e.target.value)}
                className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2 text-sm focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
              />
              <span className="text-xs text-gray-400">au</span>
              <input
                type="date"
                value={dateFin}
                onChange={e => setDateFin(e.target.value)}
                className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2 text-sm focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 outline-none transition"
              />
              <button
                onClick={fetchStats}
                className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:shadow-md transition cursor-pointer"
              >
                Appliquer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-32">
          <div className="animate-spin h-10 w-10 border-[3px] border-purple-600 border-t-transparent rounded-full" />
          <p className="mt-4 text-sm text-gray-400">Chargement des statistiques...</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <button onClick={fetchStats} className="mt-3 text-sm font-semibold text-red-700 hover:text-red-800 cursor-pointer">
            Réessayer
          </button>
        </div>
      )}

      {/* État vide */}
      {!loading && !error && !hasData && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
          <div className="mx-auto h-24 w-24 rounded-3xl bg-gradient-to-br from-purple-50 to-indigo-100 flex items-center justify-center mb-6">
            <svg className="h-12 w-12 text-purple-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-gray-700">Aucune donnée disponible</p>
          <p className="text-sm text-gray-400 mt-1">Aucun ticket ne correspond à la période sélectionnée</p>
        </div>
      )}

      {/* Contenu statistiques */}
      {!loading && !error && hasData && stats && (
        <div className="space-y-8">
          {/* Ligne 1 — KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total tickets</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center">
                  <span className="text-lg">🔴</span>
                </div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">SLA dépassés</p>
              </div>
              <p className={`text-3xl font-bold ${stats.sla_depasses > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {stats.sla_depasses}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Temps moyen prise en charge</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {stats.temps_moyen_prise_en_charge_heures > 0
                  ? `${stats.temps_moyen_prise_en_charge_heures}h`
                  : '—'}
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Temps moyen résolution</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {stats.temps_moyen_resolution_heures > 0
                  ? `${stats.temps_moyen_resolution_heures}h`
                  : '—'}
              </p>
            </div>
          </div>

          {/* Ligne 2 — Graphiques côte à côte */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Donut par statut */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-900 mb-6">Répartition par statut</h2>
              {statutData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={statutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={3}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {statutData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                      <CenterLabel total={stats.total} />
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string, entry) => {
                        const item = statutData.find(d => d.name === value);
                        return (
                          <span className="text-xs text-gray-600">
                            {value} <span className="font-bold text-gray-900 ml-1">{item?.value}</span>
                          </span>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[320px] flex items-center justify-center text-sm text-gray-400">
                  Aucune donnée
                </div>
              )}
            </div>

            {/* Barres par priorité */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-base font-bold text-gray-900 mb-6">Répartition par priorité</h2>
              {prioriteData.some(d => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart
                    data={prioriteData}
                    layout="vertical"
                    margin={{ top: 0, right: 40, bottom: 0, left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={80}
                      tick={{ fontSize: 13, fill: '#374151', fontWeight: 600 }}
                    />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: '#f9fafb' }} />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={32} label={{ position: 'right', fontSize: 13, fontWeight: 700, fill: '#374151' }}>
                      {prioriteData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[320px] flex items-center justify-center text-sm text-gray-400">
                  Aucune donnée
                </div>
              )}
            </div>
          </div>

          {/* Ligne 3 — Performance par technicien */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <span>👥</span> Performance par technicien
              </h2>
            </div>
            {stats.par_technicien.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                      <th className="px-6 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Technicien</th>
                      <th className="px-6 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Tickets ouverts</th>
                      <th className="px-6 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Résolus ce mois</th>
                      <th className="px-6 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Taux résolution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {stats.par_technicien.map(tech => {
                      const total = tech.ouverts + tech.resolus_ce_mois;
                      const taux = total > 0 ? Math.round((tech.resolus_ce_mois / total) * 100) : 0;
                      const barColor = taux >= 80 ? 'bg-emerald-500' : taux >= 50 ? 'bg-amber-500' : 'bg-red-500';

                      return (
                        <tr key={tech.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                                {tech.nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                              </div>
                              <span className="text-sm font-semibold text-gray-900">{tech.nom}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center justify-center h-7 min-w-[28px] px-2 rounded-full text-xs font-bold ${
                              tech.ouverts > 5 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'
                            }`}>
                              {tech.ouverts}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-sm font-bold text-gray-900">{tech.resolus_ce_mois}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden max-w-[160px]">
                                <div
                                  className={`h-full rounded-full ${barColor} transition-all duration-500`}
                                  style={{ width: `${taux}%` }}
                                />
                              </div>
                              <span className="text-sm font-bold text-gray-700 w-10 text-right">{taux}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400">Aucun technicien avec des tickets assignés</p>
              </div>
            )}
          </div>

          {/* Ligne 4 — Par catégorie */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-6">Répartition par catégorie</h2>
            {categorieData.length > 0 && categorieData.some(c => c.count > 0) ? (
              <ResponsiveContainer width="100%" height={Math.max(250, categorieData.length * 50)}>
                <BarChart
                  data={categorieData.filter(c => c.count > 0)}
                  margin={{ top: 0, right: 40, bottom: 0, left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis
                    dataKey="nom"
                    tick={{ fontSize: 12, fill: '#374151', fontWeight: 500 }}
                    interval={0}
                    angle={categorieData.length > 6 ? -30 : 0}
                    textAnchor={categorieData.length > 6 ? 'end' : 'middle'}
                    height={categorieData.length > 6 ? 80 : 40}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: '#f9fafb' }} />
                  <Bar
                    dataKey="count"
                    radius={[8, 8, 0, 0]}
                    barSize={40}
                    label={{ position: 'top', fontSize: 13, fontWeight: 700, fill: '#374151' }}
                  >
                    {categorieData.filter(c => c.count > 0).map((entry, idx) => (
                      <Cell key={idx} fill={entry.couleur || '#6366F1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-sm text-gray-400">
                Aucune donnée par catégorie
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
