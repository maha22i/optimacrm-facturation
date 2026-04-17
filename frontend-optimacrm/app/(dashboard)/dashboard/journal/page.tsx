'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';

interface ActivityLog {
  id: number;
  user_id: number | null;
  user_nom: string;
  action: string;
  module: string;
  description: string;
  entity_type: string | null;
  entity_id: number | null;
  entity_label: string | null;
  details: Record<string, unknown>;
  statut: string;
  ip_address: string | null;
  created_at: string;
}

interface Stats {
  total: number;
  aujourd_hui: number;
  cette_semaine: number;
  ce_mois: number;
  par_module: Record<string, number>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const MODULE_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  clients:        { label: 'Clients',       color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       dot: 'bg-blue-500' },
  contrats:       { label: 'Contrats',      color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200',   dot: 'bg-violet-500' },
  catalogue:      { label: 'Catalogue',     color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  parc_machines:  { label: 'Parc Machine',  color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200',   dot: 'bg-orange-500' },
  releves:        { label: 'Relevés',       color: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200',       dot: 'bg-cyan-500' },
  devis:          { label: 'Devis',         color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200',   dot: 'bg-indigo-500' },
  factures:       { label: 'Factures',      color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         dot: 'bg-red-500' },
  parametres:     { label: 'Paramètres',    color: 'text-gray-700',    bg: 'bg-gray-50 border-gray-200',       dot: 'bg-gray-500' },
  utilisateurs:   { label: 'Utilisateurs',  color: 'text-gray-700',    bg: 'bg-gray-50 border-gray-200',       dot: 'bg-gray-500' },
};

const ALL_MODULES = Object.keys(MODULE_CONFIG);

function getActionColor(action: string): string {
  if (action.includes('supprim') || action.includes('delete')) return 'bg-red-500';
  if (action.includes('modifi') || action.includes('update') || action === 'devis_envoye' || action === 'facture_envoyee') return 'bg-blue-500';
  if (action.includes('erreur') || action === 'partiel') return 'bg-amber-500';
  if (action === 'connexion' || action === 'deconnexion') return 'bg-gray-400';
  return 'bg-emerald-500';
}

function getStatutIcon(statut: string) {
  if (statut === 'erreur') return <span className="text-red-500">&#10060;</span>;
  if (statut === 'partiel') return <span className="text-amber-500">&#9888;</span>;
  if (statut === 'annule') return <span className="text-gray-400">&#8856;</span>;
  return <span className="text-emerald-500">&#10003;</span>;
}

function getEntityLink(entityType: string | null, entityId: number | null): string | null {
  if (!entityType || !entityId) return null;
  const map: Record<string, string> = {
    client: `/dashboard/clients/${entityId}`,
    contrat: `/dashboard/contrats/${entityId}`,
    produit: `/dashboard/catalogue/${entityId}`,
    machine: `/dashboard/parc-machines/${entityId}`,
    devis: `/dashboard/devis/${entityId}`,
    facture: `/dashboard/factures/${entityId}`,
  };
  return map[entityType] || null;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (dateOnly.getTime() === today.getTime()) return "Aujourd'hui";
  if (dateOnly.getTime() === yesterday.getTime()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function groupByDay(logs: ActivityLog[]): Record<string, ActivityLog[]> {
  const groups: Record<string, ActivityLog[]> = {};
  for (const log of logs) {
    const key = formatDate(log.created_at);
    if (!groups[key]) groups[key] = [];
    groups[key].push(log);
  }
  return groups;
}

export default function JournalPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);

  const [moduleFilter, setModuleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');
  const [statutFilter, setStatutFilter] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');
  const [expandedLog, setExpandedLog] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '50');
      if (moduleFilter) params.set('module', moduleFilter);
      if (statutFilter) params.set('statut', statutFilter);
      if (dateDebut) params.set('date_debut', dateDebut);
      if (dateFin) params.set('date_fin', dateFin);
      if (searchDebounce) params.set('search', searchDebounce);

      const res = await api.get<{ data: ActivityLog[]; pagination: Pagination }>(`/activity-logs?${params}`);
      setLogs(res.data);
      setPagination(res.pagination);
    } catch (err) {
      console.error('Erreur chargement logs:', err);
    } finally {
      setLoading(false);
    }
  }, [moduleFilter, statutFilter, dateDebut, dateFin, searchDebounce]);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (moduleFilter) params.set('module', moduleFilter);
      if (dateDebut) params.set('date_debut', dateDebut);
      if (dateFin) params.set('date_fin', dateFin);
      if (searchDebounce) params.set('search', searchDebounce);

      const res = await api.get<{ data: Stats }>(`/activity-logs/stats?${params}`);
      setStats(res.data);
    } catch (err) {
      console.error('Erreur chargement stats:', err);
    }
  }, [moduleFilter, dateDebut, dateFin, searchDebounce]);

  useEffect(() => {
    fetchLogs(1);
    fetchStats();
  }, [fetchLogs, fetchStats]);

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('limit', '10000');
      if (moduleFilter) params.set('module', moduleFilter);
      if (statutFilter) params.set('statut', statutFilter);
      if (dateDebut) params.set('date_debut', dateDebut);
      if (dateFin) params.set('date_fin', dateFin);
      if (searchDebounce) params.set('search', searchDebounce);

      const res = await api.get<{ data: ActivityLog[] }>(`/activity-logs?${params}`);
      const rows = res.data;

      const header = 'Date;Utilisateur;Module;Action;Description;Statut\n';
      const csv = header + rows.map(r =>
        `${new Date(r.created_at).toLocaleString('fr-FR')};${r.user_nom};${r.module};${r.action};${r.description.replace(/;/g, ',')};${r.statut}`
      ).join('\n');

      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `journal_activite_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erreur export:', err);
    }
  };

  const grouped = groupByDay(logs);

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Journal d&apos;activité</h1>
            <p className="text-sm text-gray-500">Historique de toutes les actions sur OptimaCRM</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${viewMode === 'timeline' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${viewMode === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Tableau
            </button>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all cursor-pointer shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Exporter
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Aujourd'hui", value: stats.aujourd_hui, gradient: 'from-blue-500 to-blue-600' },
            { label: 'Cette semaine', value: stats.cette_semaine, gradient: 'from-indigo-500 to-indigo-600' },
            { label: 'Ce mois', value: stats.ce_mois, gradient: 'from-violet-500 to-violet-600' },
            { label: 'Total', value: stats.total, gradient: 'from-gray-600 to-gray-700' },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{card.label}</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{card.value.toLocaleString('fr-FR')}</p>
            </div>
          ))}
        </div>
      )}

      {/* Module Pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setModuleFilter(''); }}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${!moduleFilter ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
        >
          Tous{stats ? ` (${stats.total})` : ''}
        </button>
        {ALL_MODULES.map(mod => {
          const cfg = MODULE_CONFIG[mod];
          const count = stats?.par_module[mod] || 0;
          return (
            <button
              key={mod}
              onClick={() => setModuleFilter(moduleFilter === mod ? '' : mod)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${moduleFilter === mod ? `${cfg.bg} ${cfg.color} border-current` : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
            >
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              placeholder="Rechercher dans le journal..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg bg-gray-50 border border-gray-200 py-2 pl-10 pr-4 text-sm text-gray-700 placeholder-gray-400 focus:bg-white focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all"
            />
          </div>
          <select
            value={statutFilter}
            onChange={e => setStatutFilter(e.target.value)}
            className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:bg-white focus:border-blue-300 outline-none cursor-pointer"
          >
            <option value="">Tous les statuts</option>
            <option value="succes">Succès</option>
            <option value="erreur">Erreur</option>
            <option value="partiel">Partiel</option>
            <option value="annule">Annulé</option>
          </select>
          <input
            type="date"
            value={dateDebut}
            onChange={e => setDateDebut(e.target.value)}
            className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:bg-white focus:border-blue-300 outline-none cursor-pointer"
            placeholder="Date début"
          />
          <input
            type="date"
            value={dateFin}
            onChange={e => setDateFin(e.target.value)}
            className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:bg-white focus:border-blue-300 outline-none cursor-pointer"
            placeholder="Date fin"
          />
          {(search || statutFilter || dateDebut || dateFin || moduleFilter) && (
            <button
              onClick={() => { setSearch(''); setStatutFilter(''); setDateDebut(''); setDateFin(''); setModuleFilter(''); }}
              className="px-3 py-2 text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="h-10 w-10 rounded-full border-[3px] border-blue-500/20" />
              <div className="absolute inset-0 h-10 w-10 rounded-full border-[3px] border-transparent border-t-blue-400 animate-spin" />
            </div>
            <p className="text-sm text-gray-500">Chargement du journal...</p>
          </div>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gray-100 mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">Aucune activité trouvée</h3>
          <p className="text-sm text-gray-500">Les actions effectuées dans l&apos;application apparaîtront ici.</p>
        </div>
      ) : viewMode === 'timeline' ? (
        /* ============== TIMELINE VIEW ============== */
        <div className="space-y-8">
          {Object.entries(grouped).map(([dateLabel, dayLogs]) => (
            <div key={dateLabel}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{dateLabel}</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <div className="relative pl-8">
                <div className="absolute left-[11px] top-2 bottom-2 w-[2px] bg-gray-100" />

                <div className="space-y-4">
                  {dayLogs.map(log => {
                    const modCfg = MODULE_CONFIG[log.module] || MODULE_CONFIG.parametres;
                    const actionColor = getActionColor(log.action);
                    const entityLink = getEntityLink(log.entity_type, log.entity_id);
                    const isExpanded = expandedLog === log.id;
                    const hasDetails = log.details && Object.keys(log.details).length > 0;

                    return (
                      <div key={log.id} className="relative">
                        <div className={`absolute -left-8 top-4 w-[10px] h-[10px] rounded-full ${actionColor} ring-[3px] ring-white`} />

                        <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all overflow-hidden">
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                  <span className="text-xs font-medium text-gray-400">{formatTime(log.created_at)}</span>
                                  <span className="text-xs text-gray-300">•</span>
                                  <span className="text-xs font-semibold text-gray-700">{log.user_nom || 'Système'}</span>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${modCfg.bg} ${modCfg.color}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${modCfg.dot}`} />
                                    {modCfg.label}
                                  </span>
                                  {log.statut !== 'succes' && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${log.statut === 'erreur' ? 'bg-red-50 text-red-700 border-red-200' : log.statut === 'partiel' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                      {log.statut}
                                    </span>
                                  )}
                                </div>

                                <p className="text-sm text-gray-800 font-medium leading-relaxed">
                                  {entityLink && log.entity_label ? (
                                    <>
                                      {log.description.split(log.entity_label)[0]}
                                      <Link href={entityLink} className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 hover:decoration-blue-400 transition-colors">
                                        {log.entity_label}
                                      </Link>
                                      {log.description.split(log.entity_label).slice(1).join(log.entity_label)}
                                    </>
                                  ) : (
                                    log.description
                                  )}
                                </p>

                                {log.details && (
                                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                                    {log.details.lignes_total !== undefined && <span>{String(log.details.lignes_total)} lignes</span>}
                                    {log.details.lignes_erreur !== undefined && Number(log.details.lignes_erreur) > 0 && (
                                      <span className="text-red-400">{String(log.details.lignes_erreur)} erreur(s)</span>
                                    )}
                                    {log.details.depassements !== undefined && Number(log.details.depassements) > 0 && (
                                      <span className="text-amber-500">{String(log.details.depassements)} dépassement(s)</span>
                                    )}
                                    {log.details.montant_total !== undefined && Number(log.details.montant_total) > 0 && (
                                      <span className="font-medium text-gray-500">{Number(log.details.montant_total).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € HT</span>
                                    )}
                                    {log.details.montant_ht !== undefined && (
                                      <span className="font-medium text-gray-500">{Number(log.details.montant_ht).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € HT</span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                {getStatutIcon(log.statut)}
                                {hasDetails && (
                                  <button
                                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                                    className="ml-1 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all cursor-pointer"
                                    title="Voir les détails"
                                  >
                                    <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>

                          {isExpanded && hasDetails && (
                            <div className="border-t border-gray-50 bg-gray-50/50 p-4">
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Détails</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {Object.entries(log.details).map(([key, val]) => (
                                  <div key={key} className="bg-white rounded-lg px-3 py-2 border border-gray-100">
                                    <p className="text-[10px] text-gray-400 font-medium">{key.replace(/_/g, ' ')}</p>
                                    <p className="text-xs text-gray-700 font-semibold truncate">
                                      {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—')}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ============== TABLE VIEW ============== */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Date/Heure</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Utilisateur</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Module</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="text-center px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(log => {
                  const modCfg = MODULE_CONFIG[log.module] || MODULE_CONFIG.parametres;
                  const entityLink = getEntityLink(log.entity_type, log.entity_id);
                  return (
                    <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleDateString('fr-FR')}<br />
                        <span className="text-gray-400">{formatTime(log.created_at)}</span>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-gray-700 whitespace-nowrap">{log.user_nom || 'Système'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${modCfg.bg} ${modCfg.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${modCfg.dot}`} />
                          {modCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">{log.action.replace(/_/g, ' ')}</td>
                      <td className="px-4 py-3 text-xs text-gray-700 max-w-md">
                        {entityLink && log.entity_label ? (
                          <Link href={entityLink} className="text-blue-600 hover:underline">{log.description}</Link>
                        ) : (
                          log.description
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">{getStatutIcon(log.statut)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4">
          <p className="text-xs text-gray-500">
            Affichage de {((pagination.page - 1) * pagination.limit) + 1} à {Math.min(pagination.page * pagination.limit, pagination.total)} sur {pagination.total.toLocaleString('fr-FR')} entrées
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchLogs(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
            {pageNumbers().map((p, i) =>
              typeof p === 'string' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm">...</span>
              ) : (
                <button
                  key={p}
                  onClick={() => fetchLogs(p)}
                  className={`min-w-[32px] h-8 rounded-lg text-xs font-semibold transition-all cursor-pointer ${p === pagination.page ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-500/20' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => fetchLogs(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
