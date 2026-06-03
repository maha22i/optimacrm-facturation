'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { lignesAfficheesPourDevis } from '@/lib/devisImportView';
import type { DevisDetail, DevisLigne, DevisChamp, ApiResponse, StatutDevis, EmailTemplate } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const STATUT_CONFIG: Record<StatutDevis, { label: string; bg: string; text: string; dot: string }> = {
  BROUILLON: { label: 'Brouillon', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  ENVOYE: { label: 'Envoyé', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  ACCEPTE: { label: 'Accepté', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  REFUSE: { label: 'Refusé', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  EXPIRE: { label: 'Expiré', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  FACTURE: { label: 'Facturé', bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
};

const DELAI_LABELS: Record<string, string> = {
  COMPTANT: 'Comptant',
  '15_JOURS': '15 jours',
  '30_JOURS': '30 jours net',
  '45_JOURS_FIN_MOIS': '45 jours fin de mois',
  '60_JOURS': '60 jours net',
};

const MODE_LABELS: Record<string, string> = {
  VIREMENT: 'Virement bancaire',
  PRELEVEMENT_SEPA: 'Prélèvement SEPA',
  CHEQUE: 'Chèque',
  CARTE: 'Carte bancaire',
  ESPECES: 'Espèces',
};

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function StatusBadge({ statut }: { statut: StatutDevis }) {
  const cfg = STATUT_CONFIG[statut];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
    }`}>
      {message}
      <button onClick={onClose} className="hover:opacity-70 cursor-pointer">✕</button>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
          <button onClick={onConfirm} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition cursor-pointer">{confirmLabel || 'Confirmer'}</button>
        </div>
      </div>
    </div>
  );
}

function computeTvaBreakdown(lignes: DevisLigne[]) {
  const map: Record<number, { base: number; tva: number }> = {};
  for (const l of lignes) {
    if (l.type === 'COMMENTAIRE' || l.type === 'SAUT_DE_LIGNE' || l.type === 'SOUS_TOTAL') continue;
    if (l.est_optionnel) continue;
    const rate = l.taux_tva;
    if (!map[rate]) map[rate] = { base: 0, tva: 0 };
    map[rate].base += l.montant_ht;
    map[rate].tva += l.montant_tva;
  }
  return Object.entries(map)
    .map(([rate, v]) => ({ rate: parseFloat(rate), ...v }))
    .sort((a, b) => a.rate - b.rate);
}

// ─── Action icons (inline SVGs) ──────────────────────────────────────────────

function IconArrowLeft() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>;
}
function IconEdit() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>;
}
function IconSend() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>;
}
function IconCheck() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>;
}
function IconX() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>;
}
function IconCopy() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" /></svg>;
}
function IconPdf() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>;
}
function IconTrash() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>;
}
function IconInvoice() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>;
}
function IconEye() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>;
}
function IconPhone() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>;
}
function IconMail() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>;
}
function IconBuilding() {
  return <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>;
}
function IconClock() {
  return <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>;
}

function SendDevisEmailModal({ devis, onClose, onSent }: { devis: DevisDetail; onClose: () => void; onSent: () => void }) {
  const [loadTpl, setLoadTpl] = useState(true);
  const [sending, setSending] = useState(false);
  const [destinataire, setDestinataire] = useState('');
  const [sujet, setSujet] = useState('');
  const [corps, setCorps] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<ApiResponse<EmailTemplate>>(`/devis/${devis.id}/email-template`);
        setDestinataire(res.data.destinataire || '');
        setSujet(res.data.sujet || '');
        setCorps(res.data.corps || '');
      } catch {
        const fallback = devis.contact?.email || devis.client?.email_principal || '';
        setDestinataire(fallback);
        setSujet(`Devis ${devis.numero_devis}`);
        setCorps('Bonjour,\n\nVeuillez trouver ci-joint notre devis.\n\nCordialement');
      } finally {
        setLoadTpl(false);
      }
    })();
  }, [devis]);

  const handleSend = async () => {
    setError('');
    if (!destinataire) { setError('Veuillez saisir une adresse email destinataire'); return; }
    if (!sujet) { setError('Veuillez saisir un objet'); return; }

    setSending(true);
    try {
      await api.post(`/devis/${devis.id}/envoyer-email`, { destinataire, sujet, corps });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  const pdfName = `DEVIS-${devis.numero_devis || devis.id}.pdf`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Envoyer par email</h2>
              <p className="text-xs text-gray-400">Devis {devis.numero_devis} — Le PDF sera joint automatiquement</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition cursor-pointer">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loadTpl ? (
          <div className="p-10 flex justify-center">
            <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
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
                className="w-full rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-blue-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Objet</label>
              <input
                value={sujet}
                onChange={e => setSujet(e.target.value)}
                placeholder="Devis n°..."
                className="w-full rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-blue-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Message</label>
              <textarea
                value={corps}
                onChange={e => setCorps(e.target.value)}
                rows={8}
                className="w-full rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-blue-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition resize-y"
              />
            </div>

            <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{pdfName}</p>
                <p className="text-xs text-gray-400">Le PDF du devis sera généré et joint automatiquement</p>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !destinataire || !sujet}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function DevisDetailPage() {
  const params = useParams();
  const router = useRouter();
  const devisId = params.id as string;

  const [devis, setDevis] = useState<DevisDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [modal, setModal] = useState<{ type: 'delete' | 'transformer' } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  const fetchDevis = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<DevisDetail>>(`/devis/${devisId}`);
      setDevis(res.data);
    } catch {
      setToast({ message: 'Erreur lors du chargement du devis', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [devisId]);

  useEffect(() => { fetchDevis(); }, [fetchDevis]);

  const handleAction = async (action: string) => {
    if (!devis) return;
    if (action === 'pdf') {
      setPdfLoading(true);
      try {
        const response = await fetch(`${API_URL}/devis/${devis.id}/pdf`, {
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Erreur génération PDF');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } catch {
        setToast({ message: 'Erreur lors de la génération du PDF', type: 'error' });
      } finally {
        setPdfLoading(false);
      }
      return;
    }
    setActionLoading(true);
    try {
      switch (action) {
        case 'modifier':
          router.push(`/dashboard/devis/${devisId}/modifier`);
          return;
        case 'envoyer':
          await api.post(`/devis/${devisId}/envoyer`, {});
          setToast({ message: 'Devis envoyé avec succès', type: 'success' });
          fetchDevis();
          break;
        case 'accepter':
          await api.post(`/devis/${devisId}/accepter`, {});
          setToast({ message: 'Devis accepté', type: 'success' });
          fetchDevis();
          break;
        case 'refuser':
          await api.post(`/devis/${devisId}/refuser`, {});
          setToast({ message: 'Devis refusé', type: 'success' });
          fetchDevis();
          break;
        case 'dupliquer': {
          const res = await api.post<ApiResponse<{ id: number }>>(`/devis/${devisId}/dupliquer`, {});
          setToast({ message: 'Devis dupliqué', type: 'success' });
          router.push(`/dashboard/devis/${res.data.id}`);
          break;
        }
        case 'transformer':
          await api.post(`/devis/${devisId}/transformer-facture`, {});
          setToast({ message: 'Facture créée avec succès', type: 'success' });
          setModal(null);
          fetchDevis();
          break;
        case 'supprimer':
          await api.delete(`/devis/${devisId}`);
          setToast({ message: 'Devis supprimé', type: 'success' });
          setTimeout(() => router.push('/dashboard/devis'), 800);
          break;
        case 'voir-facture':
          if (devis.facture_id) router.push(`/dashboard/factures/${devis.facture_id}`);
          break;
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!devis) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Devis non trouvé</p>
        <button onClick={() => router.push('/dashboard/devis')} className="mt-4 text-blue-600 hover:underline text-sm cursor-pointer">
          Retour à la liste
        </button>
      </div>
    );
  }

  const lignesTable = lignesAfficheesPourDevis(devis);
  const tvaBreakdown = computeTvaBreakdown(lignesTable);
  const pdfChamps = devis.champs_personnalises.filter(c => c.afficher_sur_pdf);

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {showEmailModal && devis && (devis.statut === 'BROUILLON' || devis.statut === 'ENVOYE') && (
        <SendDevisEmailModal
          devis={devis}
          onClose={() => setShowEmailModal(false)}
          onSent={() => {
            setShowEmailModal(false);
            setToast({ message: 'Email envoyé avec succès', type: 'success' });
            fetchDevis();
          }}
        />
      )}

      {modal?.type === 'delete' && (
        <ConfirmModal
          title="Supprimer ce devis ?"
          message={`Le devis "${devis.numero_devis}" sera définitivement supprimé. Cette action est irréversible.`}
          confirmLabel="Supprimer"
          onConfirm={() => { setModal(null); handleAction('supprimer'); }}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.type === 'transformer' && (
        <ConfirmModal
          title="Transformer en facture ?"
          message={`Le devis "${devis.numero_devis}" sera transformé en facture. Le devis passera au statut "Facturé".`}
          confirmLabel="Transformer"
          onConfirm={() => handleAction('transformer')}
          onCancel={() => setModal(null)}
        />
      )}

      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <button onClick={() => router.push('/dashboard/devis')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition cursor-pointer">
          <IconArrowLeft />
          Devis
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-mono font-bold text-blue-700">
              {devis.numero_devis}
            </span>
            <StatusBadge statut={devis.statut} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {devis.statut === 'BROUILLON' && (
              <>
                <ActionBtn label="Modifier" icon={<IconEdit />} onClick={() => handleAction('modifier')} />
                <ActionBtn label="Par email" icon={<IconMail />} onClick={() => setShowEmailModal(true)} variant="primary" />
                <ActionBtn label="Marquer envoyé" icon={<IconSend />} onClick={() => handleAction('envoyer')} disabled={actionLoading} />
                <ActionBtn label="Dupliquer" icon={<IconCopy />} onClick={() => handleAction('dupliquer')} disabled={actionLoading} />
                <ActionBtn label="PDF" icon={<IconPdf />} onClick={() => handleAction('pdf')} loading={pdfLoading} />
                <ActionBtn label="Supprimer" icon={<IconTrash />} onClick={() => setModal({ type: 'delete' })} variant="danger" />
              </>
            )}
            {devis.statut === 'ENVOYE' && (
              <>
                <ActionBtn label="Modifier" icon={<IconEdit />} onClick={() => handleAction('modifier')} />
                <ActionBtn label="Renvoyer email" icon={<IconMail />} onClick={() => setShowEmailModal(true)} />
                <ActionBtn label="Accepter" icon={<IconCheck />} onClick={() => handleAction('accepter')} variant="success" disabled={actionLoading} />
                <ActionBtn label="Refuser" icon={<IconX />} onClick={() => handleAction('refuser')} variant="danger" disabled={actionLoading} />
                <ActionBtn label="Dupliquer" icon={<IconCopy />} onClick={() => handleAction('dupliquer')} disabled={actionLoading} />
                <ActionBtn label="PDF" icon={<IconPdf />} onClick={() => handleAction('pdf')} loading={pdfLoading} />
              </>
            )}
            {devis.statut === 'ACCEPTE' && (
              <>
                <ActionBtn label="Transformer en facture" icon={<IconInvoice />} onClick={() => setModal({ type: 'transformer' })} variant="primary" disabled={actionLoading} />
                <ActionBtn label="Dupliquer" icon={<IconCopy />} onClick={() => handleAction('dupliquer')} disabled={actionLoading} />
                <ActionBtn label="PDF" icon={<IconPdf />} onClick={() => handleAction('pdf')} loading={pdfLoading} />
              </>
            )}
            {(devis.statut === 'REFUSE' || devis.statut === 'EXPIRE') && (
              <>
                <ActionBtn label="Dupliquer" icon={<IconCopy />} onClick={() => handleAction('dupliquer')} disabled={actionLoading} />
                <ActionBtn label="PDF" icon={<IconPdf />} onClick={() => handleAction('pdf')} loading={pdfLoading} />
              </>
            )}
            {devis.statut === 'FACTURE' && (
              <>
                {devis.facture_id && <ActionBtn label="Voir la facture" icon={<IconEye />} onClick={() => handleAction('voir-facture')} variant="primary" />}
                <ActionBtn label="PDF" icon={<IconPdf />} onClick={() => handleAction('pdf')} loading={pdfLoading} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Two-column layout ────────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-6">

        {/* ── LEFT: Devis preview (paper) ─────────────────────────────────── */}
        <div className="xl:w-[70%] min-w-0">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-md p-8 lg:p-10">

            {/* Company header */}
            <div className="flex justify-between items-start mb-8">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Groupe Innov</h2>
                <p className="text-sm text-gray-500 mt-1">123 Avenue de l&apos;Innovation</p>
                <p className="text-sm text-gray-500">75008 Paris, France</p>
                <p className="text-sm text-gray-500 mt-1">Tél : 01 23 45 67 89</p>
                <p className="text-sm text-gray-500">contact@groupe-innov.fr</p>
              </div>
              <div className="text-right">
                <h1 className="text-2xl font-extrabold text-blue-600 uppercase tracking-wider">Devis</h1>
                <p className="text-sm font-mono font-bold text-gray-700 mt-1">{devis.numero_devis}</p>
                <div className="mt-3 text-sm text-gray-500 space-y-0.5">
                  <p>Date d&apos;émission : <span className="font-medium text-gray-700">{formatDate(devis.date_emission || devis.date_creation)}</span></p>
                  <p>Date de validité : <span className="font-medium text-gray-700">{formatDate(devis.date_validite)}</span></p>
                  {devis.reference_client && <p>Réf. client : <span className="font-medium text-gray-700">{devis.reference_client}</span></p>}
                </div>
              </div>
            </div>

            {/* Client block */}
            <div className="bg-gray-50 rounded-xl p-5 mb-6">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Client</p>
              {devis.client ? (
                <>
                  <p className="text-sm font-bold text-gray-900">{devis.client.raison_sociale}</p>
                  {devis.nom_client_libre && devis.nom_client_libre.trim() && devis.nom_client_libre.trim() !== devis.client.raison_sociale?.trim() && (
                    <p className="text-xs text-gray-500 mt-1">
                      Libellé import / Excel : <span className="font-medium text-gray-700">{devis.nom_client_libre}</span>
                    </p>
                  )}
                  {devis.adresse_facturation && (
                    <div className="text-sm text-gray-600 mt-1">
                      <p>{devis.adresse_facturation.ligne1}</p>
                      {devis.adresse_facturation.ligne2 && <p>{devis.adresse_facturation.ligne2}</p>}
                      <p>{devis.adresse_facturation.code_postal} {devis.adresse_facturation.ville}</p>
                      <p>{devis.adresse_facturation.pays}</p>
                    </div>
                  )}
                  {devis.contact && (
                    <p className="text-sm text-gray-500 mt-2">
                      À l&apos;attention de : <span className="font-medium text-gray-700">{devis.contact.prenom} {devis.contact.nom}</span>
                      {devis.contact.email && <span className="text-gray-400"> — {devis.contact.email}</span>}
                    </p>
                  )}
                </>
              ) : devis.nom_client_libre && devis.nom_client_libre.trim() ? (
                <>
                  <p className="text-sm font-bold text-gray-900">{devis.nom_client_libre}</p>
                  <p className="text-xs text-amber-700 mt-1.5 rounded-md bg-amber-50 border border-amber-100 px-2 py-1 inline-block">
                    Client tel qu&apos;indiqué dans l&apos;import — aucune fiche client OptimaCRM n&apos;est liée pour l&apos;instant.
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400">Aucun client renseigné</p>
              )}
            </div>

            {/* Object banner */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg px-5 py-3 mb-6">
              <p className="text-[11px] font-semibold text-blue-200 uppercase tracking-wider">Objet</p>
              <p className="text-sm font-semibold text-white mt-0.5">{devis.objet?.trim() ? devis.objet : '—'}</p>
            </div>

            {/* Lines table */}
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2.5 px-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[80px]">Réf.</th>
                    <th className="text-left py-2.5 px-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Désignation</th>
                    <th className="text-right py-2.5 px-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[60px]">Qté</th>
                    <th className="text-right py-2.5 px-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[100px]">P.U. HT</th>
                    <th className="text-right py-2.5 px-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[80px]">Remise</th>
                    <th className="text-right py-2.5 px-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[110px]">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {lignesTable.map((ligne, idx) => (
                    <LigneRow key={ligne.id ?? `l-${idx}`} ligne={ligne} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Custom fields on PDF */}
            {pdfChamps.length > 0 && (
              <div className="mb-6 bg-gray-50 rounded-xl p-5">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Informations complémentaires</p>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {pdfChamps.map(c => (
                    <div key={c.id ?? c.cle} className="flex justify-between">
                      <dt className="text-sm text-gray-500">{c.label}</dt>
                      <dd className="text-sm font-medium text-gray-900">{c.valeur || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Totals */}
            <div className="flex justify-end mb-6">
              <div className="w-full max-w-xs space-y-1.5">
                <TotalRow label="Total HT" value={formatCurrency(devis.montant_ht)} />
                {devis.montant_remise > 0 && (
                  <TotalRow label={`Remise${devis.remise_globale_type === 'POURCENTAGE' ? ` (${devis.remise_globale_valeur}%)` : ''}`} value={`-${formatCurrency(devis.montant_remise)}`} className="text-red-600" />
                )}
                {devis.montant_remise > 0 && (
                  <TotalRow label="Total HT après remise" value={formatCurrency(devis.montant_ht_apres_remise)} />
                )}
                {tvaBreakdown.map(t => (
                  <TotalRow key={t.rate} label={`TVA ${t.rate}%`} value={formatCurrency(t.tva)} sub={`sur ${formatCurrency(t.base)} €`} />
                ))}
                <div className="border-t-2 border-gray-900 pt-2 mt-2">
                  <TotalRow label="Total TTC" value={`${formatCurrency(devis.montant_ttc)} €`} bold />
                </div>
              </div>
            </div>

            {/* Client message */}
            {devis.message_client && (
              <div className="mb-6">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Message au client</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{devis.message_client}</p>
              </div>
            )}

            {/* Payment conditions */}
            <div className="mb-6 text-sm text-gray-600">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Conditions de paiement</p>
              <p>Délai de paiement : <span className="font-medium text-gray-800">{DELAI_LABELS[devis.conditions_paiement] || devis.conditions_paiement}</span></p>
              <p>Mode de paiement : <span className="font-medium text-gray-800">{MODE_LABELS[devis.mode_paiement] || devis.mode_paiement}</span></p>
            </div>

            {/* CGV */}
            {devis.conditions_generales && (
              <div className="border-t border-gray-200 pt-4">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Conditions générales de vente</p>
                <p className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed">{devis.conditions_generales}</p>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Info panels ──────────────────────────────────────────── */}
        <div className="xl:w-[30%] space-y-5">

          {/* Client card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Client</h3>
            {devis.client ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                    {devis.client.raison_sociale.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{devis.client.raison_sociale}</p>
                    <p className="text-xs text-gray-400">{devis.client.numero_client}</p>
                    {devis.nom_client_libre && devis.nom_client_libre.trim() && devis.nom_client_libre.trim() !== devis.client.raison_sociale?.trim() && (
                      <p className="text-[10px] text-gray-500 mt-0.5">Excel : {devis.nom_client_libre}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {devis.client.email_principal && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <IconMail />
                      <span className="truncate">{devis.client.email_principal}</span>
                    </div>
                  )}
                  {devis.client.telephone_principal && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <IconPhone />
                      <span>{devis.client.telephone_principal}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => router.push(`/dashboard/clients/${devis.client!.id}`)}
                  className="w-full text-center text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg py-1.5 transition cursor-pointer"
                >
                  Voir la fiche client
                </button>
              </div>
            ) : devis.nom_client_libre && devis.nom_client_libre.trim() ? (
              <div>
                <p className="text-sm font-semibold text-gray-900">{devis.nom_client_libre}</p>
                <p className="text-xs text-amber-600 mt-1">Import Excel — pas de fiche client</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Aucun client renseigné</p>
            )}
          </div>

          {/* Financial summary */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Résumé financier</h3>
            <div className="space-y-2">
              <SummaryRow label="Total HT" value={`${formatCurrency(devis.montant_ht)} €`} />
              {devis.montant_remise > 0 && <SummaryRow label="Remise" value={`-${formatCurrency(devis.montant_remise)} €`} className="text-red-600" />}
              <SummaryRow label="TVA" value={`${formatCurrency(devis.montant_tva)} €`} />
              <div className="border-t border-gray-100 pt-2">
                <SummaryRow label="Total TTC" value={`${formatCurrency(devis.montant_ttc)} €`} bold />
              </div>
            </div>
          </div>

          {/* Custom fields (all) */}
          {devis.champs_personnalises.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Champs personnalisés</h3>
              <dl className="space-y-2">
                {devis.champs_personnalises.map(c => (
                  <div key={c.id ?? c.cle} className="flex justify-between text-sm">
                    <dt className="text-gray-500">{c.label}</dt>
                    <dd className="font-medium text-gray-900">{c.valeur || '—'}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Timeline / historique */}
          {devis.historique && devis.historique.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-4">Historique</h3>
              <div className="relative">
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />
                <div className="space-y-4">
                  {devis.historique.map(h => (
                    <div key={h.id} className="relative flex gap-3 pl-5">
                      <div className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-blue-500 bg-white" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{h.action}</p>
                        {h.detail && <p className="text-xs text-gray-500 mt-0.5">{h.detail}</p>}
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                          <IconClock />
                          <span>{formatDate(h.created_at)}</span>
                          {h.first_name && <span>— {h.first_name} {h.last_name}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Actions rapides</h3>
            <div className="space-y-2">
              {devis.statut === 'BROUILLON' && (
                <QuickAction label="Envoyer le devis" icon={<IconSend />} onClick={() => handleAction('envoyer')} disabled={actionLoading} />
              )}
              {devis.statut === 'ENVOYE' && (
                <>
                  <QuickAction label="Marquer accepté" icon={<IconCheck />} onClick={() => handleAction('accepter')} disabled={actionLoading} />
                  <QuickAction label="Marquer refusé" icon={<IconX />} onClick={() => handleAction('refuser')} disabled={actionLoading} />
                </>
              )}
              {devis.statut === 'ACCEPTE' && (
                <QuickAction label="Transformer en facture" icon={<IconInvoice />} onClick={() => setModal({ type: 'transformer' })} disabled={actionLoading} />
              )}
              <QuickAction label="Dupliquer ce devis" icon={<IconCopy />} onClick={() => handleAction('dupliquer')} disabled={actionLoading} />
              <QuickAction label="Télécharger en PDF" icon={<IconPdf />} onClick={() => handleAction('pdf')} />
            </div>
          </div>

          {/* Internal notes */}
          {devis.notes_internes && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5">
              <h3 className="text-[11px] font-bold text-amber-600 uppercase tracking-wider mb-2">Notes internes</h3>
              <p className="text-sm text-amber-800 whitespace-pre-wrap">{devis.notes_internes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ActionBtn({ label, icon, onClick, variant, disabled, loading }: {
  label: string; icon: React.ReactNode; onClick: () => void; variant?: 'primary' | 'danger' | 'success'; disabled?: boolean; loading?: boolean;
}) {
  const base = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = {
    primary: 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm hover:shadow-md',
    danger: 'border border-red-200 text-red-600 hover:bg-red-50',
    success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
    default: 'border border-gray-200 text-gray-700 hover:bg-gray-50',
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} className={`${base} ${styles[variant || 'default']}`}>
      {loading ? <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function LigneRow({ ligne }: { ligne: DevisLigne }) {
  if (ligne.type === 'COMMENTAIRE') {
    return (
      <tr className="border-b border-gray-50">
        <td colSpan={6} className="py-2.5 px-2">
          <p className="text-sm italic text-gray-500">{ligne.designation}</p>
        </td>
      </tr>
    );
  }

  if (ligne.type === 'SAUT_DE_LIGNE') {
    return (
      <tr>
        <td colSpan={6} className="py-1">
          <hr className="border-gray-200" />
        </td>
      </tr>
    );
  }

  if (ligne.type === 'SOUS_TOTAL') {
    return (
      <tr className="border-b border-gray-200 bg-gray-50">
        <td colSpan={5} className="py-2.5 px-2 text-right text-sm font-bold text-gray-700">
          {ligne.designation || 'Sous-total'}
        </td>
        <td className="py-2.5 px-2 text-right text-sm font-bold text-gray-900">
          {formatCurrency(ligne.montant_ht)} €
        </td>
      </tr>
    );
  }

  const remiseStr = ligne.remise_ligne_valeur > 0
    ? ligne.remise_ligne_type === 'POURCENTAGE'
      ? `${ligne.remise_ligne_valeur}%`
      : `${formatCurrency(ligne.remise_ligne_valeur)} €`
    : '—';

  return (
    <tr className={`border-b border-gray-50 ${ligne.est_optionnel ? 'bg-blue-50/30' : ''}`}>
      <td className="py-2.5 px-2 text-xs font-mono text-gray-400">{ligne.reference || ''}</td>
      <td className="py-2.5 px-2">
        <p className={`text-sm text-gray-900 ${ligne.est_optionnel ? 'italic' : ''}`}>
          {ligne.designation}
          {ligne.est_optionnel && <span className="ml-2 text-xs text-blue-500 font-medium">(Option)</span>}
        </p>
        {ligne.description_detaillee && (
          <p className="text-xs text-gray-400 mt-0.5">{ligne.description_detaillee}</p>
        )}
      </td>
      <td className="py-2.5 px-2 text-right text-sm text-gray-700">
        {ligne.quantite}{ligne.unite ? <span className="text-xs text-gray-400 ml-0.5">{ligne.unite}</span> : ''}
      </td>
      <td className="py-2.5 px-2 text-right text-sm text-gray-700">{formatCurrency(ligne.prix_unitaire_ht)} €</td>
      <td className="py-2.5 px-2 text-right text-sm text-gray-500">{remiseStr}</td>
      <td className="py-2.5 px-2 text-right text-sm font-semibold text-gray-900">{formatCurrency(ligne.montant_ht)} €</td>
    </tr>
  );
}

function TotalRow({ label, value, sub, bold, className }: {
  label: string; value: string; sub?: string; bold?: boolean; className?: string;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{label}</span>
      <div className="text-right">
        <span className={`text-sm ${bold ? 'text-lg font-bold text-gray-900' : 'font-medium text-gray-900'} ${className || ''}`}>{value}</span>
        {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, bold, className }: {
  label: string; value: string; bold?: boolean; className?: string;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className={bold ? 'font-bold text-gray-900' : 'text-gray-500'}>{label}</span>
      <span className={`${bold ? 'font-bold text-gray-900' : 'font-medium text-gray-900'} ${className || ''}`}>{value}</span>
    </div>
  );
}

function QuickAction({ label, icon, onClick, disabled }: {
  label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="text-gray-400">{icon}</span>
      {label}
    </button>
  );
}
