'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { FactureDetail, FactureLigne, ApiResponse, StatutFacture, EmailTemplate, AvoirsPossibles, AvoirsFacture, Avoir } from '@/lib/types';

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
  if (val === 0) return '0,00';
  if (val < 1 && val > 0) {
    let str = val.toFixed(10).replace(/0+$/, '').replace(/\.$/, '');
    const decimals = str.includes('.') ? str.split('.')[1].length : 0;
    const minDec = Math.max(decimals, 6);
    return val.toLocaleString('fr-FR', { minimumFractionDigits: minDec, maximumFractionDigits: minDec });
  }
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
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
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
                placeholder="Facture n°..."
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

interface LigneFormData {
  type_ligne: string;
  reference: string;
  designation: string;
  description: string;
  quantite: number;
  prix_unitaire: number;
  remise_pourcentage: number;
  taux_tva: number;
}

const TYPE_LIGNE_OPTIONS = [
  { value: 'PRODUIT', label: 'Produit' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'LOCATION', label: 'Location' },
  { value: 'FORFAIT_NB', label: 'Forfait' },
  { value: 'AUTRE', label: 'Autre' },
];

const TVA_OPTIONS = [
  { value: 20, label: '20 %' },
  { value: 10, label: '10 %' },
  { value: 5.5, label: '5,5 %' },
  { value: 0, label: '0 %' },
];

function LineEditModal({ ligne, onClose, onSave }: {
  ligne: FactureLigne | null;
  onClose: () => void;
  onSave: (data: LigneFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<LigneFormData>({
    type_ligne: ligne?.type_ligne || 'PRODUIT',
    reference: ligne?.reference || '',
    designation: ligne?.designation || '',
    description: ligne?.description || '',
    quantite: ligne?.quantite ?? 1,
    prix_unitaire: ligne?.prix_unitaire ?? 0,
    remise_pourcentage: ligne?.remise_pourcentage ?? 0,
    taux_tva: ligne?.taux_tva ?? 20,
  });
  const [saving, setSaving] = useState(false);

  const brut = (form.quantite || 0) * (form.prix_unitaire || 0);
  const remise = brut * ((form.remise_pourcentage || 0) / 100);
  const totalHt = Math.round((brut - remise) * 100) / 100;
  const tva = Math.round(totalHt * ((form.taux_tva || 0) / 100) * 100) / 100;
  const totalTtc = Math.round((totalHt + tva) * 100) / 100;

  const isValid = form.designation.trim() !== '' && (form.quantite || 0) > 0;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof LigneFormData, value: string | number) => setForm(prev => ({ ...prev, [key]: value }));

  const inputCls = 'w-full rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-blue-500/10 bg-gray-50 py-2.5 px-3.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition';
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-1.5';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
              {ligne ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              )}
            </div>
            <h2 className="text-lg font-bold text-gray-900">{ligne ? 'Modifier la ligne' : 'Ajouter une ligne'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition cursor-pointer">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Type de ligne *</label>
              <select value={form.type_ligne} onChange={e => set('type_ligne', e.target.value)} className={inputCls}>
                {TYPE_LIGNE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Référence</label>
              <input value={form.reference} onChange={e => set('reference', e.target.value)} placeholder="REF..." className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Désignation *</label>
            <input value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="Libellé de la ligne" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Description optionnelle..." className={`${inputCls} resize-y`} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Quantité *</label>
              <input type="number" value={form.quantite} onChange={e => set('quantite', parseFloat(e.target.value) || 0)} step="0.01" min="0" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Prix unitaire HT *</label>
              <input type="number" value={form.prix_unitaire} onChange={e => set('prix_unitaire', parseFloat(e.target.value) || 0)} step="0.0001" min="0" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Remise %</label>
              <input type="number" value={form.remise_pourcentage} onChange={e => set('remise_pourcentage', parseFloat(e.target.value) || 0)} step="0.01" min="0" max="100" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Taux TVA *</label>
              <select value={form.taux_tva} onChange={e => set('taux_tva', parseFloat(e.target.value))} className={inputCls}>
                {TVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 space-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-gray-600">Total HT</span><span className="font-semibold text-gray-900">{fmt(totalHt)} €</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-600">TVA ({form.taux_tva} %)</span><span className="text-gray-700">{fmt(tva)} €</span></div>
            <div className="flex justify-between text-sm font-bold border-t border-blue-200 pt-1.5"><span className="text-blue-700">Total TTC</span><span className="text-blue-700">{fmt(totalTtc)} €</span></div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
          <button onClick={onClose} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
          <button onClick={handleSave} disabled={!isValid || saving} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            {saving ? <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ designation, onClose, onConfirm }: {
  designation: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="p-6 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Supprimer cette ligne ?</h3>
          <p className="text-sm text-gray-500 mb-1">Êtes-vous sûr de vouloir supprimer la ligne :</p>
          <p className="text-sm font-semibold text-gray-700 mb-4">&laquo; {designation} &raquo;</p>
          <p className="text-xs text-red-500">Action irréversible.</p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50 rounded-b-2xl">
          <button onClick={onClose} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
          <button onClick={handleDelete} disabled={deleting} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            {deleting ? <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
            {deleting ? 'Suppression...' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed top-6 right-6 z-[60] flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg transition-all ${
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
    }`}>
      {type === 'success' ? (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
      ) : (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
      )}
      {message}
    </div>
  );
}

function RelevePopover({ ligne, onClose }: { ligne: FactureLigne; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const info = ligne.releve_info;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  if (!info) return null;

  return (
    <div ref={ref} className="absolute left-full top-0 ml-2 z-50 w-72 rounded-xl border border-gray-200 bg-white shadow-xl p-4 text-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-gray-900 text-xs uppercase tracking-wider">Relevé source</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="space-y-2 text-gray-600">
        <p>Relevé du <span className="font-medium text-gray-900">{formatDate(info.date_releve)}</span></p>
        <p>Machine <span className="font-mono font-medium text-gray-900">{info.machine_numero_serie}</span></p>
        <p>Compteur NB: <span className="font-medium">{info.compteur_nb?.toLocaleString('fr-FR')}</span></p>
        {info.compteur_couleur > 0 && (
          <p>Compteur Couleur: <span className="font-medium">{info.compteur_couleur?.toLocaleString('fr-FR')}</span></p>
        )}
        {info.numero_batch && (
          <>
            <div className="border-t border-gray-100 pt-2 mt-2" />
            <p className="text-xs text-gray-500">Source: Import <span className="font-mono font-medium text-blue-600">{info.numero_batch}</span></p>
            {info.date_import && <p className="text-xs text-gray-500">du {formatDate(info.date_import)}</p>}
            {info.user_nom && <p className="text-xs text-gray-500">Importé par {info.user_nom}</p>}
          </>
        )}
      </div>
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
        {info.import_id && (
          <Link href={`/dashboard/parc-machines/imports/${info.import_id}`} className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">
            Voir l&apos;import
          </Link>
        )}
      </div>
    </div>
  );
}

function CreateAvoirModal({ facture, onClose, onCreated }: { facture: FactureDetail; onClose: () => void; onCreated: (avoirId: number) => void }) {
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [possibles, setPossibles] = useState<AvoirsPossibles | null>(null);
  const [typeAvoir, setTypeAvoir] = useState<'TOTAL' | 'PARTIEL'>('TOTAL');
  const [motif, setMotif] = useState('');
  const [error, setError] = useState('');
  const [lignesPartielles, setLignesPartielles] = useState<{ facture_ligne_id: number | null; designation: string; quantite: number; prix_unitaire_ht: number; taux_tva: number; selected: boolean }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<ApiResponse<AvoirsPossibles>>(`/factures/${facture.id}/avoirs-possibles`);
        setPossibles(res.data);
        const initialLignes = (res.data.lignes || [])
          .filter((l: FactureLigne) => !['COMMENTAIRE', 'SOUS_TOTAL', 'SAUT_DE_LIGNE'].includes(l.type_ligne))
          .map((l: FactureLigne) => ({
            facture_ligne_id: l.id || null,
            designation: l.designation,
            quantite: parseFloat(String(l.quantite)) || 1,
            prix_unitaire_ht: parseFloat(String(l.prix_unitaire)) || 0,
            taux_tva: parseFloat(String(l.taux_tva)) || 20,
            selected: true,
          }));
        setLignesPartielles(initialLignes);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur lors du chargement');
      } finally {
        setLoading(false);
      }
    })();
  }, [facture.id]);

  const selectedLignes = lignesPartielles.filter(l => l.selected);
  const totalHtPartiel = selectedLignes.reduce((sum, l) => sum + Math.round(l.quantite * l.prix_unitaire_ht * 100) / 100, 0);
  const totalTvaPartiel = selectedLignes.reduce((sum, l) => {
    const ht = Math.round(l.quantite * l.prix_unitaire_ht * 100) / 100;
    return sum + Math.round(ht * (l.taux_tva / 100) * 100) / 100;
  }, 0);
  const totalTtcPartiel = Math.round((totalHtPartiel + totalTvaPartiel) * 100) / 100;

  const handleCreate = async () => {
    setError('');
    setCreating(true);
    try {
      const body: Record<string, unknown> = {
        facture_id: facture.id,
        type_avoir: typeAvoir,
        motif: motif || undefined,
      };
      if (typeAvoir === 'PARTIEL') {
        body.lignes = selectedLignes.map(l => ({
          facture_ligne_id: l.facture_ligne_id,
          designation: l.designation,
          quantite: l.quantite,
          prix_unitaire_ht: l.prix_unitaire_ht,
          taux_tva: l.taux_tva,
        }));
      }
      const res = await api.post<ApiResponse<{ id: number }>>('/avoirs', body);
      onCreated(res.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  const resteAvoirable = possibles?.reste_avoirable ?? 0;
  const depassement = typeAvoir === 'PARTIEL' && totalTtcPartiel > resteAvoirable + 0.01;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185Z" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Créer un avoir</h2>
              <p className="text-xs text-gray-400">Sur la facture {facture.numero_facture} — Reste avoirable : {fmt(resteAvoirable)} €</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition cursor-pointer">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center">
            <div className="animate-spin h-8 w-8 border-[3px] border-red-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2.5">
                <svg className="h-4 w-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            {possibles && possibles.avoirs_existants.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                <p className="text-xs font-semibold text-amber-800 mb-1">{possibles.avoirs_existants.length} avoir(s) déjà émis sur cette facture</p>
                {possibles.avoirs_existants.map(a => (
                  <p key={a.id} className="text-xs text-amber-700">{a.numero} — {fmt(a.montant_ttc)} € — {a.statut}</p>
                ))}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Type d&apos;avoir</label>
              <div className="flex gap-3">
                <button onClick={() => setTypeAvoir('TOTAL')}
                  className={`flex-1 rounded-xl border-2 p-4 text-center transition cursor-pointer ${typeAvoir === 'TOTAL' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className="text-sm font-bold text-gray-900">Total</p>
                  <p className="text-xs text-gray-500 mt-1">Reprend toutes les lignes de la facture</p>
                </button>
                <button onClick={() => setTypeAvoir('PARTIEL')}
                  className={`flex-1 rounded-xl border-2 p-4 text-center transition cursor-pointer ${typeAvoir === 'PARTIEL' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className="text-sm font-bold text-gray-900">Partiel</p>
                  <p className="text-xs text-gray-500 mt-1">Choisir les lignes et ajuster les montants</p>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Motif</label>
              <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={2} placeholder="Erreur de facturation, geste commercial, retour matériel..."
                className="w-full rounded-xl border border-gray-200 focus:border-red-400 focus:ring-red-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition resize-y" />
            </div>

            {typeAvoir === 'PARTIEL' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Lignes à inclure</label>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50/80">
                        <th className="px-3 py-2 w-8"></th>
                        <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-500 uppercase">Désignation</th>
                        <th className="px-3 py-2 text-center text-[11px] font-bold text-gray-500 uppercase w-20">Qté</th>
                        <th className="px-3 py-2 text-right text-[11px] font-bold text-gray-500 uppercase w-24">P.U HT</th>
                        <th className="px-3 py-2 text-right text-[11px] font-bold text-gray-500 uppercase w-24">Total HT</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lignesPartielles.map((l, i) => {
                        const totalLigne = Math.round(l.quantite * l.prix_unitaire_ht * 100) / 100;
                        return (
                          <tr key={i} className={l.selected ? 'bg-red-50/30' : 'opacity-50'}>
                            <td className="px-3 py-2">
                              <input type="checkbox" checked={l.selected}
                                onChange={() => setLignesPartielles(prev => prev.map((ll, j) => j === i ? { ...ll, selected: !ll.selected } : ll))}
                                className="h-4 w-4 rounded text-red-600 border-gray-300 focus:ring-red-500 cursor-pointer" />
                            </td>
                            <td className="px-3 py-2 text-gray-900">{l.designation}</td>
                            <td className="px-3 py-2">
                              <input type="number" value={l.quantite} step="0.01" min="0.01" disabled={!l.selected}
                                onChange={e => setLignesPartielles(prev => prev.map((ll, j) => j === i ? { ...ll, quantite: parseFloat(e.target.value) || 0 } : ll))}
                                className="w-full text-center rounded-lg border border-gray-200 px-2 py-1 text-sm disabled:bg-gray-100 disabled:opacity-50" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" value={l.prix_unitaire_ht} step="0.01" min="0" disabled={!l.selected}
                                onChange={e => setLignesPartielles(prev => prev.map((ll, j) => j === i ? { ...ll, prix_unitaire_ht: parseFloat(e.target.value) || 0 } : ll))}
                                className="w-full text-right rounded-lg border border-gray-200 px-2 py-1 text-sm disabled:bg-gray-100 disabled:opacity-50" />
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-red-700">{l.selected ? `-${fmt(totalLigne)} €` : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-3 space-y-1">
                  <div className="flex justify-between text-sm"><span className="text-gray-600">Total HT (crédit)</span><span className="font-semibold text-red-700">-{fmt(totalHtPartiel)} €</span></div>
                  <div className="flex justify-between text-sm"><span className="text-gray-600">TVA</span><span className="text-red-600">-{fmt(totalTvaPartiel)} €</span></div>
                  <div className="flex justify-between text-sm font-bold border-t border-red-200 pt-1"><span className="text-red-700">Total TTC</span><span className="text-red-700">-{fmt(totalTtcPartiel)} €</span></div>
                  {depassement && (
                    <p className="text-xs text-red-600 font-semibold mt-1">Dépasse le reste avoirable ({fmt(resteAvoirable)} €)</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
          <button onClick={onClose} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
          <button onClick={handleCreate}
            disabled={creating || loading || (typeAvoir === 'PARTIEL' && (selectedLignes.length === 0 || depassement))}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer">
            {creating ? <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : null}
            {creating ? 'Création...' : 'Créer l\'avoir'}
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
  const [showLineModal, setShowLineModal] = useState(false);
  const [editingLigne, setEditingLigne] = useState<FactureLigne | null>(null);
  const [deletingLigne, setDeletingLigne] = useState<FactureLigne | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [popoverLigneId, setPopoverLigneId] = useState<number | null>(null);
  const [showAvoirModal, setShowAvoirModal] = useState(false);
  const [avoirsFacture, setAvoirsFacture] = useState<AvoirsFacture | null>(null);

  const isBrouillon = facture?.statut === 'Brouillon';
  const isAnnulee = facture?.statut === 'Annulée';
  const isEditable = isBrouillon || isAnnulee;

  const handleAddLine = () => { setEditingLigne(null); setShowLineModal(true); };
  const handleEditLine = (l: FactureLigne) => { setEditingLigne(l); setShowLineModal(true); };

  const handleSaveLine = async (data: LigneFormData) => {
    if (!facture) return;
    try {
      if (editingLigne?.id) {
        await api.put(`/factures/${facture.id}/lignes/${editingLigne.id}`, data);
        setToast({ message: 'Ligne modifiée avec succès', type: 'success' });
      } else {
        await api.post(`/factures/${facture.id}/lignes`, data);
        setToast({ message: 'Ligne ajoutée avec succès', type: 'success' });
      }
      setShowLineModal(false);
      setEditingLigne(null);
      loadFacture();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement', type: 'error' });
    }
  };

  const handleDeleteLine = async () => {
    if (!facture || !deletingLigne?.id) return;
    try {
      await api.delete(`/factures/${facture.id}/lignes/${deletingLigne.id}`);
      setToast({ message: 'Ligne supprimée', type: 'success' });
      setDeletingLigne(null);
      loadFacture();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors de la suppression', type: 'error' });
    }
  };

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

  const loadAvoirs = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<AvoirsFacture>>(`/factures/${id}/avoirs`);
      setAvoirsFacture(res.data);
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => { loadAvoirs(); }, [loadAvoirs]);

  const handleAction = async (action: string) => {
    if (!facture) return;
    try {
      if (action === 'pdf') {
        setPdfLoading(true);
        try {
          const response = await fetch(`${API_URL}/factures/${facture.id}/pdf`, {
            credentials: 'include',
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
        <div className="animate-spin h-10 w-10 border-[3px] border-blue-600 border-t-transparent rounded-full" />
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
              <button onClick={() => handleAction('valider')} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition cursor-pointer">Valider</button>
              <button onClick={() => handleAction('supprimer')} className="px-4 py-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer">Supprimer</button>
            </>
          )}
          {facture.statut === 'Validée' && (
            <>
              <button onClick={() => setShowEmailModal(true)} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition cursor-pointer inline-flex items-center gap-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                Envoyer par email
              </button>
              <button onClick={() => handleAction('envoyer')} className="px-4 py-2 rounded-xl border border-blue-200 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition cursor-pointer">Marquer envoyée</button>
              <button onClick={() => setShowAvoirModal(true)} className="px-4 py-2 rounded-xl border-2 border-red-300 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100 transition cursor-pointer">Créer un avoir</button>
            </>
          )}
          {facture.statut === 'Envoyée' && (
            <>
            <button onClick={() => setShowEmailModal(true)} className="px-4 py-2 rounded-xl border border-blue-200 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition cursor-pointer inline-flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
              Renvoyer par email
            </button>
            <button onClick={() => setShowAvoirModal(true)} className="px-4 py-2 rounded-xl border-2 border-red-300 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100 transition cursor-pointer">Créer un avoir</button>
            </>
          )}
          {facture.statut !== 'Brouillon' && (
            <button onClick={() => handleAction('pdf')} disabled={pdfLoading} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50 inline-flex items-center gap-2">
              {pdfLoading && <span className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full" />}
              PDF
            </button>
          )}
          {isAnnulee && (
            <>
              <button onClick={() => router.push(`/dashboard/factures/${facture.id}/modifier`)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition cursor-pointer">Modifier</button>
              <button onClick={() => handleAction('supprimer')} className="px-4 py-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer">Supprimer</button>
            </>
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
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
              <p className="font-semibold text-blue-800">Concerne votre contrat n° : {facture.numero_contrat}</p>
              <p className="text-sm text-blue-600 mt-1">CONTRAT COPIE</p>
              <p className="text-sm text-blue-600">Matricule machine: {facture.numero_serie}</p>
              <p className="text-sm text-blue-600">Modèle : {facture.modele_machine}</p>
            </div>
          )}

          {/* Lignes */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Lignes de facture</h2>
              {isEditable && (
                <button onClick={handleAddLine} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition cursor-pointer">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Ajouter une ligne
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[8%]">Réf.</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">{isBrouillon ? 'Désignation' : 'Désignation'}</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[10%]">Qté</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[14%]">P.U HT</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[8%]">Rem</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[14%]">Total HT</th>
                    {isEditable && <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-[80px]">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {facture.lignes.map(l => {
                    const colSpan = isEditable ? 7 : 6;
                    if (l.type_ligne === 'SAUT_DE_LIGNE') return <tr key={l.id}><td colSpan={colSpan} className="py-2" /></tr>;
                    if (l.type_ligne === 'COMMENTAIRE') return (
                      <tr key={l.id}><td colSpan={colSpan} className="px-4 py-2.5 bg-gray-50 text-sm italic text-gray-500">{l.designation}</td></tr>
                    );
                    if (l.type_ligne === 'SOUS_TOTAL') return (
                      <tr key={l.id} className="bg-gray-50">
                        <td colSpan={colSpan - 1} className="px-4 py-2.5 text-right font-semibold text-sm text-gray-700">Sous-total</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-sm text-gray-900">{fmt(l.total_ht)} €</td>
                      </tr>
                    );

                    const isRegul = l.type_ligne.startsWith('REGULARISATION');
                    const remStr = parseFloat(String(l.remise_pourcentage)) > 0 ? `-${l.remise_pourcentage}%` :
                      parseFloat(String(l.remise_montant)) > 0 ? `-${fmt(l.remise_montant)} €` : '';

                    return (
                      <tr key={l.id} className="hover:bg-gray-50/50 group">
                        <td className="px-4 py-3 text-sm text-gray-500 font-mono">{l.reference || ''}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-1.5">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{l.designation}</p>
                              {l.description && <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-line">{l.description}</p>}
                            </div>
                            {isRegul && l.releve_compteur_id && (
                              <div className="relative flex-shrink-0">
                                <button
                                  onClick={() => setPopoverLigneId(popoverLigneId === l.id ? null : (l.id ?? null))}
                                  title="Voir le relevé source"
                                  className="p-1 rounded-md hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition cursor-pointer"
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>
                                </button>
                                {popoverLigneId === l.id && l.releve_info && (
                                  <RelevePopover ligne={l} onClose={() => setPopoverLigneId(null)} />
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-600">{isRegul ? '' : l.quantite}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600">{isRegul ? '' : `${fmtPU(l.prix_unitaire)} €`}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-500">{remStr}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{fmt(l.total_ht)} €</td>
                        {isEditable && (
                          <td className="px-3 py-3 text-center">
                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleEditLine(l)} title="Modifier" className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition cursor-pointer">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
                              </button>
                              <button onClick={() => setDeletingLigne(l)} title="Supprimer" className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition cursor-pointer">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {isEditable && (
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/30">
                <button onClick={handleAddLine} className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition cursor-pointer">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Ajouter une ligne
                </button>
              </div>
            )}
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
                <div className="flex justify-between text-base font-bold text-blue-700 pt-1 border-t border-blue-200"><span>TTC</span><span>{fmt(facture.total_ttc)} €</span></div>
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
              <div className="flex justify-between border-t border-gray-100 pt-2"><span className="text-sm font-semibold text-blue-700">Total TTC</span><span className="text-xl font-bold text-blue-700">{fmt(facture.total_ttc)} €</span></div>
            </div>
          </div>

          {/* Client */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Client</h3>
            {(() => {
              const cl = (facture as unknown as Record<string, unknown>).client_live as { numero_client?: string; raison_sociale?: string; email?: string; telephone?: string; adresse?: string; code_postal?: string; ville?: string } | null;
              const nom = cl?.raison_sociale || facture.client_raison_sociale;
              const code = cl?.numero_client || facture.code_client;
              const email = cl?.email || facture.client_email;
              const tel = cl?.telephone || facture.client_telephone;
              const adresse = cl?.adresse || facture.client_adresse;
              const cp = cl?.code_postal || facture.client_cp;
              const ville = cl?.ville || facture.client_ville;
              return (
                <>
                  <p className="font-semibold text-gray-900 text-sm cursor-pointer hover:text-blue-600 transition" onClick={() => router.push(`/dashboard/clients/${facture.client_id}`)}>{nom}</p>
                  <p className="text-xs text-gray-400 font-mono">{code}</p>
                  {email && <p className="text-sm text-gray-500 mt-1">{email}</p>}
                  {tel && <p className="text-sm text-gray-500">{tel}</p>}
                  <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
                    <p>{adresse}</p>
                    <p>{cp} {ville}</p>
                  </div>
                </>
              );
            })()}
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
                  <span className="text-blue-600 font-semibold cursor-pointer hover:underline" onClick={() => facture.contrat_id && router.push(`/dashboard/contrats/${facture.contrat_id}`)}>{facture.numero_contrat}</span>
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
                    <div className="h-2 w-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
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

          {avoirsFacture && avoirsFacture.avoirs.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-red-600 uppercase tracking-wider mb-3">Avoirs rattachés</h3>
              <div className="space-y-2">
                {avoirsFacture.avoirs.map((a: Avoir) => (
                  <div key={a.id} className="flex items-center justify-between text-sm cursor-pointer hover:bg-red-50 rounded-lg px-2 py-1.5 -mx-2 transition"
                    onClick={() => router.push(`/dashboard/factures/avoirs/${a.id}`)}>
                    <div>
                      <span className="font-mono font-semibold text-red-700">{a.numero}</span>
                      <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        a.statut === 'Annulé' ? 'bg-gray-100 text-gray-400 line-through' :
                        a.statut === 'Validé' ? 'bg-blue-50 text-blue-700' :
                        a.statut === 'Remboursé' ? 'bg-emerald-50 text-emerald-700' :
                        a.statut === 'Imputé' ? 'bg-indigo-50 text-indigo-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{a.statut}</span>
                    </div>
                    <span className="font-semibold text-red-700">-{fmt(a.montant_ttc)} €</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-red-200 mt-3 pt-3 space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-gray-500">TTC facture</span><span className="font-medium">{fmt(avoirsFacture.facture_total_ttc)} €</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Total avoirs</span><span className="font-medium text-red-600">-{fmt(avoirsFacture.total_avoirs)} €</span></div>
                <div className="flex justify-between text-sm font-bold border-t border-red-200 pt-1.5"><span className="text-gray-900">Net dû</span><span className="text-gray-900">{fmt(avoirsFacture.net_du)} €</span></div>
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

      {showLineModal && (
        <LineEditModal
          ligne={editingLigne}
          onClose={() => { setShowLineModal(false); setEditingLigne(null); }}
          onSave={handleSaveLine}
        />
      )}

      {deletingLigne && (
        <DeleteConfirmModal
          designation={deletingLigne.designation}
          onClose={() => setDeletingLigne(null)}
          onConfirm={handleDeleteLine}
        />
      )}

      {showAvoirModal && facture && ['Validée', 'Envoyée'].includes(facture.statut) && (
        <CreateAvoirModal
          facture={facture}
          onClose={() => setShowAvoirModal(false)}
          onCreated={(avoirId) => {
            setShowAvoirModal(false);
            router.push(`/dashboard/factures/avoirs/${avoirId}`);
          }}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
