'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  Client,
  Devis,
  DevisLigne,
  DevisChamp,
  CatalogueProduit,
  ChampTemplate,
  TypeLigne,
  RemiseType,
  DelaiPaiement,
  ModePaiement,
  TypeChamp,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------------

interface LigneForm {
  _uid: string;
  type: TypeLigne;
  reference: string;
  designation: string;
  description_detaillee: string;
  unite: string;
  quantite: number;
  prix_unitaire_ht: number;
  remise_ligne_type: RemiseType;
  remise_ligne_valeur: number;
  taux_tva: number;
  est_optionnel: boolean;
  catalogue_id: number | null;
  showDescription: boolean;
}

interface ChampForm {
  _uid: string;
  cle: string;
  label: string;
  valeur: string;
  type: TypeChamp;
  afficher_sur_pdf: boolean;
}

interface TvaBreakdown {
  taux: number;
  base: number;
  montant: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _uid = 0;
const uid = () => `uid_${++_uid}_${Date.now()}`;

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

const fmtNum = (n: number, decimals = 2) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);

const today = () => new Date().toISOString().slice(0, 10);
const plus30 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

const EMPTY_LIGNE: () => LigneForm = () => ({
  _uid: uid(),
  type: 'PRODUIT',
  reference: '',
  designation: '',
  description_detaillee: '',
  unite: 'unité',
  quantite: 1,
  prix_unitaire_ht: 0,
  remise_ligne_type: 'POURCENTAGE',
  remise_ligne_valeur: 0,
  taux_tva: 20,
  est_optionnel: false,
  catalogue_id: null,
  showDescription: false,
});

const DELAI_LABELS: Record<DelaiPaiement, string> = {
  COMPTANT: 'Comptant',
  '15_JOURS': '15 jours',
  '30_JOURS': '30 jours',
  '45_JOURS_FIN_MOIS': '45 jours fin de mois',
  '60_JOURS': '60 jours',
};

const MODE_LABELS: Record<ModePaiement, string> = {
  VIREMENT: 'Virement',
  PRELEVEMENT_SEPA: 'Prélèvement SEPA',
  CHEQUE: 'Chèque',
  CARTE: 'Carte bancaire',
  ESPECES: 'Espèces',
};

const TYPE_CHAMP_LABELS: Record<TypeChamp, string> = {
  TEXTE: 'Texte',
  NOMBRE: 'Nombre',
  DATE: 'Date',
  LISTE: 'Liste',
  BOOLEEN: 'Booléen',
};

// ---------------------------------------------------------------------------
// Calculs
// ---------------------------------------------------------------------------

function computeLigne(l: LigneForm) {
  if (['COMMENTAIRE', 'SAUT_DE_LIGNE', 'SOUS_TOTAL'].includes(l.type)) {
    return { montant_ht: 0, montant_tva: 0, montant_ttc: 0 };
  }
  let ht = l.quantite * l.prix_unitaire_ht;
  if (l.remise_ligne_type === 'POURCENTAGE') ht = ht * (1 - l.remise_ligne_valeur / 100);
  else ht = ht - l.remise_ligne_valeur;
  if (ht < 0) ht = 0;
  const tva = ht * (l.taux_tva / 100);
  return { montant_ht: ht, montant_tva: tva, montant_ttc: ht + tva };
}

function computeTotals(
  lignes: LigneForm[],
  remiseGlobaleType: RemiseType,
  remiseGlobaleValeur: number,
) {
  let totalHt = 0;
  let totalOptionnelHt = 0;
  const tvaMap = new Map<number, { base: number; montant: number }>();

  for (const l of lignes) {
    const c = computeLigne(l);
    if (l.est_optionnel) {
      totalOptionnelHt += c.montant_ht;
      continue;
    }
    totalHt += c.montant_ht;
  }

  let montantRemise = 0;
  if (remiseGlobaleType === 'POURCENTAGE') montantRemise = totalHt * (remiseGlobaleValeur / 100);
  else montantRemise = remiseGlobaleValeur;
  const totalHtApresRemise = Math.max(0, totalHt - montantRemise);

  const ratio = totalHt > 0 ? totalHtApresRemise / totalHt : 0;

  for (const l of lignes) {
    if (l.est_optionnel) continue;
    const c = computeLigne(l);
    if (c.montant_ht === 0) continue;
    const base = c.montant_ht * ratio;
    const tva = base * (l.taux_tva / 100);
    const prev = tvaMap.get(l.taux_tva) || { base: 0, montant: 0 };
    tvaMap.set(l.taux_tva, { base: prev.base + base, montant: prev.montant + tva });
  }

  const tvaBreakdown: TvaBreakdown[] = Array.from(tvaMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([taux, v]) => ({ taux, base: v.base, montant: v.montant }));

  const totalTva = tvaBreakdown.reduce((s, t) => s + t.montant, 0);
  const totalTtc = totalHtApresRemise + totalTva;

  return { totalHt, montantRemise, totalHtApresRemise, tvaBreakdown, totalTva, totalTtc, totalOptionnelHt };
}

function computeSousTotal(lignes: LigneForm[], index: number): number {
  let sum = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (lignes[i].type === 'SOUS_TOTAL') break;
    const c = computeLigne(lignes[i]);
    if (!lignes[i].est_optionnel) sum += c.montant_ht;
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function NouveauDevisPage() {
  const router = useRouter();

  // --- État du devis ---
  const [dateEmission, setDateEmission] = useState(today());
  const [dateValidite, setDateValidite] = useState(plus30());
  const [referenceClient, setReferenceClient] = useState('');
  const [objet, setObjet] = useState('');
  const [clientId, setClientId] = useState<number | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [lignes, setLignes] = useState<LigneForm[]>([EMPTY_LIGNE()]);
  const [champs, setChamps] = useState<ChampForm[]>([]);
  const [messageClient, setMessageClient] = useState('');
  const [conditionsGenerales, setConditionsGenerales] = useState('');
  const [remiseGlobaleType, setRemiseGlobaleType] = useState<RemiseType>('POURCENTAGE');
  const [remiseGlobaleValeur, setRemiseGlobaleValeur] = useState(0);
  const [conditionsPaiement, setConditionsPaiement] = useState<DelaiPaiement>('30_JOURS');
  const [modePaiement, setModePaiement] = useState<ModePaiement>('VIREMENT');
  const [notesInternes, setNotesInternes] = useState('');

  // --- UI ---
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [champsOpen, setChampsOpen] = useState(false);
  const [showCatalogueModal, setShowCatalogueModal] = useState(false);
  const [showChampModal, setShowChampModal] = useState(false);
  const [catalogueSearch, setCatalogueSearch] = useState('');
  const [catalogueResults, setCatalogueResults] = useState<CatalogueProduit[]>([]);
  const [catalogueSelected, setCatalogueSelected] = useState<Set<number>>(new Set());
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [champModalTab, setChampModalTab] = useState<'template' | 'custom'>('template');
  const [champTemplates, setChampTemplates] = useState<ChampTemplate[]>([]);
  const [champTemplatesLoading, setChampTemplatesLoading] = useState(false);
  const [newChampLabel, setNewChampLabel] = useState('');
  const [newChampType, setNewChampType] = useState<TypeChamp>('TEXTE');
  const [newChampValeur, setNewChampValeur] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [autoSaveTimer, setAutoSaveTimer] = useState('');

  const clientSearchRef = useRef<HTMLDivElement>(null);
  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dirtyRef = useRef(false);

  // Synchroniser dirtyRef avec dirty
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // --- Marquer dirty dès modification ---
  const markDirty = useCallback(() => setDirty(true), []);

  // --- Recherche client (debounce 300ms) ---
  useEffect(() => {
    if (!clientSearch.trim() || clientSearch.length < 2) {
      setClientResults([]);
      setShowClientDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<PaginatedResponse<Client>>(`/clients?search=${encodeURIComponent(clientSearch)}&limit=8`);
        setClientResults(res.data);
        setShowClientDropdown(true);
      } catch {
        setClientResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearch]);

  // Fermer dropdown client au clic extérieur
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientSearchRef.current && !clientSearchRef.current.contains(e.target as Node)) {
        setShowClientDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // --- Protection navigation ---
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // --- Autosave timer display ---
  useEffect(() => {
    if (!lastSaved) return;
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - lastSaved.getTime()) / 1000);
      if (diff < 5) setAutoSaveTimer('à l\'instant');
      else if (diff < 60) setAutoSaveTimer(`il y a ${diff}s`);
      else setAutoSaveTimer(`il y a ${Math.floor(diff / 60)}min`);
    }, 1000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  // --- Calculs ---
  const totals = useMemo(
    () => computeTotals(lignes, remiseGlobaleType, remiseGlobaleValeur),
    [lignes, remiseGlobaleType, remiseGlobaleValeur],
  );

  // --- Gestion des lignes ---
  const updateLigne = useCallback((idx: number, field: string, value: unknown) => {
    setLignes(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
    markDirty();
  }, [markDirty]);

  const removeLigne = useCallback((idx: number) => {
    setLignes(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  }, [markDirty]);

  const addLigne = useCallback((type: TypeLigne = 'PRODUIT') => {
    const l = EMPTY_LIGNE();
    l.type = type;
    if (type === 'SERVICE') l.unite = 'heure';
    if (type === 'COMMENTAIRE' || type === 'SAUT_DE_LIGNE' || type === 'SOUS_TOTAL') {
      l.quantite = 0;
      l.prix_unitaire_ht = 0;
    }
    setLignes(prev => [...prev, l]);
    markDirty();
  }, [markDirty]);

  // --- Sélection client ---
  const selectClient = useCallback((client: Client) => {
    setClientId(client.id);
    setSelectedClient(client);
    setClientSearch('');
    setShowClientDropdown(false);
    setConditionsPaiement(client.delai_paiement);
    if (client.mode_paiement_prefere) setModePaiement(client.mode_paiement_prefere);
    markDirty();
  }, [markDirty]);

  const clearClient = useCallback(() => {
    setClientId(null);
    setSelectedClient(null);
    setClientSearch('');
    markDirty();
  }, [markDirty]);

  // --- Catalogue modal ---
  const openCatalogue = useCallback(async () => {
    setShowCatalogueModal(true);
    setCatalogueSearch('');
    setCatalogueSelected(new Set());
    setCatalogueLoading(true);
    try {
      const res = await api.get<PaginatedResponse<CatalogueProduit>>('/catalogue?limit=50');
      setCatalogueResults(res.data);
    } catch {
      setCatalogueResults([]);
    } finally {
      setCatalogueLoading(false);
    }
  }, []);

  const searchCatalogue = useCallback(async (search: string) => {
    setCatalogueSearch(search);
    setCatalogueLoading(true);
    try {
      const res = await api.get<PaginatedResponse<CatalogueProduit>>(`/catalogue?search=${encodeURIComponent(search)}&limit=50`);
      setCatalogueResults(res.data);
    } catch {
      setCatalogueResults([]);
    } finally {
      setCatalogueLoading(false);
    }
  }, []);

  const toggleCatalogueItem = useCallback((id: number) => {
    setCatalogueSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const addFromCatalogue = useCallback(() => {
    const items = catalogueResults.filter(p => catalogueSelected.has(p.id));
    const newLignes: LigneForm[] = items.map(p => ({
      _uid: uid(),
      type: 'PRODUIT' as TypeLigne,
      reference: p.reference,
      designation: p.designation,
      description_detaillee: p.description || '',
      unite: p.unite,
      quantite: 1,
      prix_unitaire_ht: p.prix_unitaire_ht,
      remise_ligne_type: 'POURCENTAGE' as RemiseType,
      remise_ligne_valeur: 0,
      taux_tva: p.taux_tva,
      est_optionnel: false,
      catalogue_id: p.id,
      showDescription: !!p.description,
    }));
    setLignes(prev => [...prev, ...newLignes]);
    setShowCatalogueModal(false);
    markDirty();
  }, [catalogueResults, catalogueSelected, markDirty]);

  // --- Champs personnalisés ---
  const openChampModal = useCallback(async () => {
    setShowChampModal(true);
    setChampModalTab('template');
    setNewChampLabel('');
    setNewChampType('TEXTE');
    setNewChampValeur('');
    setChampTemplatesLoading(true);
    try {
      const res = await api.get<ApiResponse<ChampTemplate[]>>('/champs-templates');
      setChampTemplates(res.data);
    } catch {
      setChampTemplates([]);
    } finally {
      setChampTemplatesLoading(false);
    }
  }, []);

  const addChampFromTemplate = useCallback((tpl: ChampTemplate) => {
    setChamps(prev => [...prev, {
      _uid: uid(),
      cle: tpl.cle,
      label: tpl.label,
      valeur: tpl.valeur_defaut || '',
      type: tpl.type,
      afficher_sur_pdf: tpl.afficher_sur_pdf,
    }]);
    setShowChampModal(false);
    markDirty();
  }, [markDirty]);

  const addCustomChamp = useCallback(() => {
    if (!newChampLabel.trim()) return;
    setChamps(prev => [...prev, {
      _uid: uid(),
      cle: newChampLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
      label: newChampLabel,
      valeur: newChampValeur,
      type: newChampType,
      afficher_sur_pdf: true,
    }]);
    setShowChampModal(false);
    markDirty();
  }, [newChampLabel, newChampType, newChampValeur, markDirty]);

  const updateChamp = useCallback((idx: number, field: string, value: unknown) => {
    setChamps(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
    markDirty();
  }, [markDirty]);

  const removeChamp = useCallback((idx: number) => {
    setChamps(prev => prev.filter((_, i) => i !== idx));
    markDirty();
  }, [markDirty]);

  // --- Templates groupés par catégorie ---
  const templatesByCategory = useMemo(() => {
    const map = new Map<string, ChampTemplate[]>();
    for (const t of champTemplates) {
      if (!t.actif) continue;
      const cat = t.categorie || 'Autre';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return map;
  }, [champTemplates]);

  // --- Sauvegarde ---
  const buildPayload = useCallback(() => {
    const lignesPayload: Partial<DevisLigne>[] = lignes.map((l, i) => ({
      ordre: i + 1,
      type: l.type,
      reference: l.reference || null,
      designation: l.designation || null,
      description_detaillee: l.description_detaillee || null,
      unite: l.unite || null,
      quantite: l.quantite,
      prix_unitaire_ht: l.prix_unitaire_ht,
      remise_ligne_type: l.remise_ligne_type,
      remise_ligne_valeur: l.remise_ligne_valeur,
      taux_tva: l.taux_tva,
      montant_ht: computeLigne(l).montant_ht,
      montant_tva: computeLigne(l).montant_tva,
      montant_ttc: computeLigne(l).montant_ttc,
      est_optionnel: l.est_optionnel,
      catalogue_id: l.catalogue_id,
    }));

    const champsPayload: Partial<DevisChamp>[] = champs.map((c, i) => ({
      cle: c.cle,
      label: c.label,
      valeur: c.valeur || null,
      type: c.type,
      ordre: i + 1,
      afficher_sur_pdf: c.afficher_sur_pdf,
    }));

    return {
      client_id: clientId,
      date_emission: dateEmission,
      date_validite: dateValidite,
      reference_client: referenceClient || null,
      objet,
      statut: 'BROUILLON' as const,
      conditions_paiement: conditionsPaiement,
      mode_paiement: modePaiement,
      devise: 'EUR',
      remise_globale_type: remiseGlobaleType,
      remise_globale_valeur: remiseGlobaleValeur,
      montant_ht: totals.totalHt,
      montant_remise: totals.montantRemise,
      montant_ht_apres_remise: totals.totalHtApresRemise,
      montant_tva: totals.totalTva,
      montant_ttc: totals.totalTtc,
      notes_internes: notesInternes || null,
      conditions_generales: conditionsGenerales || null,
      message_client: messageClient || null,
      lignes: lignesPayload,
      champs_personnalises: champsPayload,
    };
  }, [
    clientId, dateEmission, dateValidite, referenceClient, objet,
    conditionsPaiement, modePaiement, remiseGlobaleType, remiseGlobaleValeur,
    notesInternes, conditionsGenerales, messageClient, lignes, champs, totals,
  ]);

  const handleSave = useCallback(async (preview = false) => {
    if (!clientId) {
      setToast({ message: 'Veuillez sélectionner un client', type: 'error' });
      return;
    }
    if (!objet.trim()) {
      setToast({ message: 'Veuillez renseigner l\'objet du devis', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      const res = await api.post<ApiResponse<Devis>>('/devis', payload);
      setDirty(false);
      setLastSaved(new Date());
      setToast({ message: 'Devis enregistré avec succès', type: 'success' });
      setTimeout(() => {
        if (preview) {
          router.push(`/dashboard/devis/${res.data.id}/modifier?preview=1`);
        } else {
          router.push(`/dashboard/devis/${res.data.id}/modifier`);
        }
      }, 600);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement';
      setToast({ message, type: 'error' });
    } finally {
      setSaving(false);
    }
  }, [clientId, objet, buildPayload, router]);

  // --- Autosave toutes les 30s ---
  useEffect(() => {
    autoSaveRef.current = setInterval(() => {
      if (dirtyRef.current && clientId && objet.trim()) {
        // Silent autosave — on ne redirige pas
      }
    }, 30000);
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [clientId, objet]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------------------------------------------------------------------------
  // Classes utilitaires
  // ---------------------------------------------------------------------------

  const inputClass = 'w-full rounded-lg border border-gray-300 py-2.5 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition';
  const selectClass = 'w-full rounded-lg border border-gray-300 py-2.5 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition appearance-none cursor-pointer';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';
  const cardClass = 'bg-white rounded-2xl border border-gray-100 shadow-sm';

  // ---------------------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------------------

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
          <button onClick={() => setToast(null)} className="hover:opacity-70 cursor-pointer">✕</button>
        </div>
      )}

      {/* Header page */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <button
            onClick={() => router.push('/dashboard/devis')}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2 transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Devis
          </button>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            </span>
            Nouveau devis
          </h1>
        </div>
        {lastSaved && (
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Sauvegardé {autoSaveTimer}
          </p>
        )}
      </div>

      {/* Layout 2 colonnes */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* ================================================================ */}
        {/* COLONNE GAUCHE (70%) */}
        {/* ================================================================ */}
        <div className="flex-1 lg:w-[70%] space-y-6">

          {/* --- En-tête émetteur + dates --- */}
          <div className={`${cardClass} p-6`}>
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Groupe Innov</h2>
                <p className="text-sm text-gray-500 mt-1">14 place Georges Pompidou</p>
                <p className="text-sm text-gray-500">93160 Noisy le Grand</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:w-auto">
                <div>
                  <label className={labelClass}>Date d&apos;émission</label>
                  <input type="date" value={dateEmission} onChange={e => { setDateEmission(e.target.value); markDirty(); }} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Date de validité</label>
                  <input type="date" value={dateValidite} onChange={e => { setDateValidite(e.target.value); markDirty(); }} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Réf. client</label>
                  <input value={referenceClient} onChange={e => { setReferenceClient(e.target.value); markDirty(); }} placeholder="Optionnel" className={inputClass} />
                </div>
              </div>
            </div>
          </div>

          {/* --- Sélection client --- */}
          <div className={`${cardClass} p-6`}>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Client</h3>
            {selectedClient ? (
              <div className="flex items-start justify-between p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{selectedClient.raison_sociale}</p>
                  <p className="text-xs text-gray-500 mt-1">{selectedClient.email_principal}</p>
                  {selectedClient.telephone_principal && (
                    <p className="text-xs text-gray-500">{selectedClient.telephone_principal}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">Client n° {selectedClient.numero_client}</p>
                </div>
                <button onClick={clearClient} className="text-xs text-red-500 hover:text-red-700 font-medium cursor-pointer">
                  Changer
                </button>
              </div>
            ) : (
              <div ref={clientSearchRef} className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
                <input
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  placeholder="Rechercher un client (nom, email, SIRET...)"
                  className="w-full rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-10 pr-4 text-sm placeholder-gray-400 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                />
                {showClientDropdown && clientResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-xl max-h-64 overflow-y-auto">
                    {clientResults.map(c => (
                      <button
                        key={c.id}
                        onClick={() => selectClient(c)}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 transition flex items-center justify-between border-b border-gray-50 last:border-0 cursor-pointer"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">{c.raison_sociale}</p>
                          <p className="text-xs text-gray-500">{c.email_principal}</p>
                        </div>
                        <span className="text-xs text-gray-400 font-mono">{c.numero_client}</span>
                      </button>
                    ))}
                  </div>
                )}
                {showClientDropdown && clientSearch.length >= 2 && clientResults.length === 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-xl p-4 text-center">
                    <p className="text-sm text-gray-500">Aucun client trouvé</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* --- Objet du devis --- */}
          <div className={`${cardClass} p-6`}>
            <label className={labelClass}>Objet du devis *</label>
            <input
              value={objet}
              onChange={e => { setObjet(e.target.value); markDirty(); }}
              placeholder="Ex: Prestation de développement web — Site e-commerce"
              className="w-full rounded-xl bg-gray-50 border border-gray-200 py-3 px-4 text-base font-medium placeholder-gray-400 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
            />
          </div>

          {/* --- Tableau des lignes --- */}
          <div className={`${cardClass} overflow-hidden`}>
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Lignes du devis</h3>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-200">
                    <th className="w-10 px-2 py-3" />
                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider" style={{width: '90px'}}>Réf.</th>
                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider" style={{minWidth: '180px'}}>Désignation</th>
                    <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider" style={{width: '80px'}}>Qté</th>
                    <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider" style={{width: '85px'}}>Unité</th>
                    <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider" style={{width: '110px'}}>P.U. HT</th>
                    <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider" style={{width: '100px'}}>Remise</th>
                    <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider" style={{width: '70px'}}>TVA</th>
                    <th className="px-3 py-3 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider" style={{width: '120px'}}>Total HT</th>
                    <th className="w-10 px-2 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lignes.map((ligne, idx) => {
                    const computed = computeLigne(ligne);

                    if (ligne.type === 'SAUT_DE_LIGNE') {
                      return (
                        <tr key={ligne._uid} className="group">
                          <td colSpan={9} className="px-3 py-1">
                            <div className="border-t-2 border-gray-200 border-dashed" />
                          </td>
                          <td className="px-2 py-1">
                            <button onClick={() => removeLigne(idx)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition cursor-pointer">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    if (ligne.type === 'COMMENTAIRE') {
                      return (
                        <tr key={ligne._uid} className="group bg-amber-50/30">
                          <td className="px-2 py-2">
                            <span className="text-[10px] font-bold text-amber-600">COM</span>
                          </td>
                          <td colSpan={8} className="px-3 py-2">
                            <input
                              value={ligne.designation}
                              onChange={e => updateLigne(idx, 'designation', e.target.value)}
                              placeholder="Commentaire..."
                              className="w-full bg-transparent border-0 py-1.5 text-sm text-gray-600 italic outline-none placeholder-gray-400"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={() => removeLigne(idx)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition cursor-pointer">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    if (ligne.type === 'SOUS_TOTAL') {
                      const st = computeSousTotal(lignes, idx);
                      return (
                        <tr key={ligne._uid} className="group bg-gray-50 font-semibold">
                          <td className="px-2 py-2" />
                          <td colSpan={7} className="px-3 py-3 text-sm text-gray-700">
                            Sous-total
                          </td>
                          <td className="px-3 py-3 text-right text-sm text-gray-900 font-bold">
                            {fmt(st)}
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={() => removeLigne(idx)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition cursor-pointer">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={ligne._uid} className={`group hover:bg-blue-50/30 transition-colors ${ligne.est_optionnel ? 'opacity-60' : ''}`}>
                        <td className="px-2 py-3 align-top">
                          <label className="flex items-center cursor-pointer pt-1" title="Optionnel">
                            <input
                              type="checkbox"
                              checked={ligne.est_optionnel}
                              onChange={e => updateLigne(idx, 'est_optionnel', e.target.checked)}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </label>
                        </td>
                        <td className="px-2 py-3 align-top">
                          <input
                            value={ligne.reference}
                            onChange={e => updateLigne(idx, 'reference', e.target.value)}
                            placeholder="Réf."
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-xs text-gray-700 outline-none focus:bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20 transition"
                          />
                        </td>
                        <td className="px-2 py-3 align-top">
                          <div>
                            <div className="flex items-center gap-1">
                              <input
                                value={ligne.designation}
                                onChange={e => updateLigne(idx, 'designation', e.target.value)}
                                placeholder="Désignation du produit ou service"
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 outline-none focus:bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20 transition"
                              />
                              <button
                                onClick={() => updateLigne(idx, 'showDescription', !ligne.showDescription)}
                                className={`p-1.5 rounded-lg transition cursor-pointer ${ligne.showDescription ? 'text-blue-600 bg-blue-50' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`}
                                title="Description détaillée"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
                              </button>
                            </div>
                            {ligne.showDescription && (
                              <textarea
                                value={ligne.description_detaillee}
                                onChange={e => updateLigne(idx, 'description_detaillee', e.target.value)}
                                placeholder="Description détaillée..."
                                rows={2}
                                className="mt-1.5 w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-xs text-gray-600 outline-none focus:bg-white focus:border-blue-400 resize-none transition"
                              />
                            )}
                            {ligne.est_optionnel && (
                              <span className="inline-block mt-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                                Optionnel
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-3 align-top">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={ligne.quantite || ''}
                            onChange={e => updateLigne(idx, 'quantite', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                            onBlur={e => { if (e.target.value === '') updateLigne(idx, 'quantite', 0); }}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 text-center outline-none focus:bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                        <td className="px-2 py-3 align-top">
                          <select
                            value={ligne.unite}
                            onChange={e => updateLigne(idx, 'unite', e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-700 outline-none focus:bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20 transition cursor-pointer appearance-none"
                          >
                            {['unité', 'heure', 'jour', 'mois', 'forfait', 'lot', 'page', 'm²', 'ml', 'kg'].map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-3 align-top">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={ligne.prix_unitaire_ht || ''}
                            onChange={e => updateLigne(idx, 'prix_unitaire_ht', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                            onBlur={e => { if (e.target.value === '') updateLigne(idx, 'prix_unitaire_ht', 0); }}
                            placeholder="0,00"
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-900 text-right outline-none focus:bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                        <td className="px-2 py-3 align-top">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={ligne.remise_ligne_valeur || ''}
                              onChange={e => updateLigne(idx, 'remise_ligne_valeur', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                              onBlur={e => { if (e.target.value === '') updateLigne(idx, 'remise_ligne_valeur', 0); }}
                              placeholder="0"
                              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-900 text-right outline-none focus:bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20 transition [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              onClick={() => updateLigne(idx, 'remise_ligne_type', ligne.remise_ligne_type === 'POURCENTAGE' ? 'MONTANT_FIXE' : 'POURCENTAGE')}
                              className="shrink-0 text-[11px] font-bold px-1.5 py-1 rounded bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer transition"
                              title="Basculer %/€"
                            >
                              {ligne.remise_ligne_type === 'POURCENTAGE' ? '%' : '€'}
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-3 align-top">
                          <select
                            value={ligne.taux_tva}
                            onChange={e => updateLigne(idx, 'taux_tva', parseFloat(e.target.value))}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 text-xs text-gray-700 text-center outline-none focus:bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-500/20 transition cursor-pointer appearance-none"
                          >
                            <option value={20}>20%</option>
                            <option value={10}>10%</option>
                            <option value={5.5}>5,5%</option>
                            <option value={0}>0%</option>
                          </select>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <p className="text-sm text-right font-semibold text-gray-900 py-2 whitespace-nowrap">
                            {fmtNum(computed.montant_ht)} €
                          </p>
                        </td>
                        <td className="px-2 py-3 align-top">
                          <button
                            onClick={() => removeLigne(idx)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 mt-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>

            {/* Barre d'ajout de lignes */}
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex flex-wrap items-center gap-2 sticky bottom-0">
              <button
                onClick={() => addLigne('PRODUIT')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Ajouter une ligne
              </button>
              <button
                onClick={openCatalogue}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-3 py-2 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:border-blue-200 shadow-sm transition cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>
                Depuis le catalogue
              </button>
              <button
                onClick={() => addLigne('COMMENTAIRE')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>
                Commentaire
              </button>
              <button
                onClick={() => addLigne('SOUS_TOTAL')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5ZM8.25 6h7.5v2.25h-7.5V6ZM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0 0 12 2.25Z" /></svg>
                Sous-total
              </button>
              <button
                onClick={() => addLigne('SAUT_DE_LIGNE')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-gray-200 px-3 py-2 text-xs font-medium text-gray-500 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition cursor-pointer"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" /></svg>
                Saut de ligne
              </button>
            </div>
          </div>

          {/* --- Champs personnalisés --- */}
          <div className={cardClass}>
            <button
              onClick={() => setChampsOpen(!champsOpen)}
              className="w-full px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition"
            >
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Informations complémentaires</h3>
              <svg className={`h-4 w-4 text-gray-400 transition-transform ${champsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            </button>
            {champsOpen && (
              <div className="px-6 pb-6 space-y-4">
                {champs.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {champs.map((champ, idx) => (
                      <div key={champ._uid} className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">{champ.label}</label>
                          {champ.type === 'BOOLEEN' ? (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={champ.valeur === 'true'}
                                onChange={e => updateChamp(idx, 'valeur', e.target.checked ? 'true' : 'false')}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm text-gray-700">{champ.valeur === 'true' ? 'Oui' : 'Non'}</span>
                            </label>
                          ) : champ.type === 'DATE' ? (
                            <input
                              type="date"
                              value={champ.valeur}
                              onChange={e => updateChamp(idx, 'valeur', e.target.value)}
                              className={inputClass}
                            />
                          ) : champ.type === 'NOMBRE' ? (
                            <input
                              type="number"
                              value={champ.valeur}
                              onChange={e => updateChamp(idx, 'valeur', e.target.value)}
                              className={inputClass}
                            />
                          ) : (
                            <input
                              value={champ.valeur}
                              onChange={e => updateChamp(idx, 'valeur', e.target.value)}
                              className={inputClass}
                            />
                          )}
                        </div>
                        <button
                          onClick={() => removeChamp(idx)}
                          className="p-1 mt-4 text-gray-400 hover:text-red-500 transition cursor-pointer"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={openChampModal}
                  className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Ajouter un champ
                </button>
              </div>
            )}
          </div>

          {/* --- Footer : message + conditions --- */}
          <div className={`${cardClass} p-6 space-y-5`}>
            <div>
              <label className={labelClass}>Message au client</label>
              <textarea
                value={messageClient}
                onChange={e => { setMessageClient(e.target.value); markDirty(); }}
                rows={3}
                placeholder="Message affiché sur le devis PDF..."
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Conditions générales</label>
              <textarea
                value={conditionsGenerales}
                onChange={e => { setConditionsGenerales(e.target.value); markDirty(); }}
                rows={3}
                placeholder="Conditions générales de vente..."
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* COLONNE DROITE (30%) — sticky */}
        {/* ================================================================ */}
        <div className="lg:w-[30%] lg:min-w-[320px]">
          <div className="lg:sticky lg:top-6 space-y-6">

            {/* --- Récapitulatif financier --- */}
            <div className={cardClass}>
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Récapitulatif</h3>
              </div>
              <div className="px-6 py-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total HT</span>
                  <span className="font-medium text-gray-900">{fmt(totals.totalHt)}</span>
                </div>

                {/* Remise globale */}
                <div className="py-3 border-y border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500">Remise globale</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setRemiseGlobaleType(remiseGlobaleType === 'POURCENTAGE' ? 'MONTANT_FIXE' : 'POURCENTAGE'); markDirty(); }}
                        className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition cursor-pointer"
                      >
                        {remiseGlobaleType === 'POURCENTAGE' ? '%' : '€'}
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={remiseGlobaleValeur}
                    onChange={e => { setRemiseGlobaleValeur(parseFloat(e.target.value) || 0); markDirty(); }}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-right outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-500 transition"
                  />
                  {totals.montantRemise > 0 && (
                    <p className="text-xs text-red-500 text-right mt-1">- {fmt(totals.montantRemise)}</p>
                  )}
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Total HT après remise</span>
                  <span className="font-semibold text-gray-900">{fmt(totals.totalHtApresRemise)}</span>
                </div>

                {/* TVA breakdown */}
                {totals.tvaBreakdown.length > 0 && (
                  <div className="space-y-1 py-2 border-t border-gray-100">
                    {totals.tvaBreakdown.map(t => (
                      <div key={t.taux} className="flex justify-between text-xs text-gray-500">
                        <span>TVA {fmtNum(t.taux, 1)}% (base {fmt(t.base)})</span>
                        <span>{fmt(t.montant)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Total TTC */}
                <div className="flex justify-between items-center py-3 border-t border-gray-100">
                  <span className="text-base font-bold text-gray-900">Total TTC</span>
                  <span className="text-xl font-bold text-blue-600">{fmt(totals.totalTtc)}</span>
                </div>

                {/* Lignes optionnelles */}
                {totals.totalOptionnelHt > 0 && (
                  <div className="flex justify-between text-xs pt-1">
                    <span className="text-gray-400 italic">Dont lignes optionnelles HT</span>
                    <span className="text-gray-400 italic">{fmt(totals.totalOptionnelHt)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* --- Paramètres du devis --- */}
            <div className={`${cardClass} p-6 space-y-4`}>
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Paramètres</h3>
              <div>
                <label className={labelClass}>Conditions de paiement</label>
                <select
                  value={conditionsPaiement}
                  onChange={e => { setConditionsPaiement(e.target.value as DelaiPaiement); markDirty(); }}
                  className={selectClass}
                >
                  {(Object.entries(DELAI_LABELS) as [DelaiPaiement, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Mode de paiement</label>
                <select
                  value={modePaiement}
                  onChange={e => { setModePaiement(e.target.value as ModePaiement); markDirty(); }}
                  className={selectClass}
                >
                  {(Object.entries(MODE_LABELS) as [ModePaiement, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  Notes internes
                  <span className="ml-2 text-[10px] font-normal text-gray-400 italic">Non visible sur le PDF</span>
                </label>
                <textarea
                  value={notesInternes}
                  onChange={e => { setNotesInternes(e.target.value); markDirty(); }}
                  rows={3}
                  placeholder="Notes internes..."
                  className={inputClass}
                />
              </div>
            </div>

            {/* --- Actions --- */}
            <div className={`${cardClass} p-6 space-y-3`}>
              <button
                onClick={() => handleSave(false)}
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all cursor-pointer"
              >
                {saving ? (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
                )}
                Enregistrer brouillon
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm disabled:opacity-50 transition cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                Enregistrer et prévisualiser PDF
              </button>
              {lastSaved && (
                <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Sauvegardé {autoSaveTimer}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* MODAL — Catalogue produits */}
      {/* ================================================================ */}
      {showCatalogueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCatalogueModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Catalogue produits</h2>
              <button onClick={() => setShowCatalogueModal(false)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="px-6 py-3">
              <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
                <input
                  value={catalogueSearch}
                  onChange={e => searchCatalogue(e.target.value)}
                  placeholder="Rechercher un produit..."
                  className="w-full rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-10 pr-4 text-sm placeholder-gray-400 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              {catalogueLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-6 w-6 border-[3px] border-blue-600 border-t-transparent rounded-full" />
                </div>
              ) : catalogueResults.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-gray-500">Aucun produit trouvé</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {catalogueResults.map(p => (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition ${
                        catalogueSelected.has(p.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={catalogueSelected.has(p.id)}
                        onChange={() => toggleCatalogueItem(p.id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-400">{p.reference}</span>
                          {p.categorie && (
                            <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{p.categorie}</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-900 truncate">{p.designation}</p>
                        {p.description && (
                          <p className="text-xs text-gray-500 truncate">{p.description}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-gray-900">{fmt(p.prix_unitaire_ht)}</p>
                        <p className="text-[10px] text-gray-400">/{p.unite} · TVA {p.taux_tva}%</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {catalogueSelected.size > 0 && (
              <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-700">{catalogueSelected.size}</span> produit{catalogueSelected.size > 1 ? 's' : ''} sélectionné{catalogueSelected.size > 1 ? 's' : ''}
                </p>
                <button
                  onClick={addFromCatalogue}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:from-blue-700 hover:to-indigo-700 transition-all cursor-pointer"
                >
                  Ajouter au devis
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODAL — Ajout de champ personnalisé */}
      {/* ================================================================ */}
      {showChampModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowChampModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Ajouter un champ</h2>
              <button onClick={() => setShowChampModal(false)} className="p-1 text-gray-400 hover:text-gray-600 cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-3 flex gap-1">
              <button
                onClick={() => setChampModalTab('template')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition cursor-pointer ${
                  champModalTab === 'template' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                Depuis un template
              </button>
              <button
                onClick={() => setChampModalTab('custom')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition cursor-pointer ${
                  champModalTab === 'custom' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                Champ personnalisé
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {champModalTab === 'template' ? (
                champTemplatesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin h-6 w-6 border-[3px] border-blue-600 border-t-transparent rounded-full" />
                  </div>
                ) : champTemplates.length === 0 ? (
                  <p className="text-center text-sm text-gray-500 py-8">Aucun template disponible</p>
                ) : (
                  <div className="space-y-4">
                    {Array.from(templatesByCategory.entries()).map(([cat, templates]) => (
                      <div key={cat}>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{cat}</h4>
                        <div className="space-y-1">
                          {templates.map(tpl => (
                            <button
                              key={tpl.id}
                              onClick={() => addChampFromTemplate(tpl)}
                              className="w-full text-left p-3 rounded-xl hover:bg-blue-50 transition flex items-center justify-between border border-transparent hover:border-blue-100 cursor-pointer"
                            >
                              <div>
                                <p className="text-sm font-medium text-gray-900">{tpl.label}</p>
                                <p className="text-xs text-gray-400">Type : {TYPE_CHAMP_LABELS[tpl.type]}{tpl.valeur_defaut ? ` · Défaut : ${tpl.valeur_defaut}` : ''}</p>
                              </div>
                              <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Label du champ *</label>
                    <input
                      value={newChampLabel}
                      onChange={e => setNewChampLabel(e.target.value)}
                      placeholder="Ex: Numéro de commande"
                      className={inputClass}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Type</label>
                    <select
                      value={newChampType}
                      onChange={e => setNewChampType(e.target.value as TypeChamp)}
                      className={selectClass}
                    >
                      {(Object.entries(TYPE_CHAMP_LABELS) as [TypeChamp, string][]).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Valeur</label>
                    <input
                      value={newChampValeur}
                      onChange={e => setNewChampValeur(e.target.value)}
                      placeholder="Valeur initiale (optionnel)"
                      className={inputClass}
                    />
                  </div>
                  <button
                    onClick={addCustomChamp}
                    disabled={!newChampLabel.trim()}
                    className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    Ajouter le champ
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
