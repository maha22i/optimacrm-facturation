'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type { ApiResponse, ParcMachine, Client, PaginatedResponse, Marque, CategorieMachine } from '@/lib/types';

interface FormData {
  numero_serie: string;
  matricule: string;
  categorie: CategorieMachine;
  designation: string;
  marque: string;
  modele: string;
  reference_produit: string;
  client_id: number | null;
  site_installation: string;
  numero_contrat: string;
  statut: string;
  date_installation: string;
  date_fin_garantie: string;
  vitesse_ppm: string;
  format_max: string;
  recto_verso: boolean;
  reseau: boolean;
  type_equipement_tel: string;
  nb_postes: string;
  protocole: string;
  type_equipement_info: string;
  processeur: string;
  ram: string;
  stockage: string;
  systeme_exploitation: string;
  notes: string;
}

const INITIAL_FORM: FormData = {
  numero_serie: '', matricule: '', categorie: 'Copieur', designation: '', marque: '', modele: '',
  reference_produit: '', client_id: null, site_installation: '', numero_contrat: '', statut: 'En service',
  date_installation: '', date_fin_garantie: '',
  vitesse_ppm: '', format_max: '', recto_verso: true, reseau: true,
  type_equipement_tel: '', nb_postes: '', protocole: '',
  type_equipement_info: '', processeur: '', ram: '', stockage: '', systeme_exploitation: '',
  notes: '',
};

export default function NouveauMachinePage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [serieExists, setSerieExists] = useState(false);
  const [checkingSerie, setCheckingSerie] = useState(false);

  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  const [marques, setMarques] = useState<Marque[]>([]);

  useEffect(() => {
    api.get<ApiResponse<Marque[]>>('/marques').then(r => setMarques(r.data)).catch(() => {});
  }, []);

  const searchClients = useCallback(async (q: string) => {
    if (q.length < 2) { setClientResults([]); return; }
    try {
      const res = await api.get<PaginatedResponse<Client>>(`/clients?search=${encodeURIComponent(q)}&limit=10`);
      setClientResults(res.data);
    } catch { setClientResults([]); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchClients(clientSearch), 300);
    return () => clearTimeout(t);
  }, [clientSearch, searchClients]);

  useEffect(() => {
    if (!form.numero_serie || form.numero_serie.length < 2) { setSerieExists(false); return; }
    const t = setTimeout(async () => {
      setCheckingSerie(true);
      try {
        const res = await api.get<ApiResponse<{ exists: boolean }>>(`/parc-machines/check-numero-serie?numero_serie=${encodeURIComponent(form.numero_serie)}`);
        setSerieExists(res.data.exists);
      } catch { setSerieExists(false); }
      setCheckingSerie(false);
    }, 500);
    return () => clearTimeout(t);
  }, [form.numero_serie]);

  function updateForm(field: keyof FormData, value: string | number | boolean | null) {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.numero_serie.trim()) errs.numero_serie = 'Le numéro de série est obligatoire';
    if (serieExists) errs.numero_serie = 'Ce numéro de série existe déjà';
    if (!form.designation.trim()) errs.designation = 'La désignation est obligatoire';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        client_id: form.client_id || null,
        vitesse_ppm: form.vitesse_ppm ? parseInt(form.vitesse_ppm) : null,
        nb_postes: form.nb_postes ? parseInt(form.nb_postes) : null,
        date_installation: form.date_installation || null,
        date_fin_garantie: form.date_fin_garantie || null,
      };
      const res = await api.post<ApiResponse<ParcMachine>>('/parc-machines', payload);
      router.push(`/dashboard/parc-machines/${res.data.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors({ _global: err.message });
      }
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
          <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nouvel équipement</h1>
          <p className="text-sm text-gray-500">Ajoutez un équipement au parc machine</p>
        </div>
      </div>

      {errors._global && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{errors._global}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identification */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Identification</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">N° Série *</label>
              <div className="relative">
                <input type="text" value={form.numero_serie} onChange={e => updateForm('numero_serie', e.target.value)}
                  className={`w-full rounded-lg border ${errors.numero_serie ? 'border-red-300' : 'border-gray-200'} py-2 px-3 text-sm font-mono focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none`}
                  placeholder="Ex: 48W10242" />
                {checkingSerie && <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />}
                {!checkingSerie && serieExists && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 text-xs">Existe déjà</span>}
              </div>
              {errors.numero_serie && <p className="mt-1 text-xs text-red-500">{errors.numero_serie}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Matricule</label>
              <input type="text" value={form.matricule} onChange={e => updateForm('matricule', e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Catégorie *</label>
              <div className="flex gap-3">
                {(['Copieur', 'Téléphonie', 'Informatique'] as CategorieMachine[]).map(cat => (
                  <label key={cat} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-all ${form.categorie === cat ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20' : 'border-gray-200 hover:bg-gray-50 text-gray-600'}`}>
                    <input type="radio" name="categorie" value={cat} checked={form.categorie === cat} onChange={() => updateForm('categorie', cat)} className="sr-only" />
                    <span className="text-sm font-medium">{cat}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Désignation *</label>
              <input type="text" value={form.designation} onChange={e => updateForm('designation', e.target.value)}
                className={`w-full rounded-lg border ${errors.designation ? 'border-red-300' : 'border-gray-200'} py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none`}
                placeholder="Ex: CANON IR C331I" />
              {errors.designation && <p className="mt-1 text-xs text-red-500">{errors.designation}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Marque</label>
              <select value={form.marque} onChange={e => updateForm('marque', e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none cursor-pointer">
                <option value="">Sélectionner une marque</option>
                {marques.filter(m => m.actif).map(m => <option key={m.id} value={m.nom}>{m.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modèle</label>
              <input type="text" value={form.modele} onChange={e => updateForm('modele', e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
            </div>
          </div>
        </div>

        {/* Affectation */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Affectation</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
              {selectedClient ? (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 py-2 px-3">
                  <span className="text-sm font-medium text-gray-900 flex-1">{selectedClient.raison_sociale}</span>
                  <span className="text-xs text-gray-400">{selectedClient.numero_client}</span>
                  <button type="button" onClick={() => { setSelectedClient(null); updateForm('client_id', null); setClientSearch(''); }}
                    className="text-gray-400 hover:text-red-500 cursor-pointer">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div>
                  <input type="text" value={clientSearch} onChange={e => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
                    onFocus={() => setShowClientDropdown(true)}
                    placeholder="Rechercher un client..."
                    className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
                  {showClientDropdown && clientResults.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {clientResults.map(c => (
                        <button key={c.id} type="button"
                          onClick={() => { setSelectedClient(c); updateForm('client_id', c.id); setShowClientDropdown(false); setClientSearch(''); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer flex justify-between items-center">
                          <span className="font-medium text-gray-900">{c.raison_sociale}</span>
                          <span className="text-xs text-gray-400">{c.numero_client}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site d&apos;installation</label>
              <input type="text" value={form.site_installation} onChange={e => updateForm('site_installation', e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none"
                placeholder="Adresse ou nom du site" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">N° Contrat lié</label>
              <input type="text" value={form.numero_contrat} onChange={e => updateForm('numero_contrat', e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none"
                placeholder="Ex: C-0930" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
              <select value={form.statut} onChange={e => updateForm('statut', e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none cursor-pointer">
                <option value="En service">En service</option>
                <option value="En stock">En stock</option>
                <option value="En SAV">En SAV</option>
                <option value="Retourné">Retourné</option>
                <option value="Hors service">Hors service</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dates */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Dates</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date d&apos;installation</label>
              <input type="date" value={form.date_installation} onChange={e => updateForm('date_installation', e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date fin garantie</label>
              <input type="date" value={form.date_fin_garantie} onChange={e => updateForm('date_fin_garantie', e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
            </div>
          </div>
        </div>

        {/* Détails techniques — Copieur */}
        {form.categorie === 'Copieur' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Détails techniques — Copieur</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vitesse (ppm)</label>
                <input type="number" value={form.vitesse_ppm} onChange={e => updateForm('vitesse_ppm', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Format max</label>
                <select value={form.format_max} onChange={e => updateForm('format_max', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none cursor-pointer">
                  <option value="">Sélectionner</option>
                  <option value="A4">A4</option>
                  <option value="A3">A3</option>
                  <option value="SRA3">SRA3</option>
                </select>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.recto_verso} onChange={e => updateForm('recto_verso', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700">Recto/verso</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.reseau} onChange={e => updateForm('reseau', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700">Réseau</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Détails techniques — Téléphonie */}
        {form.categorie === 'Téléphonie' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Détails techniques — Téléphonie</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type d&apos;équipement</label>
                <select value={form.type_equipement_tel} onChange={e => updateForm('type_equipement_tel', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none cursor-pointer">
                  <option value="">Sélectionner</option>
                  <option value="IPBX">IPBX</option>
                  <option value="Téléphone IP">Téléphone IP</option>
                  <option value="Passerelle">Passerelle</option>
                  <option value="Routeur">Routeur</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de postes</label>
                <input type="number" value={form.nb_postes} onChange={e => updateForm('nb_postes', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Protocole</label>
                <select value={form.protocole} onChange={e => updateForm('protocole', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none cursor-pointer">
                  <option value="">Sélectionner</option>
                  <option value="SIP">SIP</option>
                  <option value="MGCP">MGCP</option>
                  <option value="H.323">H.323</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Détails techniques — Informatique */}
        {form.categorie === 'Informatique' && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Détails techniques — Informatique</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type d&apos;équipement</label>
                <select value={form.type_equipement_info} onChange={e => updateForm('type_equipement_info', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none cursor-pointer">
                  <option value="">Sélectionner</option>
                  <option value="Serveur">Serveur</option>
                  <option value="PC">PC</option>
                  <option value="Switch">Switch</option>
                  <option value="NAS">NAS</option>
                  <option value="Firewall">Firewall</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Processeur</label>
                <input type="text" value={form.processeur} onChange={e => updateForm('processeur', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">RAM</label>
                <input type="text" value={form.ram} onChange={e => updateForm('ram', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none"
                  placeholder="Ex: 16 Go" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stockage</label>
                <input type="text" value={form.stockage} onChange={e => updateForm('stockage', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none"
                  placeholder="Ex: 512 Go SSD" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Système d&apos;exploitation</label>
                <input type="text" value={form.systeme_exploitation} onChange={e => updateForm('systeme_exploitation', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none"
                  placeholder="Ex: Windows Server 2022" />
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Notes</h2>
          <textarea value={form.notes} onChange={e => updateForm('notes', e.target.value)}
            rows={3} className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none resize-none"
            placeholder="Notes ou remarques..." />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => router.back()}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
            Annuler
          </button>
          <button type="submit" disabled={saving}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer">
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
