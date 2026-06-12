'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSociete } from '@/lib/societe-context';
import { api } from '@/lib/api';
import type { ApiResponse, User, SocieteConfig, FormeJuridique, EmailConfig } from '@/lib/types';

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-medium shadow-xl ${
      type === 'success'
        ? 'bg-emerald-600 text-white shadow-emerald-500/20'
        : 'bg-red-600 text-white shadow-red-500/20'
    }`}>
      <span className="h-5 w-5 shrink-0">
        {type === 'success' ? (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
        ) : (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
        )}
      </span>
      {message}
      <button onClick={onClose} className="ml-2 hover:opacity-70 cursor-pointer">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
    {error}
  </p>;
}

type ActiveSection = 'profile' | 'password' | 'societe' | 'email';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

function resolveLogoUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${BACKEND_URL}${url}`;
}

const FORMES_JURIDIQUES: { value: FormeJuridique; label: string }[] = [
  { value: 'SARL', label: 'SARL' },
  { value: 'SAS', label: 'SAS' },
  { value: 'EURL', label: 'EURL' },
  { value: 'SA', label: 'SA' },
  { value: 'SCI', label: 'SCI' },
  { value: 'AUTO_ENTREPRENEUR', label: 'Auto-entrepreneur' },
  { value: 'ASSOCIATION', label: 'Association' },
  { value: 'AUTRE', label: 'Autre' },
];

function computeSiren(siret: string): string {
  return siret.length >= 9 ? siret.substring(0, 9) : '';
}

function computeTvaIntra(siren: string): string {
  if (siren.length !== 9) return '';
  const sirenNum = parseInt(siren, 10);
  if (isNaN(sirenNum)) return '';
  const key = (12 + 3 * (sirenNum % 97)) % 97;
  return `FR${String(key).padStart(2, '0')}${siren}`;
}

function maskIban(iban: string): string {
  if (!iban || iban.length < 8) return iban;
  return iban.substring(0, 4) + ' **** **** **** **** **** ' + iban.substring(iban.length - 3);
}

interface SocieteSectionProps {
  toast: (t: { message: string; type: 'success' | 'error' }) => void;
  isAdmin: boolean;
}

function SocieteSection({ toast, isAdmin }: SocieteSectionProps) {
  const { refresh: refreshSociete } = useSociete();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showIban, setShowIban] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    raison_sociale: '',
    forme_juridique: '' as string,
    siret: '',
    siren: '',
    tva_intracommunautaire: '',
    code_ape: '',
    capital_social: '',
    rcs_ville: '',
    numero_rcs: '',
    adresse_ligne1: '',
    adresse_ligne2: '',
    code_postal: '',
    ville: '',
    pays: 'France',
    telephone: '',
    email_contact: '',
    email_facturation: '',
    site_web: '',
    logo_url: '',
    couleur_principale: '#1E40AF',
    signature_email: '',
    mentions_legales: '',
    cgv: '',
    message_devis_defaut: '',
    message_facture_defaut: '',
    banque_nom: '',
    iban: '',
    bic: '',
    prefixe_devis: 'DEV',
    prefixe_facture: 'FAC',
    prefixe_client: 'CLI',
    prefixe_bon_commande: 'BC',
    remise_a_zero_annuelle: true,
  });
  const [lastUpdate, setLastUpdate] = useState<{ date: string; by: string } | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<SocieteConfig>>('/parametres/societe');
      const c = res.data;
      setForm({
        raison_sociale: c.raison_sociale || '',
        forme_juridique: c.forme_juridique || '',
        siret: c.siret || '',
        siren: c.siren || '',
        tva_intracommunautaire: c.tva_intracommunautaire || '',
        code_ape: c.code_ape || '',
        capital_social: c.capital_social != null ? String(c.capital_social) : '',
        rcs_ville: c.rcs_ville || '',
        numero_rcs: c.numero_rcs || '',
        adresse_ligne1: c.adresse_ligne1 || '',
        adresse_ligne2: c.adresse_ligne2 || '',
        code_postal: c.code_postal || '',
        ville: c.ville || '',
        pays: c.pays || 'France',
        telephone: c.telephone || '',
        email_contact: c.email_contact || '',
        email_facturation: c.email_facturation || '',
        site_web: c.site_web || '',
        logo_url: c.logo_url || '',
        couleur_principale: c.couleur_principale || '#1E40AF',
        signature_email: c.signature_email || '',
        mentions_legales: c.mentions_legales || '',
        cgv: c.cgv || '',
        message_devis_defaut: c.message_devis_defaut || '',
        message_facture_defaut: c.message_facture_defaut || '',
        banque_nom: c.banque_nom || '',
        iban: c.iban || '',
        bic: c.bic || '',
        prefixe_devis: c.prefixe_devis || 'DEV',
        prefixe_facture: c.prefixe_facture || 'FAC',
        prefixe_client: c.prefixe_client || 'CLI',
        prefixe_bon_commande: c.prefixe_bon_commande || 'BC',
        remise_a_zero_annuelle: c.remise_a_zero_annuelle ?? true,
      });
      if (c.updated_at && c.updated_by) {
        setLastUpdate({ date: c.updated_at, by: c.updated_by });
      }
    } catch {
      // config vide, on garde les défauts
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const updateField = (field: string, value: string | boolean) => {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (field === 'siret' && typeof value === 'string') {
        const clean = value.replace(/\D/g, '').substring(0, 14);
        next.siret = clean;
        next.siren = computeSiren(clean);
        if (clean.length === 14) {
          next.tva_intracommunautaire = computeTvaIntra(next.siren);
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        ...form,
        capital_social: form.capital_social ? Number(form.capital_social) : null,
        forme_juridique: form.forme_juridique || null,
      };
      await api.put<ApiResponse<SocieteConfig>>('/parametres/societe', body);
      await refreshSociete();
      toast({ message: 'Configuration société enregistrée', type: 'success' });
      loadConfig();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
      toast({ message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const res = await fetch(`${API_URL}/parametres/societe/logo`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erreur upload');
      setForm(f => ({ ...f, logo_url: data.data.logo_url }));
      await refreshSociete();
      toast({ message: 'Logo uploadé avec succès', type: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur upload';
      toast({ message, type: 'error' });
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogoDelete = async () => {
    try {
      await api.delete<ApiResponse<null>>('/parametres/societe/logo');
      setForm(f => ({ ...f, logo_url: '' }));
      await refreshSociete();
      toast({ message: 'Logo supprimé', type: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur suppression';
      toast({ message, type: 'error' });
    }
  };

  const year = new Date().getFullYear();

  const inputCls = 'w-full rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-blue-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition';
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-2';
  const readOnly = !isAdmin;

  const [socTab, setSocTab] = useState<'identite' | 'apparence' | 'bancaire'>('identite');

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
          <p className="text-sm text-gray-400">Chargement de la configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {readOnly && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <svg className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">Accès en lecture seule</p>
            <p className="text-xs text-amber-600 mt-0.5">Seul un administrateur peut modifier ces paramètres.</p>
          </div>
        </div>
      )}

      {/* Card principale avec onglets */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Onglets */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setSocTab('identite')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-semibold transition-all cursor-pointer ${
              socTab === 'identite'
                ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/30'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
            Identité & Contact
          </button>
          <button
            onClick={() => setSocTab('apparence')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-semibold transition-all cursor-pointer ${
              socTab === 'apparence'
                ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/30'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 0 0 2.25-2.25V5.25a2.25 2.25 0 0 0-2.25-2.25H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
            Apparence & Docs
          </button>
          <button
            onClick={() => setSocTab('bancaire')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-semibold transition-all cursor-pointer ${
              socTab === 'bancaire'
                ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/30'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" /></svg>
            Bancaire & Textes
          </button>
        </div>

        {/* Tab: Identité & Contact */}
        {socTab === 'identite' && (
          <div className="divide-y divide-gray-100">
            {/* Identité légale */}
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
                </div>
                <h3 className="text-sm font-bold text-gray-800">Identité légale</h3>
              </div>

              <div>
                <label className={labelCls}>Raison sociale</label>
                <input value={form.raison_sociale} onChange={e => updateField('raison_sociale', e.target.value)} placeholder="Nom de votre société" className={inputCls} readOnly={readOnly} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Forme juridique</label>
                  <div className="relative">
                    <select value={form.forme_juridique} onChange={e => updateField('forme_juridique', e.target.value)} className={`${inputCls} appearance-none pr-10 cursor-pointer`} disabled={readOnly}>
                      <option value="">Sélectionner...</option>
                      {FORMES_JURIDIQUES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>SIRET <span className="text-xs font-normal text-gray-400">(14 chiffres)</span></label>
                  <input value={form.siret} onChange={e => updateField('siret', e.target.value)} placeholder="12345678901234" maxLength={14} className={inputCls} readOnly={readOnly} />
                  {form.siren && <p className="mt-1.5 text-xs text-gray-400">SIREN : {form.siren}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>N° TVA intracommunautaire</label>
                  <input value={form.tva_intracommunautaire} onChange={e => updateField('tva_intracommunautaire', e.target.value)} placeholder="FR12345678900" className={inputCls} readOnly={readOnly} />
                </div>
                <div>
                  <label className={labelCls}>Code APE / NAF</label>
                  <input value={form.code_ape} onChange={e => updateField('code_ape', e.target.value)} placeholder="6201Z" className={inputCls} readOnly={readOnly} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Capital social (€)</label>
                  <input type="number" step="0.01" min="0" value={form.capital_social} onChange={e => updateField('capital_social', e.target.value)} placeholder="10000" className={inputCls} readOnly={readOnly} />
                </div>
                <div>
                  <label className={labelCls}>Ville RCS</label>
                  <input value={form.rcs_ville} onChange={e => updateField('rcs_ville', e.target.value)} placeholder="Bobigny" className={inputCls} readOnly={readOnly} />
                </div>
                <div>
                  <label className={labelCls}>Numéro RCS</label>
                  <input value={form.numero_rcs} onChange={e => updateField('numero_rcs', e.target.value)} placeholder="123 456 789" className={inputCls} readOnly={readOnly} />
                </div>
              </div>
            </div>

            {/* Coordonnées */}
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-7 w-7 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
                </div>
                <h3 className="text-sm font-bold text-gray-800">Coordonnées</h3>
                <span className="text-xs text-gray-400 ml-1">— Adresse et moyens de contact</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Adresse</label>
                  <input value={form.adresse_ligne1} onChange={e => updateField('adresse_ligne1', e.target.value)} placeholder="123 rue de la Paix" className={inputCls} readOnly={readOnly} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Complément <span className="text-xs font-normal text-gray-400">(optionnel)</span></label>
                  <input value={form.adresse_ligne2} onChange={e => updateField('adresse_ligne2', e.target.value)} placeholder="Bâtiment A, 2ème étage" className={inputCls} readOnly={readOnly} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Code postal</label>
                  <input value={form.code_postal} onChange={e => updateField('code_postal', e.target.value)} placeholder="75001" className={inputCls} readOnly={readOnly} />
                </div>
                <div>
                  <label className={labelCls}>Ville</label>
                  <input value={form.ville} onChange={e => updateField('ville', e.target.value)} placeholder="Paris" className={inputCls} readOnly={readOnly} />
                </div>
                <div>
                  <label className={labelCls}>Pays</label>
                  <input value={form.pays} onChange={e => updateField('pays', e.target.value)} placeholder="France" className={inputCls} readOnly={readOnly} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Téléphone</label>
                  <input value={form.telephone} onChange={e => updateField('telephone', e.target.value)} placeholder="01 23 45 67 89" className={inputCls} readOnly={readOnly} />
                </div>
                <div>
                  <label className={labelCls}>Email contact</label>
                  <input type="email" value={form.email_contact} onChange={e => updateField('email_contact', e.target.value)} placeholder="contact@societe.fr" className={inputCls} readOnly={readOnly} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    Email facturation
                    <span className="ml-1 relative group">
                      <svg className="inline h-3.5 w-3.5 text-gray-400 cursor-help" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                        Email utilisé comme expéditeur des factures envoyées aux clients. Si vide, l&apos;email contact sera utilisé.
                      </span>
                    </span>
                  </label>
                  <input type="email" value={form.email_facturation} onChange={e => updateField('email_facturation', e.target.value)} placeholder="facturation@societe.fr" className={inputCls} readOnly={readOnly} />
                </div>
                <div>
                  <label className={labelCls}>Site web</label>
                  <input value={form.site_web} onChange={e => updateField('site_web', e.target.value)} placeholder="https://www.societe.fr" className={inputCls} readOnly={readOnly} />
                </div>
              </div>
            </div>

            {/* Footer tab */}
            {isAdmin && (
              <div className="px-6 py-4 bg-gray-50/80 flex items-center justify-between">
                <div>
                  {lastUpdate && (
                    <p className="text-xs text-gray-400">
                      Modifié le{' '}
                      {new Date(lastUpdate.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {saving ? (
                    <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Enregistrement...</>
                  ) : (
                    <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Enregistrer</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab: Apparence & Documents */}
        {socTab === 'apparence' && (
          <div className="divide-y divide-gray-100">
            {/* Logo */}
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-7 w-7 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 0 0 2.25-2.25V5.25a2.25 2.25 0 0 0-2.25-2.25H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
                </div>
                <h3 className="text-sm font-bold text-gray-800">Logo & Couleur</h3>
                <span className="text-xs text-gray-400 ml-1">— Utilisés sur vos documents PDF</span>
              </div>

              <div>
                <label className={labelCls}>Logo de la société</label>
                {form.logo_url ? (
                  <div className="flex items-center gap-5">
                    <div className="h-20 w-44 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                      <img src={resolveLogoUrl(form.logo_url)} alt="Logo" className="max-h-full max-w-full object-contain" />
                    </div>
                    {isAdmin && (
                      <div className="flex flex-col gap-2">
                        <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition cursor-pointer">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
                          Changer
                        </button>
                        <button onClick={handleLogoDelete} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                          Supprimer
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => isAdmin && fileInputRef.current?.click()}
                    disabled={!isAdmin || logoUploading}
                    className="w-full rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 bg-gray-50 hover:bg-blue-50/30 py-8 flex flex-col items-center gap-2.5 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {logoUploading ? (
                      <div className="animate-spin h-7 w-7 border-[3px] border-blue-600 border-t-transparent rounded-full" />
                    ) : (
                      <svg className="h-9 w-9 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 0 0 2.25-2.25V5.25a2.25 2.25 0 0 0-2.25-2.25H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
                    )}
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-500">Cliquez pour sélectionner votre logo</p>
                      <p className="text-xs text-gray-400 mt-0.5">PNG transparent, 400×150px min. Max 2 Mo.</p>
                    </div>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.svg" onChange={handleLogoUpload} className="hidden" />
              </div>

              <div>
                <label className={labelCls}>Couleur des documents PDF</label>
                <div className="flex items-center gap-4">
                  <input
                    type="color"
                    value={form.couleur_principale}
                    onChange={e => updateField('couleur_principale', e.target.value)}
                    className="h-11 w-14 rounded-lg border border-gray-200 cursor-pointer p-1"
                    disabled={readOnly}
                  />
                  <input
                    value={form.couleur_principale}
                    onChange={e => {
                      const v = e.target.value;
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) updateField('couleur_principale', v);
                    }}
                    placeholder="#1E40AF"
                    maxLength={7}
                    className={`${inputCls} w-32 font-mono text-sm`}
                    readOnly={readOnly}
                  />
                  <div className="h-10 w-10 rounded-lg border border-gray-200 shrink-0" style={{ backgroundColor: form.couleur_principale }} />
                  <span className="text-xs text-gray-400">En-têtes et accents des devis/factures</span>
                </div>
              </div>
            </div>

            {/* Numérotation */}
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-7 w-7 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5" /></svg>
                </div>
                <h3 className="text-sm font-bold text-gray-800">Numérotation</h3>
                <span className="text-xs text-gray-400 ml-1">— Préfixes de vos documents</span>
              </div>

              <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-3 flex items-start gap-2.5">
                <svg className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                <p className="text-xs text-amber-700 font-medium">Modifier les préfixes n&apos;affecte pas les documents déjà créés.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {([
                  { field: 'prefixe_devis', label: 'Devis', preview: `${form.prefixe_devis}-${year}-00001` },
                  { field: 'prefixe_facture', label: 'Factures', preview: `${form.prefixe_facture}-${year}-00001` },
                  { field: 'prefixe_client', label: 'Clients', preview: `${form.prefixe_client}-00001` },
                  { field: 'prefixe_bon_commande', label: 'Bons de commande', preview: `${form.prefixe_bon_commande}-${year}-00001` },
                ] as const).map(item => (
                  <div key={item.field}>
                    <label className={labelCls}>{item.label}</label>
                    <input
                      value={form[item.field]}
                      onChange={e => updateField(item.field, e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6))}
                      placeholder="DEV"
                      maxLength={6}
                      className={`${inputCls} font-mono uppercase`}
                      readOnly={readOnly}
                    />
                    <p className="mt-1.5 text-xs text-gray-400 font-mono">{item.preview}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.remise_a_zero_annuelle}
                    onClick={() => !readOnly && updateField('remise_a_zero_annuelle', !form.remise_a_zero_annuelle)}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${readOnly ? 'cursor-not-allowed' : 'cursor-pointer'} ${
                      form.remise_a_zero_annuelle ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      form.remise_a_zero_annuelle ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Remise à zéro annuelle</p>
                    <p className="text-xs text-gray-400">La numérotation repart à 00001 chaque 1er janvier</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Footer tab */}
            {isAdmin && (
              <div className="px-6 py-4 bg-gray-50/80 flex items-center justify-between">
                <div>
                  {lastUpdate && (
                    <p className="text-xs text-gray-400">
                      Modifié le{' '}
                      {new Date(lastUpdate.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {saving ? (
                    <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Enregistrement...</>
                  ) : (
                    <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Enregistrer</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab: Bancaire & Textes */}
        {socTab === 'bancaire' && (
          <div className="divide-y divide-gray-100">
            {/* Informations bancaires */}
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-7 w-7 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" /></svg>
                </div>
                <h3 className="text-sm font-bold text-gray-800">Informations bancaires</h3>
                <span className="text-xs text-gray-400 ml-1">— Affichées sur vos factures</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Nom de la banque</label>
                  <input value={form.banque_nom} onChange={e => updateField('banque_nom', e.target.value)} placeholder="BNP Paribas" className={inputCls} readOnly={readOnly} />
                </div>
                <div>
                  <label className={labelCls}>BIC / SWIFT</label>
                  <input value={form.bic} onChange={e => updateField('bic', e.target.value)} placeholder="BNPAFRPP" className={`${inputCls} font-mono`} readOnly={readOnly} />
                </div>
              </div>
              <div>
                <label className={labelCls}>IBAN</label>
                <div className="relative">
                  <input
                    type={showIban ? 'text' : 'password'}
                    value={showIban ? form.iban : (form.iban ? maskIban(form.iban) : '')}
                    onChange={e => { if (showIban) updateField('iban', e.target.value); }}
                    placeholder="FR76 1234 5678 9012 3456 7890 042"
                    className={`${inputCls} pr-11 font-mono`}
                    readOnly={readOnly || !showIban}
                  />
                  <button
                    type="button"
                    onClick={() => setShowIban(!showIban)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition cursor-pointer"
                  >
                    {showIban ? (
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                    ) : (
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Textes par défaut */}
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-7 w-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                </div>
                <h3 className="text-sm font-bold text-gray-800">Textes par défaut</h3>
                <span className="text-xs text-gray-400 ml-1">— Pré-remplis sur vos documents</span>
              </div>

              <div>
                <label className={labelCls}>Mentions légales <span className="text-xs font-normal text-gray-400">— pied de page PDF</span></label>
                <textarea value={form.mentions_legales} onChange={e => updateField('mentions_legales', e.target.value)} placeholder="SARL au capital de 10 000€ — RCS Bobigny 123 456 789 — TVA FR12345678900" rows={3} className={`${inputCls} resize-y`} readOnly={readOnly} />
              </div>
              <div>
                <label className={labelCls}>Conditions Générales de Vente</label>
                <textarea value={form.cgv} onChange={e => updateField('cgv', e.target.value)} placeholder="Saisissez vos CGV ici..." rows={5} className={`${inputCls} resize-y`} readOnly={readOnly} />
                <p className="mt-1.5 text-xs text-gray-400">Pré-remplies sur chaque nouveau devis. Modifiables individuellement.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Message devis</label>
                  <textarea value={form.message_devis_defaut} onChange={e => updateField('message_devis_defaut', e.target.value)} placeholder="Nous vous remercions de l'intérêt que vous portez à nos services..." rows={4} className={`${inputCls} resize-y`} readOnly={readOnly} />
                </div>
                <div>
                  <label className={labelCls}>Message facture</label>
                  <textarea value={form.message_facture_defaut} onChange={e => updateField('message_facture_defaut', e.target.value)} placeholder="Nous vous remercions de votre confiance. Paiement par virement sous 30 jours." rows={4} className={`${inputCls} resize-y`} readOnly={readOnly} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Signature email</label>
                <textarea value={form.signature_email} onChange={e => updateField('signature_email', e.target.value)} placeholder="Cordialement,&#10;L'équipe commerciale" rows={3} className={`${inputCls} resize-y`} readOnly={readOnly} />
                <p className="mt-1.5 text-xs text-gray-400">Ajoutée automatiquement aux emails envoyés aux clients</p>
              </div>
            </div>

            {/* Footer tab */}
            {isAdmin && (
              <div className="px-6 py-4 bg-gray-50/80 flex items-center justify-between">
                <div>
                  {lastUpdate && (
                    <p className="text-xs text-gray-400">
                      Modifié le{' '}
                      {new Date(lastUpdate.date).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {saving ? (
                    <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Enregistrement...</>
                  ) : (
                    <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Enregistrer</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EmailSection({ toast, isAdmin }: SocieteSectionProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAndVerifying, setSavingAndVerifying] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<'connexion' | 'templates'>('connexion');

  const [form, setForm] = useState({
    smtp_host: '',
    smtp_port: '587',
    smtp_secure: false,
    smtp_user: '',
    smtp_password: '',
    smtp_from_name: '',
    smtp_from_email: '',
    reply_to_email: '',
    signature: '',
    template_facture_sujet: '',
    template_facture_corps: '',
    template_devis_sujet: '',
    template_devis_corps: '',
  });
  const [estConfigure, setEstConfigure] = useState(false);
  const [derniereVerification, setDerniereVerification] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<EmailConfig>>('/email/config');
      const c = res.data;
      setForm({
        smtp_host: c.smtp_host || '',
        smtp_port: c.smtp_port != null ? String(c.smtp_port) : '587',
        smtp_secure: c.smtp_secure || false,
        smtp_user: c.smtp_user || '',
        smtp_password: c.smtp_password || '',
        smtp_from_name: c.smtp_from_name || '',
        smtp_from_email: c.smtp_from_email || '',
        reply_to_email: c.reply_to_email || '',
        signature: c.signature || '',
        template_facture_sujet: c.template_facture_sujet || '',
        template_facture_corps: c.template_facture_corps || '',
        template_devis_sujet: c.template_devis_sujet || '',
        template_devis_corps: c.template_devis_corps || '',
      });
      setEstConfigure(c.est_configure);
      setDerniereVerification(c.derniere_verification);
    } catch {
      // config vide
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const updateField = (field: string, value: string | boolean) => {
    setForm(f => ({ ...f, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        ...form,
        smtp_port: parseInt(form.smtp_port) || 587,
      };
      await api.put<ApiResponse<EmailConfig>>('/email/config', body);
      toast({ message: 'Configuration email enregistrée', type: 'success' });
      loadConfig();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la sauvegarde';
      toast({ message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndVerify = async () => {
    setSavingAndVerifying(true);
    try {
      const body = {
        ...form,
        smtp_port: parseInt(form.smtp_port) || 587,
      };
      await api.put<ApiResponse<EmailConfig>>('/email/config', body);
      toast({ message: 'Configuration enregistrée, vérification en cours...', type: 'success' });

      await api.post<ApiResponse<{ success: boolean }>>('/email/verify', {});
      toast({ message: 'Connexion SMTP vérifiée avec succès !', type: 'success' });
      loadConfig();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec de la vérification SMTP';
      toast({ message, type: 'error' });
      loadConfig();
    } finally {
      setSavingAndVerifying(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast({ message: 'Saisissez une adresse email pour le test', type: 'error' });
      return;
    }
    setTestSending(true);
    try {
      await api.post<ApiResponse<{ success: boolean }>>('/email/test', { destinataire: testEmail });
      toast({ message: `Email de test envoyé à ${testEmail}`, type: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'envoi du test";
      toast({ message, type: 'error' });
    } finally {
      setTestSending(false);
    }
  };

  const inputCls = 'w-full rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-blue-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition';
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-2';
  const readOnly = !isAdmin;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
          <p className="text-sm text-gray-400">Chargement de la configuration email...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {readOnly && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <svg className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">Accès en lecture seule</p>
            <p className="text-xs text-amber-600 mt-0.5">Seul un administrateur peut modifier ces paramètres.</p>
          </div>
        </div>
      )}

      {/* Statut SMTP - Bandeau */}
      <div className={`rounded-2xl overflow-hidden border ${estConfigure ? 'border-emerald-200' : 'border-orange-200'}`}>
        <div className={`px-5 py-4 flex items-center justify-between ${estConfigure ? 'bg-gradient-to-r from-emerald-50 to-emerald-50/30' : 'bg-gradient-to-r from-orange-50 to-orange-50/30'}`}>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${estConfigure ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'}`}>
              {estConfigure ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              )}
            </div>
            <div>
              <p className={`text-sm font-bold ${estConfigure ? 'text-emerald-800' : 'text-orange-800'}`}>
                {estConfigure ? 'SMTP configuré et vérifié' : 'SMTP non configuré'}
              </p>
              <p className={`text-xs mt-0.5 ${estConfigure ? 'text-emerald-600' : 'text-orange-600'}`}>
                {estConfigure
                  ? `Dernière vérification : ${derniereVerification ? new Date(derniereVerification).toLocaleString('fr-FR') : 'jamais'}`
                  : 'Configurez vos paramètres SMTP ci-dessous puis cliquez sur "Enregistrer & Vérifier"'}
              </p>
            </div>
          </div>
          {estConfigure && (
            <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-700">Actif</span>
            </div>
          )}
        </div>
      </div>

      {/* Onglets Connexion / Templates */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('connexion')}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'connexion'
                ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/30'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z" /></svg>
            Connexion SMTP
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm font-semibold transition-all cursor-pointer ${
              activeTab === 'templates'
                ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/30'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            Modèles d&apos;emails
          </button>
        </div>

        {/* Tab: Connexion SMTP */}
        {activeTab === 'connexion' && (
          <div className="divide-y divide-gray-100">
            {/* Serveur SMTP */}
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3" /></svg>
                </div>
                <h3 className="text-sm font-bold text-gray-800">Serveur SMTP</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className={labelCls}>Hôte SMTP</label>
                  <input value={form.smtp_host} onChange={e => updateField('smtp_host', e.target.value)} placeholder="smtp.gmail.com" className={inputCls} readOnly={readOnly} />
                </div>
                <div>
                  <label className={labelCls}>Port</label>
                  <input type="number" value={form.smtp_port} onChange={e => updateField('smtp_port', e.target.value)} placeholder="587" className={inputCls} readOnly={readOnly} />
                </div>
                <div>
                  <label className={labelCls}>SSL/TLS</label>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form.smtp_secure}
                      onClick={() => !readOnly && updateField('smtp_secure', !form.smtp_secure)}
                      className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${readOnly ? 'cursor-not-allowed' : 'cursor-pointer'} ${form.smtp_secure ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                      <span className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${form.smtp_secure ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <span className="text-xs text-gray-500">{form.smtp_secure ? 'Activé (port 465)' : 'Désactivé (STARTTLS)'}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Identifiant</label>
                  <input value={form.smtp_user} onChange={e => updateField('smtp_user', e.target.value)} placeholder="votre@email.com" className={inputCls} readOnly={readOnly} />
                </div>
                <div>
                  <label className={labelCls}>Mot de passe</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.smtp_password}
                      onChange={e => updateField('smtp_password', e.target.value)}
                      placeholder="Mot de passe ou App Password"
                      className={`${inputCls} pr-11`}
                      readOnly={readOnly}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition cursor-pointer"
                    >
                      {showPassword ? (
                        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                      ) : (
                        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                      )}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">Pour Gmail, utilisez un &quot;Mot de passe d&apos;application&quot;</p>
                </div>
              </div>
            </div>

            {/* Expéditeur */}
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-7 w-7 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
                </div>
                <h3 className="text-sm font-bold text-gray-800">Expéditeur</h3>
                <span className="text-xs text-gray-400 ml-1">— Nom et adresse affichés dans les emails envoyés</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Nom affiché</label>
                  <input value={form.smtp_from_name} onChange={e => updateField('smtp_from_name', e.target.value)} placeholder="Ma Société" className={inputCls} readOnly={readOnly} />
                </div>
                <div>
                  <label className={labelCls}>Email expéditeur</label>
                  <input type="email" value={form.smtp_from_email} onChange={e => updateField('smtp_from_email', e.target.value)} placeholder="facturation@masociete.fr" className={inputCls} readOnly={readOnly} />
                </div>
              </div>
              <div>
                <label className={labelCls}>
                  Email de réponse (Reply-To)
                  <span className="ml-1 text-xs font-normal text-gray-400">optionnel</span>
                </label>
                <input type="email" value={form.reply_to_email} onChange={e => updateField('reply_to_email', e.target.value)} placeholder="contact@masociete.fr" className={inputCls} readOnly={readOnly} />
                <p className="mt-1.5 text-xs text-gray-400">Si différent de l&apos;email expéditeur. Les réponses des clients iront à cette adresse.</p>
              </div>
            </div>

            {/* Actions SMTP */}
            {isAdmin && (
              <div className="px-6 py-5 bg-gradient-to-r from-gray-50/80 to-white">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <button
                    onClick={handleSaveAndVerify}
                    disabled={savingAndVerifying || !form.smtp_host || !form.smtp_user || !form.smtp_password}
                    className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-[1.01] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 cursor-pointer"
                  >
                    {savingAndVerifying ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Enregistrement & vérification...
                      </>
                    ) : (
                      <>
                        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                        Enregistrer & Vérifier la connexion
                      </>
                    )}
                  </button>
                  <span className="text-xs text-gray-400 sm:ml-2">Enregistre vos paramètres puis teste automatiquement la connexion au serveur SMTP</span>
                </div>

                {/* Test d'envoi */}
                {estConfigure && (
                  <div className="mt-5 pt-5 border-t border-gray-200/60">
                    <div className="flex items-center gap-2 mb-3">
                      <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                      <span className="text-sm font-semibold text-gray-700">Envoyer un email de test</span>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="destinataire@example.com" className={inputCls} />
                      </div>
                      <button
                        onClick={handleTestEmail}
                        disabled={testSending || !testEmail}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                      >
                        {testSending ? (
                          <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Envoi...</>
                        ) : (
                          <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>Envoyer</>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab: Modèles d'emails */}
        {activeTab === 'templates' && (
          <div className="divide-y divide-gray-100">
            {/* Template Facture */}
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-7 w-7 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                </div>
                <h3 className="text-sm font-bold text-gray-800">Modèle facture</h3>
              </div>
              <div className="rounded-xl bg-blue-50/70 border border-blue-100 p-3">
                <p className="text-xs text-blue-700 font-medium">Variables : <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">{'{{numero}}'}</code> <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">{'{{societe}}'}</code> <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">{'{{montant_ttc}}'}</code> <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">{'{{montant_ht}}'}</code> <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">{'{{date_echeance}}'}</code> <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">{'{{client}}'}</code></p>
              </div>
              <div>
                <label className={labelCls}>Objet</label>
                <input value={form.template_facture_sujet} onChange={e => updateField('template_facture_sujet', e.target.value)} placeholder="Votre facture {{numero}} - {{societe}}" className={inputCls} readOnly={readOnly} />
              </div>
              <div>
                <label className={labelCls}>Corps</label>
                <textarea value={form.template_facture_corps} onChange={e => updateField('template_facture_corps', e.target.value)} placeholder="Bonjour,&#10;&#10;Veuillez trouver ci-joint votre facture..." rows={6} className={`${inputCls} resize-y`} readOnly={readOnly} />
              </div>
            </div>

            {/* Template Devis */}
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                </div>
                <h3 className="text-sm font-bold text-gray-800">Modèle devis</h3>
              </div>
              <div className="rounded-xl bg-blue-50/70 border border-blue-100 p-3">
                <p className="text-xs text-blue-700 font-medium">Variables : <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">{'{{numero}}'}</code> <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">{'{{societe}}'}</code> <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">{'{{montant_ttc}}'}</code> <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">{'{{montant_ht}}'}</code> <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">{'{{date_validite}}'}</code> <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">{'{{client}}'}</code> <code className="bg-blue-100 px-1.5 py-0.5 rounded text-[11px]">{'{{objet}}'}</code></p>
              </div>
              <div>
                <label className={labelCls}>Objet</label>
                <input value={form.template_devis_sujet} onChange={e => updateField('template_devis_sujet', e.target.value)} placeholder="Votre devis {{numero}} - {{societe}}" className={inputCls} readOnly={readOnly} />
              </div>
              <div>
                <label className={labelCls}>Corps</label>
                <textarea value={form.template_devis_corps} onChange={e => updateField('template_devis_corps', e.target.value)} placeholder="Bonjour,&#10;&#10;Veuillez trouver ci-joint votre devis..." rows={6} className={`${inputCls} resize-y`} readOnly={readOnly} />
              </div>
            </div>

            {/* Signature commune */}
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-7 w-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>
                </div>
                <h3 className="text-sm font-bold text-gray-800">Signature</h3>
                <span className="text-xs text-gray-400 ml-1">— Ajoutée en bas de chaque email</span>
              </div>
              <textarea value={form.signature} onChange={e => updateField('signature', e.target.value)} placeholder="Cordialement,&#10;L'équipe comptable" rows={4} className={`${inputCls} resize-y`} readOnly={readOnly} />
            </div>

            {/* Bouton enregistrer pour les templates */}
            {isAdmin && (
              <div className="px-6 py-4 bg-gray-50/80 flex items-center justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {saving ? (
                    <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Enregistrement...</>
                  ) : (
                    <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Enregistrer les modèles</>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ParametresPage() {
  const { user, refreshUser } = useAuth();
  const [activeSection, setActiveSection] = useState<ActiveSection>('profile');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Profile form
  const [profileForm, setProfileForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);

  // Password form
  const [passwordForm, setPasswordForm] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileForm({
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
      });
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      const dirty =
        profileForm.first_name !== user.first_name ||
        profileForm.last_name !== user.last_name ||
        profileForm.email !== user.email;
      setProfileDirty(dirty);
    }
  }, [profileForm, user]);

  const updateProfile = (field: string, value: string) => {
    setProfileForm(f => ({ ...f, [field]: value }));
    setProfileErrors(e => { const n = { ...e }; delete n[field]; return n; });
  };

  const updatePassword = (field: string, value: string) => {
    setPasswordForm(f => ({ ...f, [field]: value }));
    setPasswordErrors(e => { const n = { ...e }; delete n[field]; return n; });
  };

  const handleProfileSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!profileForm.first_name.trim()) errors.first_name = 'Le prénom est obligatoire';
    else if (profileForm.first_name.trim().length < 2) errors.first_name = 'Minimum 2 caractères';
    if (!profileForm.last_name.trim()) errors.last_name = 'Le nom est obligatoire';
    else if (profileForm.last_name.trim().length < 2) errors.last_name = 'Minimum 2 caractères';
    if (!profileForm.email.trim()) errors.email = "L'email est obligatoire";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileForm.email)) errors.email = 'Email invalide';

    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setProfileSaving(true);
    try {
      await api.put<ApiResponse<User>>('/auth/profile', {
        first_name: profileForm.first_name.trim(),
        last_name: profileForm.last_name.trim(),
        email: profileForm.email.trim(),
      });
      await refreshUser();
      setToast({ message: 'Profil mis à jour avec succès', type: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour';
      setToast({ message, type: 'error' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async () => {
    const errors: Record<string, string> = {};
    if (!passwordForm.old_password) errors.old_password = 'Le mot de passe actuel est obligatoire';
    if (!passwordForm.new_password) errors.new_password = 'Le nouveau mot de passe est obligatoire';
    else if (passwordForm.new_password.length < 8) errors.new_password = 'Minimum 8 caractères';
    if (!passwordForm.confirm_password) errors.confirm_password = 'Veuillez confirmer le mot de passe';
    else if (passwordForm.new_password !== passwordForm.confirm_password) errors.confirm_password = 'Les mots de passe ne correspondent pas';
    if (passwordForm.old_password && passwordForm.new_password && passwordForm.old_password === passwordForm.new_password) {
      errors.new_password = 'Le nouveau mot de passe doit être différent';
    }

    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPasswordSaving(true);
    try {
      await api.put('/auth/change-password', {
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
      setShowOldPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setToast({ message: 'Mot de passe modifié avec succès', type: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors du changement de mot de passe';
      if (message.toLowerCase().includes('incorrect') || message.toLowerCase().includes('invalid')) {
        setPasswordErrors({ old_password: 'Mot de passe actuel incorrect' });
      } else {
        setToast({ message, type: 'error' });
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleProfileReset = () => {
    if (user) {
      setProfileForm({ first_name: user.first_name, last_name: user.last_name, email: user.email });
      setProfileErrors({});
    }
  };

  if (!user) return null;

  const passwordStrength = (pw: string) => {
    if (!pw) return { level: 0, label: '', color: '' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { level: 1, label: 'Faible', color: 'bg-red-500' };
    if (score <= 2) return { level: 2, label: 'Moyen', color: 'bg-amber-500' };
    if (score <= 3) return { level: 3, label: 'Bon', color: 'bg-blue-500' };
    return { level: 4, label: 'Fort', color: 'bg-emerald-500' };
  };

  const strength = passwordStrength(passwordForm.new_password);

  const inputClass = (field: string, errors: Record<string, string>) =>
    `w-full rounded-xl border ${errors[field] ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-gray-200 focus:border-blue-400 focus:ring-blue-500/10'} bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition`;

  const userSections: { id: ActiveSection; label: string; icon: React.ReactNode; description: string }[] = [
    {
      id: 'profile',
      label: 'Informations',
      description: 'Gérez vos informations personnelles',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>,
    },
    {
      id: 'password',
      label: 'Sécurité',
      description: 'Modifier votre mot de passe',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>,
    },
    {
      id: 'societe',
      label: 'Société',
      description: 'Informations et apparence de votre société',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>,
    },
    {
      id: 'email',
      label: 'Email',
      description: 'Configuration SMTP et modèles d\'emails',
      icon: <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>,
    },
  ];

  const EyeToggle = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
    <button type="button" onClick={onToggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition cursor-pointer">
      {show ? (
        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
      ) : (
        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
      )}
    </button>
  );

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center shadow-lg shadow-gray-500/20">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
          </span>
          Paramètres
        </h1>
        <p className="mt-1 text-sm text-gray-500 ml-[52px]">Gérez votre compte et vos préférences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left sidebar nav */}
        <div className="lg:w-72 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* User card */}
            <div className="p-5 border-b border-gray-100 bg-gradient-to-br from-gray-50 to-white">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-base font-bold shadow-lg shadow-blue-500/20">
                  {user.first_name[0]}{user.last_name[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{user.first_name} {user.last_name}</p>
                  <p className="text-[11px] text-gray-400">{user.email}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Actif
                </span>
                <span className="text-[11px] text-gray-400 capitalize">{user.role === 'admin' ? 'Administrateur' : user.role === 'admin_technique' ? 'Admin technique' : user.role === 'technicien' ? 'Technicien' : 'Utilisateur'}</span>
              </div>
            </div>

            {/* Section links */}
            <nav className="p-2">
              {userSections.map(sec => (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-all cursor-pointer ${
                    activeSection === sec.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className={`shrink-0 ${activeSection === sec.id ? 'text-blue-600' : 'text-gray-400'}`}>{sec.icon}</span>
                  <div>
                    <p className="text-sm font-semibold">{sec.label}</p>
                    <p className="text-[11px] text-gray-400">{sec.description}</p>
                  </div>
                  {activeSection === sec.id && (
                    <svg className="h-4 w-4 ml-auto text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                  )}
                </button>
              ))}
            </nav>

            {/* Info card */}
            <div className="p-4 border-t border-gray-100">
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Membre depuis</p>
                <p className="text-sm font-semibold text-gray-800">
                  {new Date(user.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right content */}
        <div className="flex-1 min-w-0">
          {/* Profile section */}
          {activeSection === 'profile' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Informations personnelles</h2>
                    <p className="text-xs text-gray-400">Modifiez votre nom, prénom et adresse email</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {/* Avatar preview */}
                <div className="flex items-center gap-5 mb-8 pb-6 border-b border-gray-100">
                  <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold shadow-xl shadow-blue-500/20">
                    {profileForm.first_name?.[0] || '?'}{profileForm.last_name?.[0] || '?'}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900">{profileForm.first_name || '—'} {profileForm.last_name || '—'}</p>
                    <p className="text-sm text-gray-400">{profileForm.email || '—'}</p>
                    <p className="text-xs text-gray-300 mt-1">L&apos;avatar est généré à partir de vos initiales</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Prénom</label>
                    <input
                      value={profileForm.first_name}
                      onChange={e => updateProfile('first_name', e.target.value)}
                      placeholder="Votre prénom"
                      className={inputClass('first_name', profileErrors)}
                    />
                    <FieldError error={profileErrors.first_name} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Nom</label>
                    <input
                      value={profileForm.last_name}
                      onChange={e => updateProfile('last_name', e.target.value)}
                      placeholder="Votre nom"
                      className={inputClass('last_name', profileErrors)}
                    />
                    <FieldError error={profileErrors.last_name} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Adresse email</label>
                    <div className="relative">
                      <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                      <input
                        type="email"
                        value={profileForm.email}
                        onChange={e => updateProfile('email', e.target.value)}
                        placeholder="votre@email.com"
                        className={`${inputClass('email', profileErrors)} pl-11`}
                      />
                    </div>
                    <FieldError error={profileErrors.email} />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
                <div>
                  {profileDirty && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Modifications non enregistrées
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {profileDirty && (
                    <button
                      onClick={handleProfileReset}
                      className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                    >
                      Annuler
                    </button>
                  )}
                  <button
                    onClick={handleProfileSubmit}
                    disabled={profileSaving || !profileDirty}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {profileSaving ? (
                      <>
                        <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Enregistrement...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                        Enregistrer
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Société section */}
          {activeSection === 'societe' && (
            <SocieteSection toast={setToast} isAdmin={user.role === 'admin'} />
          )}

          {/* Email section */}
          {activeSection === 'email' && (
            <EmailSection toast={setToast} isAdmin={user.role === 'admin'} />
          )}

          {/* Password section */}
          {activeSection === 'password' && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Changer le mot de passe</h2>
                    <p className="text-xs text-gray-400">Assurez-vous d&apos;utiliser un mot de passe fort et unique</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                {/* Security tip */}
                <div className="mb-6 rounded-xl bg-blue-50/70 border border-blue-100 p-4 flex items-start gap-3">
                  <svg className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Conseil de sécurité</p>
                    <p className="text-xs text-blue-600 mt-0.5">Utilisez au moins 8 caractères avec des majuscules, des chiffres et des caractères spéciaux.</p>
                  </div>
                </div>

                <div className="space-y-5 max-w-lg">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Mot de passe actuel</label>
                    <div className="relative">
                      <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" /></svg>
                      <input
                        type={showOldPassword ? 'text' : 'password'}
                        value={passwordForm.old_password}
                        onChange={e => updatePassword('old_password', e.target.value)}
                        placeholder="Entrez votre mot de passe actuel"
                        className={`${inputClass('old_password', passwordErrors)} pl-11 pr-11`}
                      />
                      <EyeToggle show={showOldPassword} onToggle={() => setShowOldPassword(!showOldPassword)} />
                    </div>
                    <FieldError error={passwordErrors.old_password} />
                  </div>

                  <div className="border-t border-gray-100 pt-5">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Nouveau mot de passe</label>
                    <div className="relative">
                      <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={passwordForm.new_password}
                        onChange={e => updatePassword('new_password', e.target.value)}
                        placeholder="Minimum 8 caractères"
                        className={`${inputClass('new_password', passwordErrors)} pl-11 pr-11`}
                      />
                      <EyeToggle show={showNewPassword} onToggle={() => setShowNewPassword(!showNewPassword)} />
                    </div>
                    <FieldError error={passwordErrors.new_password} />

                    {/* Strength bar */}
                    {passwordForm.new_password && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-medium text-gray-400">Force du mot de passe</span>
                          <span className={`text-[11px] font-bold ${
                            strength.level <= 1 ? 'text-red-500' : strength.level <= 2 ? 'text-amber-500' : strength.level <= 3 ? 'text-blue-500' : 'text-emerald-500'
                          }`}>{strength.label}</span>
                        </div>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4].map(i => (
                            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= strength.level ? strength.color : 'bg-gray-200'}`} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Confirmer le nouveau mot de passe</label>
                    <div className="relative">
                      <svg className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={passwordForm.confirm_password}
                        onChange={e => updatePassword('confirm_password', e.target.value)}
                        placeholder="Retapez le nouveau mot de passe"
                        className={`${inputClass('confirm_password', passwordErrors)} pl-11 pr-11`}
                      />
                      <EyeToggle show={showConfirmPassword} onToggle={() => setShowConfirmPassword(!showConfirmPassword)} />
                    </div>
                    <FieldError error={passwordErrors.confirm_password} />
                    {passwordForm.confirm_password && passwordForm.new_password === passwordForm.confirm_password && !passwordErrors.confirm_password && (
                      <p className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                        Les mots de passe correspondent
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
                    setPasswordErrors({});
                    setShowOldPassword(false);
                    setShowNewPassword(false);
                    setShowConfirmPassword(false);
                  }}
                  className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={handlePasswordSubmit}
                  disabled={passwordSaving || !passwordForm.old_password || !passwordForm.new_password || !passwordForm.confirm_password}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {passwordSaving ? (
                    <>
                      <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Modification...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                      Changer le mot de passe
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
