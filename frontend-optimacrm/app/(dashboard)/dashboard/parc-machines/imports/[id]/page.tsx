'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ImportReleve, ImportRapportErreur, ApiResponse } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} à ${dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1048576).toFixed(1)} Mo`;
}

function fmt(n: number | null | undefined) {
  if (n == null) return '0';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface ReleveRow {
  id: number;
  date_releve: string;
  machine_id: number;
  numero_serie: string;
  modele: string;
  raison_sociale: string;
  compteur_nb: number;
  compteur_couleur: number;
  volume_nb: number;
  volume_couleur: number;
  est_facture: boolean;
  facture_numero: string | null;
  facture_id: number | null;
}

interface FactureRow {
  id: number;
  numero_facture: string;
  date_creation: string;
  client_nom: string;
  total_ttc: number;
  statut: string;
  nb_releves_source: number;
}

type Tab = 'releves' | 'factures' | 'erreurs';

export default function ImportDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [imp, setImp] = useState<ImportReleve | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('releves');

  const [releves, setReleves] = useState<ReleveRow[]>([]);
  const [relevesLoading, setRelevesLoading] = useState(false);
  const [relevesPagination, setRelevesPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const [factures, setFactures] = useState<FactureRow[]>([]);
  const [facturesLoading, setFacturesLoading] = useState(false);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelCheckLoading, setCancelCheckLoading] = useState(false);
  const [blockingFactures, setBlockingFactures] = useState<FactureRow[]>([]);
  const [cancelMotif, setCancelMotif] = useState('');

  const loadImport = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<ImportReleve>>(`/imports-releves/${id}`);
      setImp(res.data);
    } catch {
      router.push('/dashboard/parc-machines/imports');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  const loadReleves = useCallback(async (page = 1) => {
    setRelevesLoading(true);
    try {
      const res = await api.get<ApiResponse<{ releves: ReleveRow[]; pagination: { page: number; totalPages: number; total: number } }>>(`/imports-releves/${id}/releves?page=${page}&limit=50`);
      setReleves(res.data.releves);
      setRelevesPagination(res.data.pagination);
    } catch { /* */ }
    finally { setRelevesLoading(false); }
  }, [id]);

  const loadFactures = useCallback(async () => {
    setFacturesLoading(true);
    try {
      const res = await api.get<ApiResponse<FactureRow[]>>(`/imports-releves/${id}/factures`);
      setFactures(res.data);
    } catch { /* */ }
    finally { setFacturesLoading(false); }
  }, [id]);

  useEffect(() => { loadImport(); }, [loadImport]);
  useEffect(() => {
    if (activeTab === 'releves') loadReleves();
    if (activeTab === 'factures') loadFactures();
  }, [activeTab, loadReleves, loadFactures]);

  const handleOpenCancel = async () => {
    setCancelCheckLoading(true);
    try {
      const res = await api.get<ApiResponse<FactureRow[]>>(`/imports-releves/${id}/factures`);
      setBlockingFactures(res.data || []);
    } catch {
      setBlockingFactures([]);
    } finally {
      setCancelCheckLoading(false);
      setShowCancelModal(true);
    }
  };

  const handleConfirmCancel = async () => {
    setCancelLoading(true);
    try {
      await api.delete(`/imports-releves/${id}`, { motif: cancelMotif });
      setShowCancelModal(false);
      setCancelMotif('');
      loadImport();
    } catch {
      alert('Erreur lors de l\'annulation');
    } finally {
      setCancelLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-10 w-10 border-[3px] border-violet-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!imp) return null;

  const erreurs: ImportRapportErreur[] = imp.rapport_erreurs || [];
  const isActif = imp.statut === 'Actif';

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'releves', label: 'Relevés créés', count: imp.nb_releves_crees },
    { key: 'factures', label: 'Factures générées', count: imp.nb_factures || 0 },
    { key: 'erreurs', label: 'Erreurs / Rapport', count: imp.nb_lignes_erreur },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <button onClick={() => router.push('/dashboard/parc-machines/imports')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3 transition cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Historique des imports
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            Import <span className="font-mono">{imp.numero_batch}</span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
              isActif ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
            }`}>
              <span className={`h-2 w-2 rounded-full ${isActif ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {isActif ? 'Actif' : 'Annulé'}
            </span>
          </h1>
        </div>
        {isActif && (
          <button onClick={handleOpenCancel} disabled={cancelCheckLoading} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer disabled:opacity-50">
            {cancelCheckLoading && <div className="h-4 w-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />}
            Annuler cet import
          </button>
        )}
      </div>

      {/* Infos card */}
      <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Fichier</p>
            <p className="font-medium text-gray-900">{imp.nom_fichier}</p>
            <p className="text-xs text-gray-500">{formatSize(imp.taille_fichier)} &bull; Hash: {imp.hash_fichier?.slice(0, 16)}...</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Import</p>
            <p className="font-medium text-gray-900">{formatDateTime(imp.date_import)}</p>
            <p className="text-xs text-gray-500">par {imp.user_nom || '—'}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Période couverte</p>
            <p className="font-medium text-gray-900">{formatDate(imp.periode_debut)} → {formatDate(imp.periode_fin)}</p>
          </div>
        </div>
        {!isActif && imp.date_annulation && (
          <div className="mt-4 p-3 rounded-xl border border-red-200 bg-red-50/50">
            <p className="text-sm font-semibold text-red-700">Import annulé le {formatDateTime(imp.date_annulation)}</p>
            {imp.motif_annulation && <p className="text-sm text-red-600 mt-1">Motif : {imp.motif_annulation}</p>}
          </div>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Lignes du fichier', value: imp.nb_lignes_fichier, color: 'text-gray-600', bg: 'bg-gray-100' },
          { label: 'Relevés créés', value: imp.nb_releves_crees, color: 'text-emerald-600', bg: 'bg-emerald-100' },
          { label: 'Doublons ignorés', value: imp.nb_lignes_ignorees, color: 'text-amber-600', bg: 'bg-amber-100' },
          { label: 'Erreurs', value: imp.nb_lignes_erreur, color: 'text-red-600', bg: 'bg-red-100' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs text-gray-400 uppercase tracking-wider">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
              activeTab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {(t.count ?? 0) > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === t.key ? 'bg-violet-100 text-violet-700' : 'bg-gray-200 text-gray-500'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Relevés */}
        {activeTab === 'releves' && (
          <>
            {relevesLoading ? (
              <div className="flex justify-center py-12"><div className="h-6 w-6 rounded-full border-2 border-violet-200 border-t-violet-600 animate-spin" /></div>
            ) : releves.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Aucun relevé pour cet import</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Date relevé</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Machine</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Client</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase text-right">Compteur NB</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase text-right">Compteur Couleur</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase text-right">Volume NB</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase text-right">Volume Couleur</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase text-center">Facturation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {releves.map(r => (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-violet-50/30 transition cursor-pointer" onClick={() => router.push(`/dashboard/parc-machines/${r.machine_id}`)}>
                          <td className="px-4 py-3 text-sm text-gray-900">{formatDate(r.date_releve)}</td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-mono font-medium text-gray-900">{r.numero_serie}</p>
                            {r.modele && <p className="text-xs text-gray-400">{r.modele}</p>}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{r.raison_sociale || '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right font-mono">{(r.compteur_nb || 0).toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right font-mono">{(r.compteur_couleur || 0).toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-3 text-sm text-right font-mono text-emerald-600">+{(r.volume_nb || 0).toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-3 text-sm text-right font-mono text-emerald-600">+{(r.volume_couleur || 0).toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-3 text-center">
                            {r.est_facture ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                                Facturé {r.facture_numero ? `(${r.facture_numero})` : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-amber-50 text-amber-700">Non facturé</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {relevesPagination.totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                    <p className="text-xs text-gray-400">{relevesPagination.total} relevé(s) — Page {relevesPagination.page}/{relevesPagination.totalPages}</p>
                    <div className="flex gap-2">
                      <button disabled={relevesPagination.page <= 1} onClick={() => loadReleves(relevesPagination.page - 1)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 cursor-pointer">Précédent</button>
                      <button disabled={relevesPagination.page >= relevesPagination.totalPages} onClick={() => loadReleves(relevesPagination.page + 1)} className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 cursor-pointer">Suivant</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* Factures */}
        {activeTab === 'factures' && (
          <>
            {facturesLoading ? (
              <div className="flex justify-center py-12"><div className="h-6 w-6 rounded-full border-2 border-violet-200 border-t-violet-600 animate-spin" /></div>
            ) : factures.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Aucune facture liée à cet import</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase">N° facture</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Date</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Client</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase text-right">Montant TTC</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase text-center">Statut</th>
                      <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase text-center">Relevés source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factures.map(f => (
                      <tr key={f.id} className="border-b border-gray-50 hover:bg-violet-50/30 transition cursor-pointer" onClick={() => router.push(`/dashboard/factures/${f.id}`)}>
                        <td className="px-4 py-3 text-sm font-mono font-semibold text-violet-700">{f.numero_facture}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(f.date_creation)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{f.client_nom}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{fmt(f.total_ttc)} €</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            f.statut === 'Validée' ? 'bg-blue-50 text-blue-700' :
                            f.statut === 'Envoyée' ? 'bg-emerald-50 text-emerald-700' :
                            f.statut === 'Annulée' ? 'bg-gray-100 text-gray-400' :
                            'bg-gray-100 text-gray-600'
                          }`}>{f.statut}</span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-600">{f.nb_releves_source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* Erreurs */}
        {activeTab === 'erreurs' && (
          <>
            {erreurs.length === 0 ? (
              <div className="text-center py-12">
                <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
                  <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                </div>
                <p className="text-sm font-medium text-gray-700">Aucune erreur sur cet import</p>
                <p className="text-xs text-gray-400 mt-1">Toutes les lignes ont été traitées avec succès</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <p className="text-sm text-gray-500">{erreurs.length} erreur(s) détectée(s)</p>
                  <button
                    onClick={() => window.open(`${API_URL}/imports-releves/${id}/rapport?format=csv`, '_blank')}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                    Télécharger en CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Ligne fichier</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Matricule</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Type erreur</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Détail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {erreurs.map((e, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="px-4 py-3 text-sm font-mono text-gray-600">{e.ligne || '—'}</td>
                          <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{e.matricule || '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                              e.type_erreur === 'Machine inconnue' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                            }`}>{e.type_erreur}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{e.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Cancel modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCancelModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4">
            {blockingFactures.length > 0 ? (
              <div className="p-6">
                <div className="mx-auto h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Annulation impossible</h3>
                <p className="text-sm text-gray-500 text-center mb-4">
                  Cet import contient {blockingFactures.length} relevé(s) déjà utilisé(s) dans des factures :
                </p>
                <div className="max-h-40 overflow-y-auto space-y-2 mb-4">
                  {blockingFactures.map(f => (
                    <div key={f.id} className="flex items-center justify-between p-2 rounded-lg bg-red-50/50 text-sm">
                      <span className="font-mono font-medium text-red-700">{f.numero_facture}</span>
                      <span className="text-gray-600">{f.client_nom}</span>
                      <span className="font-medium text-gray-900">{fmt(f.total_ttc)} €</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 text-center mb-4">Pour annuler cet import, vous devez d&apos;abord annuler ces factures.</p>
                <div className="flex justify-center gap-3">
                  <Link href={`/dashboard/parc-machines/imports/${id}?tab=factures`} onClick={() => { setShowCancelModal(false); setActiveTab('factures'); }} className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition cursor-pointer">
                    Voir les factures
                  </Link>
                  <button onClick={() => setShowCancelModal(false)} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Fermer</button>
                </div>
              </div>
            ) : (
              <div className="p-6">
                <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                  <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Annuler l&apos;import {imp.numero_batch} ?</h3>
                <div className="text-sm text-gray-500 mb-4 space-y-1">
                  <p>Cette action va :</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    <li>Supprimer définitivement les <strong>{imp.nb_releves_crees}</strong> relevés créés par cet import</li>
                    <li>Marquer l&apos;import comme annulé (conservé pour l&apos;historique)</li>
                    <li>Réinitialiser les volumes des machines au précédent relevé</li>
                  </ul>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Motif d&apos;annulation (obligatoire)</label>
                  <textarea
                    value={cancelMotif}
                    onChange={e => setCancelMotif(e.target.value)}
                    rows={3}
                    placeholder="Saisissez le motif de l'annulation..."
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none resize-none"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowCancelModal(false)} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
                  <button
                    onClick={handleConfirmCancel}
                    disabled={!cancelMotif.trim() || cancelLoading}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {cancelLoading && <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                    Confirmer l&apos;annulation
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
