'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { FactureDetail, ApiResponse, StatutFacture, EmailTemplate } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const STATUT_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  'Brouillon': { label: 'Brouillon', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  'Validée': { label: 'Validée', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'Envoyée': { label: 'Envoyée', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'Annulée': { label: 'Annulée', bg: 'bg-gray-100', text: 'text-gray-400 line-through', dot: 'bg-gray-300' },
};

function StatusBadge({ statut }: { statut: StatutFacture }) {
  const cfg = STATUT_CONFIG[statut] || STATUT_CONFIG['Brouillon'];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
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

function fmtPU(v: number | string) {
  const val = parseFloat(String(v || 0));
  if (val < 1 && val > 0) return val.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  return fmt(v);
}

function SendEmailModal({ facture, onClose, onSent }: { facture: FactureDetail; onClose: () => void; onSent: () => void }) {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [destinataire, setDestinataire] = useState('');
  const [sujet, setSujet] = useState('');
  const [corps, setCorps] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<ApiResponse<EmailTemplate>>(`/factures/${facture.id}/email-template`);
        setDestinataire(res.data.destinataire || '');
        setSujet(res.data.sujet || '');
        setCorps(res.data.corps || '');
      } catch {
        setDestinataire(facture.client_email || '');
        setSujet(`Facture ${facture.numero_facture}`);
        setCorps('Bonjour,\n\nVeuillez trouver ci-joint votre facture.\n\nCordialement');
      } finally {
        setLoading(false);
      }
    })();
  }, [facture]);

  const handleSend = async () => {
    setError('');
    if (!destinataire) { setError('Veuillez saisir une adresse email destinataire'); return; }
    if (!sujet) { setError('Veuillez saisir un objet'); return; }

    setSending(true);
    try {
      await api.post(`/factures/${facture.id}/envoyer-email`, { destinataire, sujet, corps });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Envoyer par email</h2>
              <p className="text-xs text-gray-400">Facture {facture.numero_facture} — Le PDF sera joint automatiquement</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition cursor-pointer">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center">
            <div className="animate-spin h-8 w-8 border-[3px] border-violet-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2.5">
                <svg className="h-4 w-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Destinataire</label>
              <input
                type="email"
                value={destinataire}
                onChange={e => setDestinataire(e.target.value)}
                placeholder="client@email.com"
                className="w-full rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-violet-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Objet</label>
              <input
                value={sujet}
                onChange={e => setSujet(e.target.value)}
                placeholder="Facture n°..."
                className="w-full rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-violet-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Message</label>
              <textarea
                value={corps}
                onChange={e => setCorps(e.target.value)}
                rows={8}
                className="w-full rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-violet-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition resize-y"
              />
            </div>

            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">facture-{facture.numero_facture}.pdf</p>
                <p className="text-xs text-gray-400">Le PDF de la facture sera généré et joint automatiquement</p>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !destinataire || !sujet}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {sending ? (
              <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Envoi en cours...</>
            ) : (
              <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>Envoyer</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FactureDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [facture, setFacture] = useState<FactureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const loadFacture = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<FactureDetail>>(`/factures/${id}`);
      setFacture(res.data);
    } catch {
      router.push('/dashboard/factures');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { loadFacture(); }, [loadFacture]);

  const handleAction = async (action: string) => {
    if (!facture) return;
    try {
      if (action === 'pdf') {
        setPdfLoading(true);
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`${API_URL}/factures/${facture.id}/pdf`, {
            headers: { ...(token && { Authorization: `Bearer ${token}` }) },
          });
          if (!response.ok) throw new Error('Erreur génération PDF');
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
        } catch {
          alert('Erreur lors de la génération du PDF');
        } finally {
          setPdfLoading(false);
        }
        return;
      } else if (action === 'valider') {
        await api.post(`/factures/${facture.id}/valider`, {});
        loadFacture();
      } else if (action === 'envoyer') {
        await api.post(`/factures/${facture.id}/envoyer`, {});
        loadFacture();
      } else if (action === 'annuler') {
        if (confirm('Annuler cette facture ?')) {
          await api.post(`/factures/${facture.id}/annuler`, {});
          loadFacture();
        }
      } else if (action === 'dupliquer') {
        const res = await api.post<ApiResponse<{ id: number }>>(`/factures/${facture.id}/dupliquer`, {});
        router.push(`/dashboard/factures/${res.data.id}/modifier`);
      } else if (action === 'supprimer') {
        if (confirm('Supprimer ?')) {
          await api.delete(`/factures/${facture.id}`);
          router.push('/dashboard/factures');
        }
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erreur');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-10 w-10 border-[3px] border-violet-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!facture) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <button onClick={() => router.push('/dashboard/factures')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-3 transition cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Factures
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            {facture.est_avoir ? 'Avoir' : 'Facture'} {facture.numero_facture}
            <StatusBadge statut={facture.statut} />
            <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
              facture.type_origine === 'Contrat' ? 'bg-blue-100 text-blue-700' :
              facture.type_origine === 'Devis' ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-600'
            }`}>{facture.type_origine}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {facture.statut === 'Brouillon' && (
            <>
              <button onClick={() => router.push(`/dashboard/factures/${facture.id}/modifier`)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition cursor-pointer">Modifier</button>
              <button onClick={() => handleAction('valider')} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition cursor-pointer">Valider</button>
              <button onClick={() => handleAction('supprimer')} className="px-4 py-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer">Supprimer</button>
            </>
          )}
          {facture.statut === 'Validée' && (
            <>
              <button onClick={() => setShowEmailModal(true)} className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition cursor-pointer inline-flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                Envoyer par email
              </button>
              <button onClick={() => handleAction('envoyer')} className="px-4 py-2 rounded-xl border border-violet-200 text-sm font-semibold text-violet-600 hover:bg-violet-50 transition cursor-pointer">Marquer envoyée</button>
              <button onClick={() => handleAction('annuler')} className="px-4 py-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer">Annuler</button>
            </>
          )}
          {facture.statut === 'Envoyée' && (
            <button onClick={() => setShowEmailModal(true)} className="px-4 py-2 rounded-xl border border-violet-200 text-sm font-semibold text-violet-600 hover:bg-violet-50 transition cursor-pointer inline-flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
              Renvoyer par email
            </button>
          )}
          {facture.statut !== 'Brouillon' && (
            <button onClick={() => handleAction('pdf')} disabled={pdfLoading} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-2">
              {pdfLoading && <span className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full" />}
              PDF
            </button>
          )}
          <button onClick={() => handleAction('dupliquer')} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition cursor-pointer">Dupliquer</button>
          {!['Annulée', 'Brouillon'].includes(facture.statut) && (
            <button onClick={() => handleAction('annuler')} className="px-4 py-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer">Annuler</button>
          )}
        </div>
      </div>

      {/* Layout 2 colonnes */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Colonne gauche */}
        <div className="space-y-6">
          {/* Machine */}
          {facture.numero_serie && (
            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5">
              <p className="font-semibold text-violet-800">Concerne votre contrat n° : {facture.numero_contrat}</p>
              <p className="text-sm text-violet-600 mt-1">CONTRAT COPIE</p>
              <p className="text-sm text-violet-600">Matricule machine: {facture.numero_serie}</p>
              <p className="text-sm text-violet-600">Modèle : {facture.modele_machine}</p>
            </div>
          )}

          {/* Lignes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Lignes de facture</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[8%]">Réf.</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[40%]">Désignation</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[10%]">Qté</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[14%]">P.U HT</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[8%]">Rem</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[14%]">Total HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {facture.lignes.map(l => {
                    if (l.type_ligne === 'SAUT_DE_LIGNE') return <tr key={l.id}><td colSpan={6} className="py-2" /></tr>;
                    if (l.type_ligne === 'COMMENTAIRE') return (
                      <tr key={l.id}><td colSpan={6} className="px-4 py-2.5 bg-gray-50 text-sm italic text-gray-500">{l.designation}</td></tr>
                    );
                    if (l.type_ligne === 'SOUS_TOTAL') return (
                      <tr key={l.id} className="bg-gray-50">
                        <td colSpan={5} className="px-4 py-2.5 text-right font-semibold text-sm text-gray-700">Sous-total</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-sm text-gray-900">{fmt(l.total_ht)} €</td>
                      </tr>
                    );

                    const isRegul = l.type_ligne.startsWith('REGULARISATION');
                    const remStr = parseFloat(String(l.remise_pourcentage)) > 0 ? `-${l.remise_pourcentage}%` :
                      parseFloat(String(l.remise_montant)) > 0 ? `-${fmt(l.remise_montant)} €` : '';

                    return (
                      <tr key={l.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3 text-sm text-gray-500 font-mono">{l.reference || ''}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{l.designation}</p>
                          {l.description && <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-line">{l.description}</p>}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-600">{isRegul ? '' : l.quantite}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600">{isRegul ? '' : `${fmtPU(l.prix_unitaire)} €`}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-500">{remStr}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{fmt(l.total_ht)} €</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Récapitulatif */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex justify-end">
              <div className="w-full max-w-sm space-y-2">
                {parseFloat(String(facture.frais_techniques)) > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-gray-500">FTC</span><span>{fmt(facture.frais_techniques)} €</span></div>
                )}
                {parseFloat(String(facture.eco_contribution)) > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-gray-500">ECT</span><span>{fmt(facture.eco_contribution)} €</span></div>
                )}
                <div className="flex justify-between text-sm"><span className="text-gray-500">Taux TVA</span><span>{facture.taux_tva}%</span></div>
                <div className="border-t border-gray-200 pt-2" />
                <div className="flex justify-between text-sm"><span className="text-gray-500">Hors Taxe</span><span className="font-semibold">{fmt(facture.total_ht)} €</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">TVA {facture.taux_tva}%</span><span>{fmt(facture.montant_tva)} €</span></div>
                <div className="flex justify-between text-base font-bold text-violet-700 pt-1 border-t border-violet-200"><span>TTC</span><span>{fmt(facture.total_ttc)} €</span></div>
              </div>
            </div>
          </div>

        </div>

        {/* Colonne droite */}
        <div className="space-y-5">
          {/* Résumé */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Résumé</h3>
            <div className="space-y-2">
              <div className="flex justify-between"><span className="text-sm text-gray-500">Total HT</span><span className="text-lg font-bold text-gray-900">{fmt(facture.total_ht)} €</span></div>
              <div className="flex justify-between"><span className="text-sm text-gray-500">TVA</span><span className="text-sm text-gray-600">{fmt(facture.montant_tva)} €</span></div>
              <div className="flex justify-between border-t border-gray-100 pt-2"><span className="text-sm font-semibold text-violet-700">Total TTC</span><span className="text-xl font-bold text-violet-700">{fmt(facture.total_ttc)} €</span></div>
            </div>
          </div>

          {/* Client */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Client</h3>
            <p className="font-semibold text-gray-900 text-sm cursor-pointer hover:text-violet-600 transition" onClick={() => router.push(`/dashboard/clients/${facture.client_id}`)}>{facture.client_raison_sociale}</p>
            <p className="text-xs text-gray-400 font-mono">{facture.code_client}</p>
            {facture.client_email && <p className="text-sm text-gray-500 mt-1">{facture.client_email}</p>}
            {facture.client_telephone && <p className="text-sm text-gray-500">{facture.client_telephone}</p>}
            <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
              <p>{facture.client_adresse}</p>
              <p>{facture.client_cp} {facture.client_ville}</p>
            </div>
          </div>

          {/* Infos facture */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Informations</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Date création</span><span className="text-gray-900">{formatDate(facture.date_creation)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Échéance</span><span className="text-gray-900">{formatDate(facture.date_echeance)}</span></div>
              {facture.periode_debut && <div className="flex justify-between"><span className="text-gray-500">Période</span><span className="text-gray-900">{formatDate(facture.periode_debut)} → {formatDate(facture.periode_fin)}</span></div>}
              <div className="flex justify-between"><span className="text-gray-500">Mode règlement</span><span className="text-gray-900">{facture.mode_reglement}</span></div>
              {facture.numero_contrat && (
                <div className="flex justify-between"><span className="text-gray-500">Contrat</span>
                  <span className="text-violet-600 font-semibold cursor-pointer hover:underline" onClick={() => facture.contrat_id && router.push(`/dashboard/contrats/${facture.contrat_id}`)}>{facture.numero_contrat}</span>
                </div>
              )}
            </div>
          </div>

          {/* Historique */}
          {facture.historique.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Historique</h3>
              <div className="space-y-3">
                {facture.historique.map(h => (
                  <div key={h.id} className="flex items-start gap-3">
                    <div className="h-2 w-2 rounded-full bg-violet-400 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{h.action}</p>
                      {h.description && <p className="text-xs text-gray-500">{h.description}</p>}
                      <p className="text-[11px] text-gray-400 mt-0.5">{new Date(h.created_at).toLocaleString('fr-FR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showEmailModal && facture && (
        <SendEmailModal
          facture={facture}
          onClose={() => setShowEmailModal(false)}
          onSent={() => {
            setShowEmailModal(false);
            loadFacture();
          }}
        />
      )}
    </div>
  );
}
