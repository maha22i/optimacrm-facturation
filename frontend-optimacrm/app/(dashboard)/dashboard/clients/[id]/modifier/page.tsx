'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { ApiResponse, ClientDetail } from '@/lib/types';
import ChampsPersonnalisesForm from '@/components/ChampsPersonnalisesForm';
import { useSiretLookup } from '@/lib/hooks/useSiretLookup';

interface EditFormData {
  raison_sociale: string;
  forme_juridique: string;
  siret: string;
  siren: string;
  numero_rcs: string;
  tva_intracommunautaire: string;
  code_ape: string;
  site_web: string;
  telephone_principal: string;
  email_principal: string;
  email_comptabilite: string;
  notes: string;
  statut: string;
  blocage_raison: string;
  delai_paiement: string;
  mode_paiement_prefere: string;
  remise_globale: string;
  taux_tva_defaut: string;
  plafond_encours: string;
  iban: string;
  bic: string;
  reference_mandat_sepa: string;
  date_mandat_sepa: string;
  sequence_mandat: string;
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
    <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
    {error}
  </p>;
}

export default function ModifierClientPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [form, setForm] = useState<EditFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientNumero, setClientNumero] = useState('');

  const fetchClient = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<ClientDetail>>(`/clients/${clientId}`);
      const c = res.data;
      setClientName(c.raison_sociale);
      setClientNumero(c.numero_client);
      setForm({
        raison_sociale: c.raison_sociale,
        forme_juridique: c.forme_juridique,
        siret: c.siret || '',
        siren: c.siren || '',
        numero_rcs: c.numero_rcs || '',
        tva_intracommunautaire: c.tva_intracommunautaire || '',
        code_ape: c.code_ape || '',
        site_web: c.site_web || '',
        telephone_principal: c.telephone_principal || '',
        email_principal: c.email_principal,
        email_comptabilite: c.email_comptabilite || '',
        notes: c.notes || '',
        statut: c.statut,
        blocage_raison: c.blocage_raison || '',
        delai_paiement: c.delai_paiement,
        mode_paiement_prefere: c.mode_paiement_prefere || '',
        remise_globale: String(c.remise_globale),
        taux_tva_defaut: String(c.taux_tva_defaut),
        plafond_encours: c.plafond_encours !== null ? String(c.plafond_encours) : '',
        iban: c.iban || '',
        bic: c.bic || '',
        reference_mandat_sepa: c.reference_mandat_sepa || '',
        date_mandat_sepa: c.date_mandat_sepa || '',
        sequence_mandat: c.sequence_mandat || 'RCUR',
      });
    } catch {
      setToast({ message: 'Erreur lors du chargement', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchClient(); }, [fetchClient]);

  useEffect(() => {
    if (!loading && window.location.hash === '#bancaire') {
      const el = document.getElementById('bancaire');
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          el.classList.add('ring-2', 'ring-indigo-400', 'ring-offset-4', 'rounded-xl');
          setTimeout(() => el.classList.remove('ring-2', 'ring-indigo-400', 'ring-offset-4', 'rounded-xl'), 3000);
        }, 100);
      }
    }
  }, [loading]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const [champsPersoValeurs, setChampsPersoValeurs] = useState<Record<string, string>>({});
  const handleChampsPersoChange = useCallback((v: Record<string, string>) => setChampsPersoValeurs(v), []);

  const { lookup: siretLookup, status: siretStatus, error: siretError, reset: siretReset } = useSiretLookup();
  const siretDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialSiretRef = useRef(true);

  useEffect(() => {
    if (form?.siret) isInitialSiretRef.current = false;
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSiretChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 14);
    updateField('siret', sanitized);
    isInitialSiretRef.current = false;

    const cleaned = sanitized.replace(/\s/g, '');
    if (cleaned.length !== 9 && cleaned.length !== 14) {
      siretReset();
      return;
    }

    if (siretDebounceRef.current) clearTimeout(siretDebounceRef.current);
    siretDebounceRef.current = setTimeout(async () => {
      const result = await siretLookup(cleaned);
      if (result) {
        setForm(prev => prev ? ({
          ...prev,
          raison_sociale: prev.raison_sociale || result.raisonSociale,
          forme_juridique: prev.forme_juridique === 'SARL' ? result.formeJuridique : prev.forme_juridique,
          siret: result.siret || sanitized,
          siren: prev.siren || result.siren,
          numero_rcs: prev.numero_rcs || result.numeroRcs,
          tva_intracommunautaire: prev.tva_intracommunautaire || result.tvaIntra,
          code_ape: prev.code_ape || result.codeApe,
        }) : prev);
      }
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (siretDebounceRef.current) clearTimeout(siretDebounceRef.current);
    };
  }, []);

  const updateField = (field: string, value: string) => {
    setForm(f => f ? { ...f, [field]: value } : f);
    setErrors(e => { const n = { ...e }; delete n[field]; return n; });
  };

  const validate = (): boolean => {
    if (!form) return false;
    const newErrors: Record<string, string> = {};
    if (!form.raison_sociale.trim()) newErrors.raison_sociale = 'La raison sociale est obligatoire';
    if (!form.email_principal.trim()) newErrors.email_principal = "L'email est obligatoire";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email_principal)) newErrors.email_principal = 'Email invalide';
    if (form.siret && !/^\d{14}$/.test(form.siret)) newErrors.siret = 'Le SIRET doit faire exactement 14 chiffres';
    if (form.statut === 'BLOQUE' && !form.blocage_raison.trim()) newErrors.blocage_raison = 'La raison du blocage est obligatoire';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!form || !validate()) return;

    setSaving(true);
    try {
      await api.put(`/clients/${clientId}`, {
        raison_sociale: form.raison_sociale,
        forme_juridique: form.forme_juridique,
        siret: form.siret || null,
        siren: form.siren || null,
        numero_rcs: form.numero_rcs || null,
        tva_intracommunautaire: form.tva_intracommunautaire || null,
        code_ape: form.code_ape || null,
        site_web: form.site_web || null,
        telephone_principal: form.telephone_principal || null,
        email_principal: form.email_principal,
        email_comptabilite: form.email_comptabilite || null,
        notes: form.notes || null,
        statut: form.statut,
        blocage_raison: form.statut === 'BLOQUE' ? form.blocage_raison : null,
        delai_paiement: form.delai_paiement,
        mode_paiement_prefere: form.mode_paiement_prefere || null,
        remise_globale: parseFloat(form.remise_globale) || 0,
        taux_tva_defaut: parseFloat(form.taux_tva_defaut),
        plafond_encours: form.plafond_encours ? parseFloat(form.plafond_encours) : null,
        iban: form.iban || null,
        bic: form.bic || null,
        reference_mandat_sepa: form.reference_mandat_sepa || null,
        date_mandat_sepa: form.date_mandat_sepa || null,
        sequence_mandat: form.sequence_mandat || 'RCUR',
      });

      if (Object.keys(champsPersoValeurs).length > 0) {
        await api.put(`/champs-config/valeurs/CLIENT/${clientId}`, { valeurs: champsPersoValeurs });
      }

      setToast({ message: 'Client mis à jour avec succès', type: 'success' });
      setTimeout(() => router.push(`/dashboard/clients/${clientId}`), 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la mise à jour';
      setToast({ message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-4 border-violet-100" />
          <div className="absolute inset-0 h-12 w-12 rounded-full border-4 border-violet-600 border-t-transparent animate-spin" />
        </div>
        <p className="text-sm text-gray-400 font-medium">Chargement du client...</p>
      </div>
    );
  }

  const inputClass = (field: string) =>
    `w-full rounded-xl border bg-gray-50/80 ${errors[field] ? 'border-red-300 bg-red-50/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' : 'border-gray-200 focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20'} py-2.5 px-3.5 text-sm text-gray-900 outline-none transition-all duration-200 placeholder:text-gray-400`;

  const selectClass = (field: string) =>
    `w-full rounded-xl border bg-gray-50/80 ${errors[field] ? 'border-red-300 bg-red-50/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' : 'border-gray-200 focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20'} py-2.5 px-3.5 text-sm text-gray-900 outline-none transition-all duration-200`;

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-medium shadow-xl backdrop-blur-sm transition-all duration-300 ${
          toast.type === 'success'
            ? 'bg-emerald-600/95 text-white'
            : 'bg-red-600/95 text-white'
        }`}>
          {toast.type === 'success' ? (
            <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          ) : (
            <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
          )}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 rounded-lg p-1 hover:bg-white/20 transition cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Page header */}
      <div className="mb-8">
        <button
          onClick={() => router.push(`/dashboard/clients/${clientId}`)}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-violet-600 mb-5 transition-colors duration-200 cursor-pointer group"
        >
          <svg className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          Retour à la fiche
        </button>

        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/25 flex-shrink-0">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-gray-900">Modifier {clientName}</h1>
              <span className="inline-flex items-center rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-mono font-medium text-gray-600">{clientNumero}</span>
            </div>
            <p className="text-sm text-gray-500">Client {clientNumero}</p>
          </div>
        </div>
      </div>

      {/* Form container */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 max-w-4xl">

        {/* ── Identité ── */}
        <section>
          <div className="flex items-center gap-2.5 mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            <svg className="h-4.5 w-4.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>
            <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Identité</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Raison sociale – full width */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Raison sociale <span className="text-red-400">*</span></label>
              <input value={form.raison_sociale} onChange={e => updateField('raison_sociale', e.target.value)} className={inputClass('raison_sociale')} />
              <FieldError error={errors.raison_sociale} />
            </div>

            {/* Forme juridique + Statut */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Forme juridique</label>
              <select value={form.forme_juridique} onChange={e => updateField('forme_juridique', e.target.value)} className={selectClass('')}>
                {['SARL','SAS','EURL','SA','SCI','AUTO_ENTREPRENEUR','ASSOCIATION','AUTRE'].map(v => (
                  <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Statut</label>
              <select value={form.statut} onChange={e => updateField('statut', e.target.value)} className={selectClass('')}>
                <option value="ACTIF">Actif</option>
                <option value="PROSPECT">Prospect</option>
                <option value="BLOQUE">Bloqué</option>
                <option value="INACTIF">Inactif</option>
              </select>
            </div>

            {/* Blocage raison – conditional */}
            {form.statut === 'BLOQUE' && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Raison du blocage <span className="text-red-400">*</span></label>
                <input
                  value={form.blocage_raison}
                  onChange={e => updateField('blocage_raison', e.target.value)}
                  className={`w-full rounded-xl border bg-amber-50/60 ${errors.blocage_raison ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20' : 'border-amber-300 focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20'} py-2.5 px-3.5 text-sm text-gray-900 outline-none transition-all duration-200 placeholder:text-gray-400`}
                  placeholder="Indiquez la raison du blocage..."
                />
                <FieldError error={errors.blocage_raison} />
              </div>
            )}

            {/* SIRET */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                SIRET <span className="text-xs font-normal text-gray-400">(9 ou 14 chiffres pour auto-remplir)</span>
              </label>
              <div className="relative">
                <input
                  value={form.siret}
                  onChange={e => handleSiretChange(e.target.value)}
                  maxLength={14}
                  className={`${inputClass('siret')} pr-10`}
                  placeholder="14 chiffres"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {siretStatus === 'loading' && (
                    <svg className="animate-spin h-5 w-5 text-violet-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {siretStatus === 'success' && (
                    <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  )}
                  {(siretStatus === 'error' || siretStatus === 'not_found') && (
                    <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                  )}
                </div>
              </div>
              <FieldError error={errors.siret} />
              {siretStatus === 'success' && (
                <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Informations récupérées depuis l&apos;INSEE
                </p>
              )}
              {siretStatus === 'not_found' && (
                <p className="mt-1.5 text-xs text-orange-600 flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                  Aucune entreprise trouvée — saisie manuelle requise
                </p>
              )}
              {siretStatus === 'error' && (
                <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                  </svg>
                  {siretError}
                </p>
              )}
              {siretStatus === 'idle' && form.siret && form.siret.length === 14 && (
                <p className="mt-1.5 text-xs text-gray-400 flex items-center gap-1">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>
                  SIREN : {form.siret.substring(0, 9)}
                </p>
              )}
            </div>

            {/* SIREN */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">SIREN</label>
              <input
                value={form.siren}
                onChange={e => updateField('siren', e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder="9 chiffres"
                maxLength={9}
                className={inputClass('')}
              />
            </div>

            {/* Numéro RCS */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Numéro RCS</label>
              <input
                value={form.numero_rcs}
                onChange={e => updateField('numero_rcs', e.target.value)}
                placeholder="Ex: RCS Paris B 123 456 789"
                className={inputClass('')}
              />
            </div>

            {/* TVA Intracommunautaire */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">TVA Intracommunautaire</label>
              <input value={form.tva_intracommunautaire} onChange={e => updateField('tva_intracommunautaire', e.target.value)} className={inputClass('')} />
            </div>

            {/* Code APE */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Code APE</label>
              <input value={form.code_ape} onChange={e => updateField('code_ape', e.target.value)} className={inputClass('')} />
            </div>

            {/* Site web */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Site web</label>
              <input value={form.site_web} onChange={e => updateField('site_web', e.target.value)} className={inputClass('')} placeholder="https://..." />
            </div>

            {/* Téléphone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Téléphone principal</label>
              <input value={form.telephone_principal} onChange={e => updateField('telephone_principal', e.target.value)} className={inputClass('')} />
            </div>

            {/* Email principal */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email principal <span className="text-red-400">*</span></label>
              <input type="email" value={form.email_principal} onChange={e => updateField('email_principal', e.target.value)} className={inputClass('email_principal')} />
              <FieldError error={errors.email_principal} />
            </div>

            {/* Email comptabilité */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email comptabilité</label>
              <input type="email" value={form.email_comptabilite} onChange={e => updateField('email_comptabilite', e.target.value)} className={inputClass('')} />
            </div>
          </div>
        </section>

        {/* ── Conditions commerciales ── */}
        <section className="border-t border-gray-100 pt-8 mt-8">
          <div className="flex items-center gap-2.5 mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            <svg className="h-4.5 w-4.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>
            <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Conditions commerciales</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Délai de paiement</label>
              <select value={form.delai_paiement} onChange={e => updateField('delai_paiement', e.target.value)} className={selectClass('')}>
                <option value="COMPTANT">Comptant</option>
                <option value="15_JOURS">15 jours</option>
                <option value="30_JOURS">30 jours</option>
                <option value="45_JOURS_FIN_MOIS">45 jours fin de mois</option>
                <option value="60_JOURS">60 jours</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mode de paiement</label>
              <select value={form.mode_paiement_prefere} onChange={e => updateField('mode_paiement_prefere', e.target.value)} className={selectClass('')}>
                <option value="">Non spécifié</option>
                <option value="VIREMENT">Virement</option>
                <option value="PRELEVEMENT_SEPA">Prélèvement SEPA</option>
                <option value="CHEQUE">Chèque</option>
                <option value="CARTE">Carte bancaire</option>
                <option value="ESPECES">Espèces</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Remise globale (%)</label>
              <input type="number" min="0" max="100" step="0.5" value={form.remise_globale} onChange={e => updateField('remise_globale', e.target.value)} className={inputClass('')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Taux TVA par défaut</label>
              <select value={form.taux_tva_defaut} onChange={e => updateField('taux_tva_defaut', e.target.value)} className={selectClass('')}>
                <option value="20">20%</option>
                <option value="10">10%</option>
                <option value="5.5">5.5%</option>
                <option value="0">0%</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Plafond encours (EUR)</label>
              <input type="number" min="0" step="100" value={form.plafond_encours} onChange={e => updateField('plafond_encours', e.target.value)} placeholder="Optionnel" className={inputClass('')} />
            </div>
          </div>
        </section>

        {/* ── Informations bancaires ── */}
        <section id="bancaire" className="border-t border-gray-100 pt-8 mt-8">
          <div className="flex items-center gap-2.5 mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            <svg className="h-4.5 w-4.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25h-15a2.25 2.25 0 0 0-2.25 2.25v10.5a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
            <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Informations bancaires</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">IBAN</label>
              <input value={form.iban} onChange={e => updateField('iban', e.target.value)} className={inputClass('')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">BIC</label>
              <input value={form.bic} onChange={e => updateField('bic', e.target.value)} className={inputClass('')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Référence mandat SEPA</label>
              <input value={form.reference_mandat_sepa} onChange={e => updateField('reference_mandat_sepa', e.target.value)} className={inputClass('')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Date mandat SEPA</label>
              <input type="date" value={form.date_mandat_sepa} onChange={e => updateField('date_mandat_sepa', e.target.value)} className={inputClass('')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Séquence mandat</label>
              <select value={form.sequence_mandat} onChange={e => updateField('sequence_mandat', e.target.value)} className={inputClass('')}>
                <option value="FRST">FRST (Premier)</option>
                <option value="RCUR">RCUR (Récurrent)</option>
                <option value="FNAL">FNAL (Dernier)</option>
                <option value="OOFF">OOFF (Ponctuel)</option>
              </select>
            </div>
          </div>
        </section>

        {/* ── Notes ── */}
        <section className="border-t border-gray-100 pt-8 mt-8">
          <div className="flex items-center gap-2.5 mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            <svg className="h-4.5 w-4.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Notes</h3>
          </div>

          <textarea
            value={form.notes}
            onChange={e => updateField('notes', e.target.value)}
            rows={4}
            placeholder="Notes internes sur ce client..."
            className={inputClass('')}
          />
        </section>

        {/* ── Champs personnalisés (système unifié) ── */}
        <section className="border-t border-gray-100 pt-8 mt-8">
          <div className="flex items-center gap-2.5 mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            <svg className="h-4.5 w-4.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>
            <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Champs personnalisés</h3>
          </div>
          <ChampsPersonnalisesForm
            entite="CLIENT"
            entiteId={Number(clientId)}
            onChange={handleChampsPersoChange}
          />
        </section>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-6 mt-8">
          <button
            onClick={() => router.push(`/dashboard/clients/${clientId}`)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200 cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:shadow-none transition-all duration-200 cursor-pointer"
          >
            {saving ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                Enregistrement...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                Enregistrer les modifications
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
