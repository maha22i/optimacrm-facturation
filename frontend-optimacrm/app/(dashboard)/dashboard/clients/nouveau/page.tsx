'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { ApiResponse, Client } from '@/lib/types';
import ChampsPersonnalisesForm from '@/components/ChampsPersonnalisesForm';

const STORAGE_KEY = 'optimacrm_client_draft';

interface ClientFormData {
  raison_sociale: string;
  forme_juridique: string;
  siret: string;
  tva_intracommunautaire: string;
  code_ape: string;
  site_web: string;
  telephone_principal: string;
  email_principal: string;
  email_comptabilite: string;
  notes: string;
  // Adresses
  adresse_facturation: { ligne1: string; ligne2: string; code_postal: string; ville: string; pays: string };
  adresse_livraison_identique: boolean;
  adresse_livraison: { ligne1: string; ligne2: string; code_postal: string; ville: string; pays: string };
  // Contacts
  contacts: { nom: string; prenom: string; role: string; email: string; telephone: string; fonction: string; est_principal: boolean }[];
  // Conditions
  delai_paiement: string;
  mode_paiement_prefere: string;
  remise_globale: string;
  plafond_encours: string;
  iban: string;
  bic: string;
}

const DEFAULT_FORM: ClientFormData = {
  raison_sociale: '',
  forme_juridique: 'SARL',
  siret: '',
  tva_intracommunautaire: '',
  code_ape: '',
  site_web: '',
  telephone_principal: '',
  email_principal: '',
  email_comptabilite: '',
  notes: '',
  adresse_facturation: { ligne1: '', ligne2: '', code_postal: '', ville: '', pays: 'France' },
  adresse_livraison_identique: true,
  adresse_livraison: { ligne1: '', ligne2: '', code_postal: '', ville: '', pays: 'France' },
  contacts: [{ nom: '', prenom: '', role: 'PRINCIPAL', email: '', telephone: '', fonction: '', est_principal: true }],
  delai_paiement: '30_JOURS',
  mode_paiement_prefere: '',
  remise_globale: '0',
  plafond_encours: '',
  iban: '',
  bic: '',
};

const STEP_META = [
  {
    label: 'Informations',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
  },
  {
    label: 'Adresses',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
      </svg>
    ),
  },
  {
    label: 'Contacts & Plus',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
];

function StepIndicator({ current, steps }: { current: number; steps: typeof STEP_META }) {
  return (
    <div className="mb-10">
      <div className="flex items-center justify-center">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className="relative">
                {i === current && (
                  <span className="absolute inset-0 rounded-full bg-violet-600/20 animate-ping" />
                )}
                <div
                  className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all duration-300 ${
                    i < current
                      ? 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/25'
                      : i === current
                        ? 'border-2 border-violet-600 bg-white text-violet-600 shadow-lg shadow-violet-500/15'
                        : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {i < current ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    <span>{s.icon}</span>
                  )}
                </div>
              </div>
              <span
                className={`mt-2.5 text-xs font-semibold transition-colors duration-300 ${
                  i <= current ? 'text-violet-700' : 'text-gray-400'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="mx-4 sm:mx-8 mb-6">
                <div
                  className={`h-0.5 w-16 sm:w-24 rounded-full transition-colors duration-500 ${
                    i < current
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600'
                      : 'bg-gray-200'
                  }`}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1 text-xs text-red-600">
      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      {error}
    </p>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-600">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
    </div>
  );
}

export default function NouveauClientPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ClientFormData>(DEFAULT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [champsPersoValeurs, setChampsPersoValeurs] = useState<Record<string, string>>({});
  const handleChampsPersoChange = useCallback((v: Record<string, string>) => setChampsPersoValeurs(v), []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        setForm({ ...DEFAULT_FORM, ...parsed });
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(form)); } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [form]);

  const updateField = (field: string, value: unknown) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => { const n = { ...e }; delete n[field]; return n; });
  };

  const updateAdresseFacturation = (field: string, value: string) => {
    setForm(f => ({ ...f, adresse_facturation: { ...f.adresse_facturation, [field]: value } }));
  };

  const updateAdresseLivraison = (field: string, value: string) => {
    setForm(f => ({ ...f, adresse_livraison: { ...f.adresse_livraison, [field]: value } }));
  };

  const updateContact = (idx: number, field: string, value: unknown) => {
    setForm(f => {
      const contacts = [...f.contacts];
      contacts[idx] = { ...contacts[idx], [field]: value };
      return { ...f, contacts };
    });
  };

  const addContact = () => {
    setForm(f => ({
      ...f,
      contacts: [...f.contacts, { nom: '', prenom: '', role: 'AUTRE', email: '', telephone: '', fonction: '', est_principal: false }],
    }));
  };

  const removeContact = (idx: number) => {
    setForm(f => ({ ...f, contacts: f.contacts.filter((_, i) => i !== idx) }));
  };


  const validateStep = (s: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (s === 0) {
      if (!form.raison_sociale.trim()) newErrors.raison_sociale = 'La raison sociale est obligatoire';
      if (!form.email_principal.trim()) newErrors.email_principal = "L'email principal est obligatoire";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email_principal)) newErrors.email_principal = 'Email invalide';
      if (form.siret && form.siret.length !== 14) newErrors.siret = 'Le SIRET doit faire exactement 14 chiffres';
      if (form.siret && !/^\d{14}$/.test(form.siret)) newErrors.siret = 'Le SIRET ne doit contenir que des chiffres';
    }

    if (s === 1) {
      if (!form.adresse_facturation.ligne1.trim()) newErrors['adresse_facturation.ligne1'] = "L'adresse est obligatoire";
      if (!form.adresse_facturation.code_postal.trim()) newErrors['adresse_facturation.code_postal'] = 'Le code postal est obligatoire';
      if (!form.adresse_facturation.ville.trim()) newErrors['adresse_facturation.ville'] = 'La ville est obligatoire';
      if (!form.adresse_livraison_identique) {
        if (!form.adresse_livraison.ligne1.trim()) newErrors['adresse_livraison.ligne1'] = "L'adresse de livraison est obligatoire";
        if (!form.adresse_livraison.code_postal.trim()) newErrors['adresse_livraison.code_postal'] = 'Le code postal est obligatoire';
        if (!form.adresse_livraison.ville.trim()) newErrors['adresse_livraison.ville'] = 'La ville est obligatoire';
      }
    }

    if (s === 2) {
      form.contacts.forEach((c, i) => {
        if (!c.nom.trim()) newErrors[`contact_${i}_nom`] = 'Le nom est obligatoire';
        if (!c.prenom.trim()) newErrors[`contact_${i}_prenom`] = 'Le prénom est obligatoire';
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) setStep(s => Math.min(s + 1, 2));
  };

  const handleSubmit = async () => {
    if (!validateStep(2)) return;

    setSaving(true);
    try {
      const siren = form.siret ? form.siret.substring(0, 9) : '';
      const tva = form.siret ? `FR${(12 + 3 * (parseInt(form.siret.substring(0, 9)) % 97)) % 97}${form.siret.substring(0, 9)}` : form.tva_intracommunautaire;

      const clientRes = await api.post<ApiResponse<Client>>('/clients', {
        raison_sociale: form.raison_sociale,
        forme_juridique: form.forme_juridique,
        siret: form.siret || undefined,
        siren: siren || undefined,
        tva_intracommunautaire: tva || undefined,
        code_ape: form.code_ape || undefined,
        site_web: form.site_web || undefined,
        telephone_principal: form.telephone_principal || undefined,
        email_principal: form.email_principal,
        email_comptabilite: form.email_comptabilite || undefined,
        notes: form.notes || undefined,
        delai_paiement: form.delai_paiement,
        mode_paiement_prefere: form.mode_paiement_prefere || undefined,
        remise_globale: parseFloat(form.remise_globale) || 0,
        plafond_encours: form.plafond_encours ? parseFloat(form.plafond_encours) : undefined,
        iban: form.iban || undefined,
        bic: form.bic || undefined,
      });

      const clientId = clientRes.data.id;

      await api.post(`/clients/${clientId}/adresses`, {
        type: 'FACTURATION',
        est_defaut: true,
        ...form.adresse_facturation,
      });

      if (!form.adresse_livraison_identique) {
        await api.post(`/clients/${clientId}/adresses`, {
          type: 'LIVRAISON',
          est_defaut: false,
          ...form.adresse_livraison,
        });
      }

      for (const contact of form.contacts) {
        if (contact.nom && contact.prenom) {
          await api.post(`/clients/${clientId}/contacts`, contact);
        }
      }

      if (Object.keys(champsPersoValeurs).length > 0) {
        await api.put(`/champs-config/valeurs/CLIENT/${clientId}`, { valeurs: champsPersoValeurs });
      }

      localStorage.removeItem(STORAGE_KEY);
      setToast({ message: 'Client créé avec succès', type: 'success' });
      setTimeout(() => router.push(`/dashboard/clients/${clientId}`), 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la création';
      setToast({ message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (field: string) =>
    `w-full rounded-xl border bg-gray-50/80 py-2.5 px-3.5 text-sm text-gray-900 outline-none transition-all duration-200 placeholder:text-gray-400 ${
      errors[field]
        ? 'border-red-300 bg-red-50/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
        : 'border-gray-200 focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20'
    }`;

  const selectClass = (field: string) =>
    `w-full rounded-xl border bg-gray-50/80 py-2.5 px-3.5 text-sm text-gray-900 outline-none transition-all duration-200 ${
      errors[field]
        ? 'border-red-300 bg-red-50/50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
        : 'border-gray-200 focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20'
    }`;

  return (
    <div className="min-h-screen">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2">
          <div
            className={`flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-medium shadow-xl backdrop-blur-sm ${
              toast.type === 'success'
                ? 'bg-emerald-600/95 text-white'
                : 'bg-red-600/95 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            ) : (
              <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            )}
            {toast.message}
            <button onClick={() => setToast(null)} className="ml-2 rounded-lg p-0.5 hover:bg-white/20 transition cursor-pointer">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="mb-8">
        <button
          onClick={() => router.push('/dashboard/clients')}
          className="group mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-violet-600 transition-colors cursor-pointer"
        >
          <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Clients
        </button>
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/25">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Nouveau client</h1>
            <p className="mt-0.5 text-sm text-gray-500">Remplissez les informations pour créer un nouveau client</p>
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="p-8">
          <StepIndicator current={step} steps={STEP_META} />

          {/* Step 0 — Informations générales */}
          {step === 0 && (
            <div className="mx-auto max-w-3xl">
              <SectionHeader
                icon={
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                }
                title="Informations de l'entreprise"
              />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Raison sociale — full width */}
                <div className="sm:col-span-2">
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <span className="h-1 w-1 rounded-full bg-violet-500" />
                    Raison sociale
                  </label>
                  <input
                    value={form.raison_sociale}
                    onChange={e => updateField('raison_sociale', e.target.value)}
                    placeholder="Nom de l'entreprise"
                    className={inputClass('raison_sociale')}
                  />
                  <FieldError error={errors.raison_sociale} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Forme juridique</label>
                  <select value={form.forme_juridique} onChange={e => updateField('forme_juridique', e.target.value)} className={selectClass('forme_juridique')}>
                    {['SARL', 'SAS', 'EURL', 'SA', 'SCI', 'AUTO_ENTREPRENEUR', 'ASSOCIATION', 'AUTRE'].map(v => (
                      <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">SIRET</label>
                  <input
                    value={form.siret}
                    onChange={e => updateField('siret', e.target.value.replace(/\D/g, '').slice(0, 14))}
                    placeholder="14 chiffres"
                    maxLength={14}
                    className={inputClass('siret')}
                  />
                  <FieldError error={errors.siret} />
                  {form.siret && form.siret.length === 14 && (
                    <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                      </svg>
                      SIREN : {form.siret.substring(0, 9)}
                    </div>
                  )}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">TVA Intracommunautaire</label>
                  <input
                    value={form.tva_intracommunautaire || (form.siret && form.siret.length === 14 ? `FR${String((12 + 3 * (parseInt(form.siret.substring(0, 9)) % 97)) % 97).padStart(2, '0')}${form.siret.substring(0, 9)}` : '')}
                    onChange={e => updateField('tva_intracommunautaire', e.target.value)}
                    className={inputClass('tva_intracommunautaire')}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Code APE</label>
                  <input value={form.code_ape} onChange={e => updateField('code_ape', e.target.value)} placeholder="Ex: 6201Z" className={inputClass('code_ape')} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Site web</label>
                  <input value={form.site_web} onChange={e => updateField('site_web', e.target.value)} placeholder="https://..." className={inputClass('site_web')} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Téléphone principal</label>
                  <input value={form.telephone_principal} onChange={e => updateField('telephone_principal', e.target.value)} className={inputClass('telephone_principal')} />
                </div>

                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                    <span className="h-1 w-1 rounded-full bg-violet-500" />
                    Email principal
                  </label>
                  <input type="email" value={form.email_principal} onChange={e => updateField('email_principal', e.target.value)} className={inputClass('email_principal')} />
                  <FieldError error={errors.email_principal} />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Email comptabilité</label>
                  <input type="email" value={form.email_comptabilite} onChange={e => updateField('email_comptabilite', e.target.value)} className={inputClass('email_comptabilite')} />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Notes</label>
                  <textarea value={form.notes} onChange={e => updateField('notes', e.target.value)} rows={3} className={inputClass('notes')} />
                </div>
              </div>
            </div>
          )}

          {/* Step 1 — Adresses */}
          {step === 1 && (
            <div className="mx-auto max-w-3xl space-y-8">
              {/* Adresse facturation */}
              <div>
                <SectionHeader
                  icon={
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                  }
                  title="Adresse de facturation"
                />
                <div className="rounded-xl bg-gray-50/50 p-5 border border-gray-100">
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                        <span className="h-1 w-1 rounded-full bg-violet-500" />
                        Adresse ligne 1
                      </label>
                      <input value={form.adresse_facturation.ligne1} onChange={e => updateAdresseFacturation('ligne1', e.target.value)} className={inputClass('adresse_facturation.ligne1')} />
                      <FieldError error={errors['adresse_facturation.ligne1']} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Adresse ligne 2</label>
                      <input value={form.adresse_facturation.ligne2} onChange={e => updateAdresseFacturation('ligne2', e.target.value)} className={inputClass('')} />
                    </div>
                    <div>
                      <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                        <span className="h-1 w-1 rounded-full bg-violet-500" />
                        Code postal
                      </label>
                      <input value={form.adresse_facturation.code_postal} onChange={e => updateAdresseFacturation('code_postal', e.target.value)} className={inputClass('adresse_facturation.code_postal')} />
                      <FieldError error={errors['adresse_facturation.code_postal']} />
                    </div>
                    <div>
                      <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                        <span className="h-1 w-1 rounded-full bg-violet-500" />
                        Ville
                      </label>
                      <input value={form.adresse_facturation.ville} onChange={e => updateAdresseFacturation('ville', e.target.value)} className={inputClass('adresse_facturation.ville')} />
                      <FieldError error={errors['adresse_facturation.ville']} />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">Pays</label>
                      <input value={form.adresse_facturation.pays} onChange={e => updateAdresseFacturation('pays', e.target.value)} className={inputClass('')} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Toggle livraison identique */}
              <div className="border-t border-gray-100 pt-6">
                <label className="group flex cursor-pointer items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.adresse_livraison_identique}
                    onClick={() => updateField('adresse_livraison_identique', !form.adresse_livraison_identique)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                      form.adresse_livraison_identique ? 'bg-gradient-to-r from-violet-600 to-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        form.adresse_livraison_identique ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-sm font-medium text-gray-700">
                    Adresse de livraison identique à l&apos;adresse de facturation
                  </span>
                </label>
              </div>

              {/* Adresse livraison */}
              {!form.adresse_livraison_identique && (
                <div>
                  <SectionHeader
                    icon={
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                      </svg>
                    }
                    title="Adresse de livraison"
                  />
                  <div className="rounded-xl bg-gray-50/50 p-5 border border-gray-100">
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                          <span className="h-1 w-1 rounded-full bg-violet-500" />
                          Adresse ligne 1
                        </label>
                        <input value={form.adresse_livraison.ligne1} onChange={e => updateAdresseLivraison('ligne1', e.target.value)} className={inputClass('adresse_livraison.ligne1')} />
                        <FieldError error={errors['adresse_livraison.ligne1']} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">Adresse ligne 2</label>
                        <input value={form.adresse_livraison.ligne2} onChange={e => updateAdresseLivraison('ligne2', e.target.value)} className={inputClass('')} />
                      </div>
                      <div>
                        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                          <span className="h-1 w-1 rounded-full bg-violet-500" />
                          Code postal
                        </label>
                        <input value={form.adresse_livraison.code_postal} onChange={e => updateAdresseLivraison('code_postal', e.target.value)} className={inputClass('adresse_livraison.code_postal')} />
                        <FieldError error={errors['adresse_livraison.code_postal']} />
                      </div>
                      <div>
                        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                          <span className="h-1 w-1 rounded-full bg-violet-500" />
                          Ville
                        </label>
                        <input value={form.adresse_livraison.ville} onChange={e => updateAdresseLivraison('ville', e.target.value)} className={inputClass('adresse_livraison.ville')} />
                        <FieldError error={errors['adresse_livraison.ville']} />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">Pays</label>
                        <input value={form.adresse_livraison.pays} onChange={e => updateAdresseLivraison('pays', e.target.value)} className={inputClass('')} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Contacts & Conditions & Custom fields */}
          {step === 2 && (
            <div className="mx-auto max-w-3xl space-y-10">
              {/* Contacts */}
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-600">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                      </svg>
                    </div>
                    <h3 className="text-base font-semibold text-gray-900">Contacts</h3>
                  </div>
                  <button
                    onClick={addContact}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Ajouter un contact
                  </button>
                </div>

                <div className="space-y-4">
                  {form.contacts.map((contact, idx) => (
                    <div key={idx} className="overflow-hidden rounded-2xl border border-gray-200">
                      <div className="h-0.5 bg-gradient-to-r from-violet-500 to-indigo-500" />
                      <div className="p-5">
                        <div className="mb-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-100 text-xs font-bold text-violet-700">
                              {idx + 1}
                            </span>
                            <span className="text-sm font-semibold text-gray-800">Contact {idx + 1}</span>
                          </div>
                          {form.contacts.length > 1 && (
                            <button
                              onClick={() => removeContact(idx)}
                              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition cursor-pointer"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                              Supprimer
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                              <span className="h-1 w-1 rounded-full bg-violet-500" />
                              Nom
                            </label>
                            <input value={contact.nom} onChange={e => updateContact(idx, 'nom', e.target.value)} className={inputClass(`contact_${idx}_nom`)} />
                            <FieldError error={errors[`contact_${idx}_nom`]} />
                          </div>
                          <div>
                            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-700">
                              <span className="h-1 w-1 rounded-full bg-violet-500" />
                              Prénom
                            </label>
                            <input value={contact.prenom} onChange={e => updateContact(idx, 'prenom', e.target.value)} className={inputClass(`contact_${idx}_prenom`)} />
                            <FieldError error={errors[`contact_${idx}_prenom`]} />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-gray-700">Rôle</label>
                            <select value={contact.role} onChange={e => updateContact(idx, 'role', e.target.value)} className={selectClass('')}>
                              <option value="PRINCIPAL">Principal</option>
                              <option value="COMPTABILITE">Comptabilité</option>
                              <option value="TECHNIQUE">Technique</option>
                              <option value="AUTRE">Autre</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-gray-700">Fonction</label>
                            <input value={contact.fonction} onChange={e => updateContact(idx, 'fonction', e.target.value)} className={inputClass('')} />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" value={contact.email} onChange={e => updateContact(idx, 'email', e.target.value)} className={inputClass('')} />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-sm font-medium text-gray-700">Téléphone</label>
                            <input value={contact.telephone} onChange={e => updateContact(idx, 'telephone', e.target.value)} className={inputClass('')} />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conditions commerciales */}
              <div>
                <SectionHeader
                  icon={
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
                    </svg>
                  }
                  title="Conditions commerciales"
                />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Délai de paiement</label>
                    <select value={form.delai_paiement} onChange={e => updateField('delai_paiement', e.target.value)} className={selectClass('')}>
                      <option value="COMPTANT">Comptant</option>
                      <option value="15_JOURS">15 jours</option>
                      <option value="30_JOURS">30 jours</option>
                      <option value="45_JOURS_FIN_MOIS">45 jours fin de mois</option>
                      <option value="60_JOURS">60 jours</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Mode de paiement</label>
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
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Remise globale (%)</label>
                    <input type="number" min="0" max="100" step="0.5" value={form.remise_globale} onChange={e => updateField('remise_globale', e.target.value)} className={inputClass('')} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Plafond encours (EUR)</label>
                    <input type="number" min="0" step="100" value={form.plafond_encours} onChange={e => updateField('plafond_encours', e.target.value)} placeholder="Optionnel" className={inputClass('')} />
                  </div>
                </div>
              </div>

              {/* Bancaire */}
              <div>
                <SectionHeader
                  icon={
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
                    </svg>
                  }
                  title="Informations bancaires"
                />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">IBAN</label>
                    <input value={form.iban} onChange={e => updateField('iban', e.target.value)} className={inputClass('')} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">BIC</label>
                    <input value={form.bic} onChange={e => updateField('bic', e.target.value)} className={inputClass('')} />
                  </div>
                </div>
              </div>

              {/* Champs personnalisés (système unifié) */}
              <ChampsPersonnalisesForm
                entite="CLIENT"
                entiteId={null}
                onChange={handleChampsPersoChange}
              />
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between border-t border-gray-100 px-8 py-5">
          <button
            onClick={() => step > 0 ? setStep(s => s - 1) : router.push('/dashboard/clients')}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
          >
            {step > 0 ? (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
                Précédent
              </>
            ) : (
              'Annuler'
            )}
          </button>

          {step < 2 ? (
            <button
              onClick={handleNext}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-700 hover:to-indigo-700 transition cursor-pointer"
            >
              Suivant
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
            >
              {saving ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Enregistrement...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Enregistrer le client
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
