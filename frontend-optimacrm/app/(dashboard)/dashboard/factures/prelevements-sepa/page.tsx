'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { ApiResponse, SepaCreancier, SepaFactureEligible, SepaRemise, SepaGenerationResult } from '@/lib/types';

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmt(v: number | string) {
  return parseFloat(String(v || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function maskIban(iban: string | null): string {
  if (!iban) return '—';
  const cleaned = iban.replace(/\s/g, '');
  if (cleaned.length <= 8) return cleaned;
  return `${cleaned.substring(0, 4)} **** **** ${cleaned.substring(cleaned.length - 4)}`;
}

function getNextBusinessDay(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
}

export default function PrelevementsSepaPage() {
  const [activeTab, setActiveTab] = useState<'eligible' | 'historique' | 'parametres'>('eligible');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ── Créancier ───────────────────────────────────────────────────────────
  const [creancier, setCreancier] = useState<SepaCreancier | null>(null);
  const [creancierForm, setCreancierForm] = useState({ nom: 'GROUPE INNOV', ics: '', iban: '', bic: '' });
  const [creancierSaving, setCreancierSaving] = useState(false);

  // ── Factures éligibles ──────────────────────────────────────────────────
  const [factures, setFactures] = useState<SepaFactureEligible[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [datePrelevement, setDatePrelevement] = useState(getNextBusinessDay());
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Historique ──────────────────────────────────────────────────────────
  const [remises, setRemises] = useState<SepaRemise[]>([]);
  const [remisesLoading, setRemisesLoading] = useState(false);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // ── Chargement ──────────────────────────────────────────────────────────

  const loadCreancier = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<SepaCreancier | null>>('/sepa/creancier');
      if (res.data) {
        setCreancier(res.data);
        setCreancierForm({ nom: res.data.nom, ics: res.data.ics, iban: res.data.iban, bic: res.data.bic });
      }
    } catch { /* noop */ }
  }, []);

  const loadFactures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<SepaFactureEligible[]>>('/sepa/factures-eligibles');
      setFactures(res.data);
    } catch { /* noop */ }
    setLoading(false);
  }, []);

  const loadRemises = useCallback(async () => {
    setRemisesLoading(true);
    try {
      const res = await api.get<ApiResponse<SepaRemise[]>>('/sepa/remises');
      setRemises(res.data);
    } catch { /* noop */ }
    setRemisesLoading(false);
  }, []);

  useEffect(() => {
    loadCreancier();
    loadFactures();
    loadRemises();
  }, [loadCreancier, loadFactures, loadRemises]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const saveCreancier = async () => {
    setCreancierSaving(true);
    try {
      const res = await api.post<ApiResponse<SepaCreancier>>('/sepa/creancier', creancierForm);
      setCreancier(res.data);
      setToast({ message: 'Paramètres créancier sauvegardés', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    }
    setCreancierSaving(false);
  };

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAllReady = () => {
    const readyIds = factures.filter(f => f.pret).map(f => f.facture_id);
    setSelectedIds(prev => prev.length === readyIds.length ? [] : readyIds);
  };

  const selectedTotal = factures
    .filter(f => selectedIds.includes(f.facture_id))
    .reduce((sum, f) => sum + parseFloat(String(f.total_ttc)), 0);

  const genererFichier = async () => {
    if (selectedIds.length === 0) return;
    setGenerating(true);
    try {
      const res = await api.post<ApiResponse<SepaGenerationResult>>('/sepa/generer', {
        facture_ids: selectedIds,
        date_prelevement: datePrelevement,
      });
      const result = res.data;

      // Déclencher le téléchargement du XML
      const blob = new Blob([result.xml], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prelevements_${datePrelevement}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setToast({ message: `Remise SEPA générée : ${result.nb_transactions} prélèvement(s) pour ${result.montant_total} €`, type: 'success' });
      setSelectedIds([]);
      loadFactures();
      loadRemises();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors de la génération', type: 'error' });
    }
    setGenerating(false);
  };

  const downloadRemiseXml = async (remiseId: number, dateP: string) => {
    try {
      const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/sepa/remises/${remiseId}/xml`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Erreur téléchargement');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `prelevements_${dateP}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      setToast({ message: 'Erreur lors du téléchargement', type: 'error' });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prélèvements SEPA</h1>
          <p className="mt-1 text-sm text-gray-500">Générez les fichiers de prélèvement bancaire (pain.008.001.02)</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {[
            { key: 'eligible' as const, label: 'Factures éligibles', count: factures.length },
            { key: 'historique' as const, label: 'Historique des remises', count: remises.length },
            { key: 'parametres' as const, label: 'Paramètres créancier' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              {'count' in tab && tab.count !== undefined && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeTab === tab.key ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ── TAB: Factures éligibles ────────────────────────────────────────── */}
      {activeTab === 'eligible' && (
        <div className="space-y-4">
          {/* Bandeau récap + contrôles */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-sm text-gray-500">Sélectionnées</span>
                <p className="text-xl font-bold text-gray-900">{selectedIds.length}</p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div>
                <span className="text-sm text-gray-500">Total prélèvement</span>
                <p className="text-xl font-bold text-indigo-600">{fmt(selectedTotal)} €</p>
              </div>
              <div className="h-8 w-px bg-gray-200" />
              <div>
                <label className="text-sm text-gray-500 block">Date prélèvement</label>
                <input
                  type="date"
                  value={datePrelevement}
                  onChange={e => setDatePrelevement(e.target.value)}
                  className="mt-0.5 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>
            <button
              onClick={genererFichier}
              disabled={selectedIds.length === 0 || generating || !creancier}
              className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {generating ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              )}
              Générer le fichier SEPA
            </button>
          </div>

          {!creancier && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex items-center gap-2">
              <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              Configurez d&apos;abord les paramètres créancier (onglet &quot;Paramètres créancier&quot;) avant de générer un fichier.
            </div>
          )}

          {/* Tableau */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIds.length > 0 && selectedIds.length === factures.filter(f => f.pret).length}
                        onChange={selectAllReady}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Facture</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Client</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Montant TTC</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">RUM</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">IBAN</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Chargement...</td></tr>
                  ) : factures.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Aucune facture éligible</td></tr>
                  ) : factures.map(f => (
                    <tr
                      key={f.facture_id}
                      className={`${!f.pret ? 'bg-red-50/40' : selectedIds.includes(f.facture_id) ? 'bg-indigo-50/50' : 'hover:bg-gray-50'} transition-colors`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          disabled={!f.pret}
                          checked={selectedIds.includes(f.facture_id)}
                          onChange={() => toggleSelection(f.facture_id)}
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-30"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{f.numero_facture}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <div>{f.client_raison_sociale || f.raison_sociale}</div>
                        <div className="text-xs text-gray-400">{f.code_client || f.numero_client}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(f.total_ttc)} €</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{f.reference_mandat_sepa || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{maskIban(f.iban)}</td>
                      <td className="px-4 py-3 text-center">
                        {f.pret ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Prêt
                          </span>
                        ) : (
                          <span className="group relative inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 cursor-help">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            Incomplet
                            <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl z-10">
                              {f.champs_manquants.join(', ')}
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Historique ─────────────────────────────────────────────────── */}
      {activeTab === 'historique' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date création</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Date prélèvement</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Nb transactions</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Montant total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Utilisateur</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Statut</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {remisesLoading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Chargement...</td></tr>
                ) : remises.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Aucune remise générée</td></tr>
                ) : remises.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">#{r.id}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(r.date_creation)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(r.date_prelevement)}</td>
                    <td className="px-4 py-3 text-center font-medium">{r.nb_transactions}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(r.montant_total)} €</td>
                    <td className="px-4 py-3 text-gray-600">{r.user_nom || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        {r.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => downloadRemiseXml(r.id, r.date_prelevement?.split('T')[0] || '')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                        XML
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB: Paramètres créancier ──────────────────────────────────────── */}
      {activeTab === 'parametres' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Paramètres créancier SEPA</h2>
          <p className="text-sm text-gray-500 mb-6">Informations du créancier utilisées dans le fichier XML de prélèvement.</p>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom du créancier</label>
              <input
                value={creancierForm.nom}
                onChange={e => setCreancierForm(f => ({ ...f, nom: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="GROUPE INNOV"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">ICS (Identifiant Créancier SEPA)</label>
              <input
                value={creancierForm.ics}
                onChange={e => setCreancierForm(f => ({ ...f, ics: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="FR27ZZZ860011"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">IBAN créancier</label>
                <input
                  value={creancierForm.iban}
                  onChange={e => setCreancierForm(f => ({ ...f, iban: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="FR76 1234 5678 9012 3456 7890 123"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">BIC créancier</label>
                <input
                  value={creancierForm.bic}
                  onChange={e => setCreancierForm(f => ({ ...f, bic: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="BREDFRPP"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <button
                onClick={saveCreancier}
                disabled={creancierSaving || !creancierForm.ics || !creancierForm.iban || !creancierForm.bic}
                className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creancierSaving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
              </button>
            </div>
          </div>

          {creancier && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Configuration actuelle :</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Nom :</span> <span className="font-medium">{creancier.nom}</span></div>
                <div><span className="text-gray-500">ICS :</span> <span className="font-mono font-medium">{creancier.ics}</span></div>
                <div><span className="text-gray-500">IBAN :</span> <span className="font-mono font-medium">{maskIban(creancier.iban)}</span></div>
                <div><span className="text-gray-500">BIC :</span> <span className="font-mono font-medium">{creancier.bic}</span></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
