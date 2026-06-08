'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { AvoirDetail, Facture, ApiResponse, PaginatedResponse } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const STATUT_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  'Brouillon': { label: 'Brouillon', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  'Validé': { label: 'Validé', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'Remboursé': { label: 'Remboursé', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'Imputé': { label: 'Imputé', bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  'Annulé': { label: 'Annulé', bg: 'bg-gray-100', text: 'text-gray-400 line-through', dot: 'bg-gray-300' },
};

function StatusBadge({ statut }: { statut: string }) {
  const cfg = STATUT_CONFIG[statut] || STATUT_CONFIG['Brouillon'];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmt(v: number | string) {
  return parseFloat(String(v || 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-6 right-6 z-[60] flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg transition-all ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
      {message}
    </div>
  );
}

export default function AvoirDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [avoir, setAvoir] = useState<AvoirDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showImputModal, setShowImputModal] = useState(false);
  const [facturesCibles, setFacturesCibles] = useState<Facture[]>([]);
  const [selectedFactureCible, setSelectedFactureCible] = useState<number | null>(null);
  const [imputLoading, setImputLoading] = useState(false);

  const loadAvoir = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<AvoirDetail>>(`/avoirs/${id}`);
      setAvoir(res.data);
    } catch { router.push('/dashboard/factures/avoirs'); }
    finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => { loadAvoir(); }, [loadAvoir]);

  const handlePdf = async () => {
    if (!avoir) return;
    setPdfLoading(true);
    try {
      const response = await fetch(`${API_URL}/avoirs/${avoir.id}/pdf`, { credentials: 'include' });
      if (!response.ok) throw new Error('Erreur PDF');
      const blob = await response.blob();
      window.open(URL.createObjectURL(blob), '_blank');
    } catch { setToast({ message: 'Erreur lors de la génération du PDF', type: 'error' }); }
    finally { setPdfLoading(false); }
  };

  const handleValider = async () => {
    if (!avoir) return;
    try {
      await api.post(`/avoirs/${avoir.id}/valider`, {});
      setToast({ message: 'Avoir validé', type: 'success' });
      loadAvoir();
    } catch (err) { setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' }); }
  };

  const handleRembourser = async () => {
    if (!avoir || !confirm('Marquer cet avoir comme remboursé ?')) return;
    try {
      await api.post(`/avoirs/${avoir.id}/utiliser`, { mode: 'REMBOURSEMENT' });
      setToast({ message: 'Avoir marqué comme remboursé', type: 'success' });
      loadAvoir();
    } catch (err) { setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' }); }
  };

  const openImputModal = async () => {
    try {
      const res = await api.get<PaginatedResponse<Facture>>('/factures?limit=50&statut=Brouillon');
      const res2 = await api.get<PaginatedResponse<Facture>>('/factures?limit=50&statut=Validée');
      setFacturesCibles([...res.data, ...res2.data]);
      setSelectedFactureCible(null);
      setShowImputModal(true);
    } catch { setToast({ message: 'Erreur chargement factures', type: 'error' }); }
  };

  const handleImputer = async () => {
    if (!avoir || !selectedFactureCible) return;
    setImputLoading(true);
    try {
      await api.post(`/avoirs/${avoir.id}/utiliser`, { mode: 'IMPUTATION', facture_imputee_id: selectedFactureCible });
      setToast({ message: 'Avoir imputé sur la facture', type: 'success' });
      setShowImputModal(false);
      loadAvoir();
    } catch (err) { setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' }); }
    finally { setImputLoading(false); }
  };

  const handleAnnuler = async () => {
    if (!avoir || !confirm('Annuler cet avoir ?')) return;
    try {
      await api.post(`/avoirs/${avoir.id}/annuler`, {});
      setToast({ message: 'Avoir annulé', type: 'success' });
      loadAvoir();
    } catch (err) { setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' }); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin h-10 w-10 border-[3px] border-red-600 border-t-transparent rounded-full" /></div>;
  if (!avoir) return null;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <button onClick={() => router.push('/dashboard/factures/avoirs')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3 transition cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Avoirs
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            Avoir {avoir.numero}
            <StatusBadge statut={avoir.statut} />
            <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${avoir.type_avoir === 'TOTAL' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{avoir.type_avoir}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {avoir.statut === 'Brouillon' && (
            <>
              <button onClick={handleValider} className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition cursor-pointer">Valider</button>
              <button onClick={handleAnnuler} className="px-4 py-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer">Annuler</button>
            </>
          )}
          {avoir.statut === 'Validé' && (
            <>
              <button onClick={handlePdf} disabled={pdfLoading} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-2">
                {pdfLoading && <span className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full" />}PDF
              </button>
              <button onClick={handleRembourser} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition cursor-pointer">Rembourser</button>
              <button onClick={openImputModal} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition cursor-pointer">Imputer sur facture</button>
              <button onClick={handleAnnuler} className="px-4 py-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer">Annuler</button>
            </>
          )}
          {['Remboursé', 'Imputé'].includes(avoir.statut) && (
            <button onClick={handlePdf} disabled={pdfLoading} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-2">
              {pdfLoading && <span className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full" />}PDF
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <p className="font-semibold text-red-800">
              Avoir sur facture n°{' '}
              <Link href={`/dashboard/factures/${avoir.facture_id}`} className="underline hover:text-red-900">{avoir.numero_facture}</Link>
              {' '}du {formatDate(avoir.facture_date_creation)}
            </p>
            {avoir.motif && <p className="text-sm text-red-600 mt-1 italic">Motif : {avoir.motif}</p>}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Lignes de l&apos;avoir</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase">Désignation</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-500 uppercase w-[10%]">Qté</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-500 uppercase w-[14%]">P.U HT</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-500 uppercase w-[8%]">TVA</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-500 uppercase w-[14%]">Crédit HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {avoir.lignes.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{l.designation}</td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600">{l.quantite}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600">{fmt(l.prix_unitaire_ht)} €</td>
                      <td className="px-4 py-3 text-center text-sm text-gray-500">{l.taux_tva}%</td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-red-700">-{fmt(l.montant_ht)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex justify-end">
              <div className="w-full max-w-sm space-y-2">
                <div className="flex justify-between text-sm"><span className="text-gray-500">Total HT (crédit)</span><span className="font-semibold text-red-700">-{fmt(avoir.montant_ht)} €</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">TVA</span><span className="text-red-600">-{fmt(avoir.montant_tva)} €</span></div>
                <div className="flex justify-between text-base font-bold text-red-700 pt-1 border-t border-red-200"><span>Total TTC (crédit)</span><span>-{fmt(avoir.montant_ttc)} €</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Résumé</h3>
            <div className="space-y-2">
              <div className="flex justify-between"><span className="text-sm text-gray-500">Crédit HT</span><span className="text-lg font-bold text-red-700">-{fmt(avoir.montant_ht)} €</span></div>
              <div className="flex justify-between"><span className="text-sm text-gray-500">TVA</span><span className="text-sm text-red-600">-{fmt(avoir.montant_tva)} €</span></div>
              <div className="flex justify-between border-t border-gray-100 pt-2"><span className="text-sm font-semibold text-red-700">Total TTC</span><span className="text-xl font-bold text-red-700">-{fmt(avoir.montant_ttc)} €</span></div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Informations</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Date avoir</span><span className="text-gray-900">{formatDate(avoir.date_avoir)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Client</span><span className="text-gray-900">{avoir.client_nom || avoir.facture_client_raison_sociale}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Facture liée</span>
                <Link href={`/dashboard/factures/${avoir.facture_id}`} className="text-blue-600 font-semibold hover:underline">{avoir.numero_facture}</Link>
              </div>
              <div className="flex justify-between"><span className="text-gray-500">TTC facture</span><span className="text-gray-900">{fmt(avoir.facture_total_ttc || 0)} €</span></div>
              {avoir.mode_utilisation && (
                <div className="flex justify-between"><span className="text-gray-500">Mode</span><span className="text-gray-900">{avoir.mode_utilisation === 'IMPUTATION' ? 'Imputation' : 'Remboursement'}</span></div>
              )}
              {avoir.facture_imputee_numero && (
                <div className="flex justify-between"><span className="text-gray-500">Imputé sur</span>
                  <Link href={`/dashboard/factures/${avoir.facture_imputee_id}`} className="text-blue-600 font-semibold hover:underline">{avoir.facture_imputee_numero}</Link>
                </div>
              )}
            </div>
          </div>

          {avoir.reste_avoirable !== undefined && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Situation facture</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">TTC facture</span><span>{fmt(avoir.facture_total_ttc || 0)} €</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Total avoirs</span><span className="text-red-600">-{fmt(avoir.total_avoirs_existants || 0)} €</span></div>
                <div className="flex justify-between border-t border-gray-100 pt-2 font-semibold"><span>Net dû</span><span>{fmt(avoir.reste_avoirable || 0)} €</span></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showImputModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowImputModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Imputer sur une facture</h2>
              <p className="text-xs text-gray-400 mt-1">Sélectionnez la facture cible (Brouillon ou Validée)</p>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {facturesCibles.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">Aucune facture éligible</p>
              ) : (
                <div className="space-y-2">
                  {facturesCibles.map(f => (
                    <label key={f.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${selectedFactureCible === f.id ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                      <input type="radio" name="facture_cible" checked={selectedFactureCible === f.id} onChange={() => setSelectedFactureCible(f.id)} className="text-indigo-600" />
                      <div className="flex-1">
                        <span className="text-sm font-mono font-semibold text-gray-900">{f.numero_facture}</span>
                        <span className="text-sm text-gray-500 ml-2">{f.client_raison_sociale}</span>
                        <span className="text-sm text-gray-400 ml-2">{fmt(f.total_ttc)} €</span>
                      </div>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${f.statut === 'Brouillon' ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-700'}`}>{f.statut}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
              <button onClick={() => setShowImputModal(false)} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
              <button onClick={handleImputer} disabled={!selectedFactureCible || imputLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition cursor-pointer">
                {imputLoading ? <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
                {imputLoading ? 'Imputation...' : 'Imputer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
