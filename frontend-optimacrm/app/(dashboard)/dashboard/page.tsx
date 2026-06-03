'use client';

import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import Link from 'next/link';
import { useEffect, useState, useCallback, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatValue { count: number; montant: number }
interface MoisData { mois: string; montant: number; count: number }
interface MoisCount { mois: string; count: number }
interface FactureRecente {
  id: number; numero_facture: string; client_raison_sociale: string;
  total_ttc: number; net_a_payer: number; statut: string;
  date_creation: string; date_echeance: string;
}
interface ActivityRecente {
  id: number; action: string; module: string; description: string;
  user_nom: string; entity_label: string; created_at: string;
}
interface TopClient {
  id: number; raison_sociale: string; numero_client: string;
  ca_total: number; nb_factures: number;
}
interface DashboardData {
  clients: { total: number; actifs: number; nouveaux_mois: number; par_mois: MoisCount[] };
  factures: {
    ca_mois: StatValue; evolution_ca: number; en_attente: StatValue;
    en_retard: StatValue; payees_mois: StatValue; brouillons: StatValue;
    recentes: FactureRecente[]; par_mois: MoisData[];
    par_statut: Record<string, { count: number; montant: number }>;
    ca_annuel: number; nb_factures_annuel: number;
    dso: number; taux_recouvrement: number;
  };
  devis: {
    total_mois: StatValue; en_attente: StatValue;
    acceptes_mois: StatValue; taux_conversion: number; par_mois: MoisData[];
  };
  contrats: {
    total_actifs: number; par_type: Record<string, number>;
    a_facturer_ce_mois: number; echeance_3_mois: number;
    ca_recurrent_mensuel: number;
    ca_par_type: Record<string, { ca_mensuel: number; nb_contrats: number }>;
  };
  parc: {
    total: number; en_service: number; en_stock: number;
    en_sav: number; alertes_compteurs: number;
    par_categorie: Record<string, number>;
  };
  catalogue: { produits_actifs: number };
  avoirs: { total: number; montant_total: number; ce_mois: number; montant_ce_mois: number };
  top_clients: TopClient[];
  activite: { recentes: ActivityRecente[]; actions_aujourdhui: number };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(v: number, precise = false) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: precise ? 2 : 0,
    maximumFractionDigits: precise ? 2 : 0,
  }).format(v);
}

function fmtNum(v: number) {
  return new Intl.NumberFormat('fr-FR').format(v);
}

function pct(v: number, total: number) {
  return total > 0 ? Math.round((v / total) * 100) : 0;
}

function moisLabel(mois: string, short = true) {
  const d = new Date(mois + '-01');
  return d.toLocaleDateString('fr-FR', { month: short ? 'short' : 'long' });
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Il y a ${days}j`;
}

// ---------------------------------------------------------------------------
// SVG Chart Components
// ---------------------------------------------------------------------------

function AreaChart({ data, height = 160, color = '#3b82f6', gradientId = 'areaGrad' }: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  gradientId?: string;
}) {
  const W = 100;
  const H = height;
  const padY = 8;
  const padX = 2;
  const max = Math.max(...data.map(d => d.value), 1);
  const usableW = W - padX * 2;
  const usableH = H - padY * 2;

  const points = data.map((d, i) => ({
    x: padX + (i / Math.max(data.length - 1, 1)) * usableW,
    y: padY + usableH - (d.value / max) * usableH,
    ...d,
  }));

  if (points.length < 2) return null;

  const lineD = points.map((p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    const cpx1 = prev.x + (p.x - prev.x) * 0.4;
    const cpx2 = prev.x + (p.x - prev.x) * 0.6;
    return `C ${cpx1} ${prev.y} ${cpx2} ${p.y} ${p.x} ${p.y}`;
  }).join(' ');

  const areaD = `${lineD} L ${points[points.length - 1].x} ${H} L ${points[0].x} ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: `${height}px` }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} />
      <path d={lineD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1.5" fill="white" stroke={color} strokeWidth="1">
          <title>{`${p.label}: ${fmt(p.value)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function DonutChart({ segments, size = 120, thickness = 18 }: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={thickness} />
      {segments.filter(s => s.value > 0).map((seg, i) => {
        const pctVal = seg.value / total;
        const dashLen = pctVal * circumference;
        const dashOffset = -offset * circumference + circumference * 0.25;
        offset += pctVal;
        return (
          <circle
            key={i}
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="transition-all duration-700"
          >
            <title>{`${seg.label}: ${seg.value}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function SparkLine({ data, color = '#3b82f6', h = 32 }: { data: number[]; color?: string; h?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 80;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - 4 - ((v / max) * (h - 8)),
  }));
  const d = pts.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-20" style={{ height: `${h}px` }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="2.5" fill={color} />
    </svg>
  );
}

function ProgressRing({ value, max, size = 48, color = '#3b82f6' }: { value: number; max: number; size?: number; color?: string }) {
  const r = (size - 6) / 2;
  const circumference = 2 * Math.PI * r;
  const p = max > 0 ? Math.min(value / max, 1) : 0;
  const dashLen = p * circumference;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={`${dashLen} ${circumference - dashLen}`}
        strokeLinecap="round"
        className="transition-all duration-1000"
      />
    </svg>
  );
}

function HorizontalBar({ segments }: { segments: { value: number; color: string; label: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return <div className="h-2.5 bg-gray-100 rounded-full" />;
  return (
    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
      {segments.filter(s => s.value > 0).map((seg, i) => (
        <div
          key={i}
          className="h-full transition-all duration-700 first:rounded-l-full last:rounded-r-full"
          style={{ width: `${(seg.value / total) * 100}%`, backgroundColor: seg.color }}
          title={`${seg.label}: ${seg.value}`}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub Components
// ---------------------------------------------------------------------------

const STATUT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Brouillon': { bg: 'bg-gray-50', text: 'text-gray-600', dot: '#9ca3af' },
  'Validée': { bg: 'bg-blue-50', text: 'text-blue-700', dot: '#3b82f6' },
  'Envoyée': { bg: 'bg-amber-50', text: 'text-amber-700', dot: '#f59e0b' },
  'Payée': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: '#10b981' },
  'Annulée': { bg: 'bg-red-50', text: 'text-red-600', dot: '#ef4444' },
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

const TYPE_CONTRAT_COLORS: Record<string, string> = {
  Copieur: '#3b82f6',
  Telephonie: '#10b981',
  Informatique: '#8b5cf6',
  Securite: '#f59e0b',
};

function KpiCard({ icon, label, value, sub, badge, badgeColor = 'emerald', sparkData, sparkColor, trend, trendLabel, href, alert }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  badge?: string;
  badgeColor?: string;
  sparkData?: number[];
  sparkColor?: string;
  trend?: number;
  trendLabel?: string;
  href?: string;
  alert?: boolean;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-50',
    red: 'text-red-600 bg-red-50',
    amber: 'text-amber-600 bg-amber-50',
    blue: 'text-blue-600 bg-blue-50',
  };
  const content = (
    <div className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all p-5 group ${alert ? 'border-red-200' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colorMap[badgeColor] || colorMap.emerald}`}>
              {badge}
            </span>
          )}
          {trend !== undefined && trend !== 0 && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${trend > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
              <svg className={`h-2.5 w-2.5 ${trend < 0 ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
              </svg>
              {Math.abs(trend)}%
            </span>
          )}
          {alert && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
          )}
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className={`text-2xl font-bold ${alert ? 'text-red-600' : 'text-gray-900'}`}>{value}</p>
          <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          {sub && <p className="text-[10px] text-gray-400 mt-1">{sub}</p>}
          {trendLabel && <p className="text-[10px] text-gray-400 mt-1">{trendLabel}</p>}
        </div>
        {sparkData && sparkData.length > 1 && (
          <SparkLine data={sparkData} color={sparkColor || '#3b82f6'} />
        )}
      </div>
    </div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

function SectionCard({ title, icon, href, hrefLabel, children, className = '' }: {
  title: string;
  icon: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {icon}
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        </div>
        {href && (
          <Link href={href} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
            {hrefLabel || 'Voir tout'} &rarr;
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setDenied(false);
      const res = await api.get<{ data: DashboardData }>('/dashboard/stats');
      setData(res.data);
      setLastRefresh(new Date());
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
      const interval = setInterval(fetchData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    } else if (user) {
      setLoading(false);
      setDenied(true);
    }
  }, [fetchData, user, hasPermission]);

  const chartData = useMemo(() => {
    if (!data) return null;
    return {
      caParMois: data.factures.par_mois.map(m => ({ label: moisLabel(m.mois), value: m.montant })),
      devisParMois: data.devis.par_mois.map(m => ({ label: moisLabel(m.mois), value: m.montant })),
      facturesSpark: data.factures.par_mois.map(m => m.montant),
      devisSpark: data.devis.par_mois.map(m => m.montant),
      clientsSpark: data.clients.par_mois.map(m => m.count),
    };
  }, [data]);

  if (!user || denied) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
  const initials = `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase();

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 bg-white rounded-2xl border border-gray-100" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-32 bg-white rounded-2xl border border-gray-100" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-72 bg-white rounded-2xl border border-gray-100" />)}
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

  if (!data || !chartData) return null;

  const totalContrats = Object.values(data.contrats.par_type).reduce((a, b) => a + b, 0);
  const statutOrder = ['Payée', 'Envoyée', 'Validée', 'Brouillon', 'Annulée'];
  const donutSegments = statutOrder
    .filter(s => data.factures.par_statut[s])
    .map(s => ({
      label: s,
      value: data.factures.par_statut[s]?.count || 0,
      color: STATUT_COLORS[s]?.dot || '#9ca3af',
    }));

  const totalFactures = donutSegments.reduce((s, seg) => s + seg.value, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
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
          <div className="flex items-center gap-4">
            {lastRefresh && (
              <button
                onClick={fetchData}
                className="text-[10px] text-slate-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Rafraîchir"
              >
                <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M4.031 9.865H.039" />
                </svg>
                Mis à jour {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </button>
            )}
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

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <KpiCard
          icon={<svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>}
          label="Clients actifs"
          value={String(data.clients.actifs)}
          badge={data.clients.nouveaux_mois > 0 ? `+${data.clients.nouveaux_mois} ce mois` : undefined}
          sub={`${data.clients.total} clients au total`}
          sparkData={chartData.clientsSpark}
          sparkColor="#3b82f6"
          href="/dashboard/clients"
        />
        <KpiCard
          icon={<svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>}
          label="CA ce mois"
          value={fmt(data.factures.ca_mois.montant)}
          trend={data.factures.evolution_ca}
          trendLabel={`${data.factures.ca_mois.count} factures émises`}
          sparkData={chartData.facturesSpark}
          sparkColor="#10b981"
          href="/dashboard/factures"
        />
        <KpiCard
          icon={<svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
          label="En attente de paiement"
          value={fmt(data.factures.en_attente.montant)}
          badge={`${data.factures.en_attente.count} factures`}
          badgeColor="amber"
          sub={`${data.factures.payees_mois.count} payées ce mois (${fmt(data.factures.payees_mois.montant)})`}
        />
        <KpiCard
          icon={<svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>}
          label="Impayés en retard"
          value={fmt(data.factures.en_retard.montant)}
          alert={data.factures.en_retard.count > 0}
          sub={`${data.factures.en_retard.count} facture${data.factures.en_retard.count > 1 ? 's' : ''} en retard`}
        />
        <KpiCard
          icon={<svg className="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>}
          label="CA annuel"
          value={fmt(data.factures.ca_annuel)}
          badge={`${data.factures.nb_factures_annuel} factures`}
          badgeColor="blue"
          sub={`DSO : ${data.factures.dso}j | Recouvrement : ${data.factures.taux_recouvrement}%`}
        />
      </div>

      {/* Charts Row: CA Evolution + Factures par statut + Indicateurs de perf */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* CA Evolution - 12 mois */}
        <SectionCard
          title="Évolution du CA"
          className="lg:col-span-7"
          icon={<div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center"><svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" /></svg></div>}
          href="/dashboard/factures"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-6 text-[11px] text-gray-400">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-blue-500 rounded-full" />
                Factures
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 bg-violet-400 rounded-full" />
                Devis
              </div>
            </div>
            <AreaChart
              data={chartData.caParMois}
              height={180}
              color="#3b82f6"
              gradientId="caGrad"
            />
            <div className="relative -mt-[180px]">
              <AreaChart
                data={chartData.devisParMois}
                height={180}
                color="#8b5cf6"
                gradientId="devisGrad"
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-400 px-1">
              {data.factures.par_mois.filter((_, i) => i % 2 === 0 || i === data.factures.par_mois.length - 1).map(m => (
                <span key={m.mois}>{moisLabel(m.mois)}</span>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Répartition Factures */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          <SectionCard
            title="Répartition factures"
            icon={<div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center"><svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z" /></svg></div>}
          >
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                <DonutChart segments={donutSegments} size={110} thickness={16} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-lg font-bold text-gray-900">{totalFactures}</p>
                  <p className="text-[9px] text-gray-400">factures</p>
                </div>
              </div>
              <div className="space-y-2 flex-1 min-w-0">
                {statutOrder.filter(s => data.factures.par_statut[s]).map(s => {
                  const stat = data.factures.par_statut[s];
                  const colors = STATUT_COLORS[s] || STATUT_COLORS['Brouillon'];
                  return (
                    <div key={s} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                      <span className="text-[11px] text-gray-600 truncate flex-1">{s}</span>
                      <span className="text-[11px] font-semibold text-gray-900">{stat.count}</span>
                      <span className="text-[10px] text-gray-400 w-10 text-right">{pct(stat.count, totalFactures)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </SectionCard>

          {/* Indicateurs de performance */}
          <SectionCard
            title="Performance"
            icon={<div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center"><svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg></div>}
          >
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className="relative inline-flex items-center justify-center">
                  <ProgressRing value={data.factures.taux_recouvrement} max={100} size={52} color="#10b981" />
                  <span className="absolute text-[10px] font-bold text-emerald-600">{data.factures.taux_recouvrement}%</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Recouvrement</p>
              </div>
              <div className="text-center">
                <div className="relative inline-flex items-center justify-center">
                  <ProgressRing value={data.devis.taux_conversion} max={100} size={52} color="#8b5cf6" />
                  <span className="absolute text-[10px] font-bold text-violet-600">{data.devis.taux_conversion}%</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Conv. devis</p>
              </div>
              <div className="text-center">
                <div className="relative inline-flex items-center justify-center">
                  <ProgressRing value={Math.min(data.factures.dso, 60)} max={60} size={52} color={data.factures.dso > 45 ? '#ef4444' : data.factures.dso > 30 ? '#f59e0b' : '#3b82f6'} />
                  <span className="absolute text-[10px] font-bold text-gray-700">{data.factures.dso}j</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">DSO</p>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Row: Devis + Contrats + Top Clients */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Devis */}
        <SectionCard
          title="Devis"
          icon={<div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center"><svg className="h-4 w-4 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg></div>}
          href="/dashboard/devis"
        >
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-gray-50/80 text-center">
                <p className="text-lg font-bold text-gray-900">{data.devis.total_mois.count}</p>
                <p className="text-[10px] text-gray-500">Ce mois</p>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50/50 text-center">
                <p className="text-lg font-bold text-amber-700">{data.devis.en_attente.count}</p>
                <p className="text-[10px] text-gray-500">En attente</p>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50/50 text-center">
                <p className="text-lg font-bold text-emerald-700">{data.devis.acceptes_mois.count}</p>
                <p className="text-[10px] text-gray-500">Acceptés</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Montant ce mois</span>
                <span className="font-semibold text-gray-900">{fmt(data.devis.total_mois.montant)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">En attente</span>
                <span className="font-semibold text-amber-700">{fmt(data.devis.en_attente.montant)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Acceptés ce mois</span>
                <span className="font-semibold text-emerald-700">{fmt(data.devis.acceptes_mois.montant)}</span>
              </div>
            </div>
            <div className="pt-3 border-t border-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-400">Taux de conversion</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full transition-all duration-700" style={{ width: `${Math.min(data.devis.taux_conversion, 100)}%` }} />
                  </div>
                  <span className="text-xs font-bold text-violet-600">{data.devis.taux_conversion}%</span>
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Contrats */}
        <SectionCard
          title="Contrats"
          icon={<div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center"><svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg></div>}
          href="/dashboard/contrats"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 p-2.5 rounded-xl bg-gray-50/80 text-center">
                <p className="text-xl font-bold text-gray-900">{data.contrats.total_actifs}</p>
                <p className="text-[10px] text-gray-500">Actifs</p>
              </div>
              <div className="flex-1 p-2.5 rounded-xl bg-blue-50/50 text-center">
                <p className="text-lg font-bold text-blue-700">{fmt(data.contrats.ca_recurrent_mensuel)}</p>
                <p className="text-[10px] text-gray-500">CA/mois</p>
              </div>
            </div>
            <HorizontalBar
              segments={[
                { value: data.contrats.par_type.Copieur || 0, color: '#3b82f6', label: 'Copieur' },
                { value: data.contrats.par_type.Telephonie || 0, color: '#10b981', label: 'Téléphonie' },
                { value: data.contrats.par_type.Informatique || 0, color: '#8b5cf6', label: 'Informatique' },
                { value: data.contrats.par_type.Securite || 0, color: '#f59e0b', label: 'Sécurité' },
              ]}
            />
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {Object.entries(data.contrats.par_type).filter(([, v]) => v > 0).map(([type, count]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_CONTRAT_COLORS[type] || '#9ca3af' }} />
                  <span className="text-[11px] text-gray-600 flex-1">{type}</span>
                  <span className="text-[11px] font-semibold text-gray-900">{count}</span>
                </div>
              ))}
            </div>
            {(data.contrats.a_facturer_ce_mois > 0 || data.contrats.echeance_3_mois > 0) && (
              <div className="pt-3 border-t border-gray-50 flex flex-wrap gap-2">
                {data.contrats.a_facturer_ce_mois > 0 && (
                  <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                    {data.contrats.a_facturer_ce_mois} à facturer
                  </span>
                )}
                {data.contrats.echeance_3_mois > 0 && (
                  <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
                    {data.contrats.echeance_3_mois} échéance &lt;3 mois
                  </span>
                )}
              </div>
            )}
          </div>
        </SectionCard>

        {/* Top Clients */}
        <SectionCard
          title="Top clients"
          icon={<div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center"><svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 0 1-3.52 1.122 6.023 6.023 0 0 1-3.52-1.122" /></svg></div>}
          href="/dashboard/clients"
          hrefLabel="Tous les clients"
        >
          {data.top_clients.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-400">Aucune donnée cette année</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {data.top_clients.map((client, i) => {
                const maxCA = data.top_clients[0]?.ca_total || 1;
                const barPct = pct(client.ca_total, maxCA);
                const medals = ['bg-amber-100 text-amber-700', 'bg-gray-100 text-gray-600', 'bg-orange-100 text-orange-700'];
                return (
                  <div key={client.id} className="group">
                    <div className="flex items-center gap-2.5 mb-1">
                      <span className={`text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center ${medals[i] || 'bg-gray-50 text-gray-500'}`}>
                        {i + 1}
                      </span>
                      <Link
                        href={`/dashboard/clients/${client.id}`}
                        className="text-[11px] text-gray-700 font-medium truncate flex-1 group-hover:text-blue-600 transition-colors"
                      >
                        {client.raison_sociale}
                      </Link>
                      <span className="text-[11px] font-bold text-gray-900">{fmt(client.ca_total)}</span>
                    </div>
                    <div className="ml-7">
                      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full transition-all duration-700" style={{ width: `${barPct}%` }} />
                      </div>
                      <p className="text-[9px] text-gray-400 mt-0.5">{client.nb_factures} facture{client.nb_factures > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Row: Parc Machines + Avoirs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Parc Machines */}
        <SectionCard
          title="Parc Machines"
          icon={<div className="h-8 w-8 rounded-lg bg-cyan-50 flex items-center justify-center"><svg className="h-4 w-4 text-cyan-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M9.75 8.25h.008v.008H9.75V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg></div>}
          href="/dashboard/parc-machines"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 text-center">
                <p className="text-3xl font-bold text-gray-900">{data.parc.total}</p>
                <p className="text-[10px] text-gray-500">machines au total</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-emerald-50/50 text-center">
                <p className="text-lg font-bold text-emerald-700">{data.parc.en_service}</p>
                <p className="text-[9px] text-gray-500">En service</p>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50/50 text-center">
                <p className="text-lg font-bold text-blue-700">{data.parc.en_stock}</p>
                <p className="text-[9px] text-gray-500">En stock</p>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50/50 text-center">
                <p className="text-lg font-bold text-amber-700">{data.parc.en_sav}</p>
                <p className="text-[9px] text-gray-500">En SAV</p>
              </div>
            </div>
            {Object.keys(data.parc.par_categorie).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Par catégorie</p>
                {Object.entries(data.parc.par_categorie).map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600">{cat}</span>
                    <span className="font-semibold text-gray-900">{count}</span>
                  </div>
                ))}
              </div>
            )}
            {data.parc.alertes_compteurs > 0 && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2.5">
                <div className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </div>
                <p className="text-[11px] text-red-700 font-medium">
                  {data.parc.alertes_compteurs} machine{data.parc.alertes_compteurs > 1 ? 's' : ''} sans relevé depuis 90j+
                </p>
              </div>
            )}
            <div className="pt-2 border-t border-gray-50 flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Produits au catalogue</span>
              <span className="text-xs font-bold text-gray-700">{data.catalogue.produits_actifs}</span>
            </div>
          </div>
        </SectionCard>

        {/* Synthèse financière */}
        <SectionCard
          title="Synthèse financière"
          icon={<div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center"><svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg></div>}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-100/50">
                <p className="text-[10px] text-emerald-600 font-medium mb-1">CA annuel</p>
                <p className="text-lg font-bold text-emerald-700">{fmt(data.factures.ca_annuel)}</p>
                <p className="text-[10px] text-emerald-500">{fmtNum(data.factures.nb_factures_annuel)} factures</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100/50">
                <p className="text-[10px] text-blue-600 font-medium mb-1">CA récurrent</p>
                <p className="text-lg font-bold text-blue-700">{fmt(data.contrats.ca_recurrent_mensuel)}</p>
                <p className="text-[10px] text-blue-500">{data.contrats.total_actifs} contrats actifs</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-100/50">
                <p className="text-[10px] text-amber-600 font-medium mb-1">Créances</p>
                <p className="text-lg font-bold text-amber-700">{fmt(data.factures.en_attente.montant)}</p>
                <p className="text-[10px] text-amber-500">{data.factures.en_attente.count} en attente</p>
              </div>
              <div className="p-3 rounded-xl bg-red-50/70 border border-red-100/50">
                <p className="text-[10px] text-red-600 font-medium mb-1">Impayés</p>
                <p className="text-lg font-bold text-red-700">{fmt(data.factures.en_retard.montant)}</p>
                <p className="text-[10px] text-red-500">{data.factures.en_retard.count} en retard</p>
              </div>
            </div>
            {(data.avoirs.total > 0 || data.factures.brouillons.count > 0) && (
              <div className="pt-3 border-t border-gray-50 space-y-2">
                {data.factures.brouillons.count > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-gray-400" />
                      <span className="text-gray-600">{data.factures.brouillons.count} brouillon{data.factures.brouillons.count > 1 ? 's' : ''}</span>
                    </div>
                    <span className="font-semibold text-gray-700">{fmt(data.factures.brouillons.montant)}</span>
                  </div>
                )}
                {data.avoirs.total > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-rose-400" />
                      <span className="text-gray-600">{data.avoirs.total} avoir{data.avoirs.total > 1 ? 's' : ''}</span>
                    </div>
                    <span className="font-semibold text-rose-600">-{fmt(data.avoirs.montant_total)}</span>
                  </div>
                )}
                {data.avoirs.ce_mois > 0 && (
                  <p className="text-[10px] text-gray-400">
                    Ce mois : {data.avoirs.ce_mois} avoir{data.avoirs.ce_mois > 1 ? 's' : ''} (-{fmt(data.avoirs.montant_ce_mois)})
                  </p>
                )}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Row: Factures récentes + Activité récente */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Factures récentes */}
        <SectionCard
          title="Dernières factures"
          className="lg:col-span-2"
          icon={<div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center"><svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg></div>}
          href="/dashboard/factures"
        >
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
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider pb-2.5 pr-4">N°</th>
                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider pb-2.5 pr-4">Client</th>
                    <th className="text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider pb-2.5 pr-4">Montant</th>
                    <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider pb-2.5 pr-4">Statut</th>
                    <th className="text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider pb-2.5">Échéance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.factures.recentes.map(f => {
                    const isOverdue = f.statut !== 'Payée' && f.statut !== 'Annulée' && new Date(f.date_echeance) < new Date();
                    const colors = STATUT_COLORS[f.statut] || STATUT_COLORS['Brouillon'];
                    return (
                      <tr key={f.id} className="group hover:bg-gray-50/50 transition-colors">
                        <td className="py-2.5 pr-4">
                          <Link href={`/dashboard/factures/${f.id}`} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                            {f.numero_facture}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-4">
                          <p className="text-xs text-gray-700 font-medium truncate max-w-[180px]">{f.client_raison_sociale}</p>
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          <p className="text-xs font-semibold text-gray-900">{fmt(parseFloat(String(f.total_ttc)), true)}</p>
                        </td>
                        <td className="py-2.5 pr-4 text-center">
                          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                            {f.statut}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">
                          <p className={`text-[11px] ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                            {new Date(f.date_echeance).toLocaleDateString('fr-FR')}
                            {isOverdue && ' !'}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* Activité récente */}
        <SectionCard
          title="Activité récente"
          icon={<div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center"><svg className="h-4 w-4 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg></div>}
          href="/dashboard/journal"
          hrefLabel="Journal"
        >
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
            <div className="space-y-0.5 max-h-[320px] overflow-y-auto">
              {data.activite.recentes.slice(0, 8).map(a => {
                const moduleStyle = MODULE_ICONS[a.module] || 'text-gray-500 bg-gray-50';
                return (
                  <div key={a.id} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-gray-50/50 transition-colors">
                    <div className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${moduleStyle}`}>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
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
        </SectionCard>
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
