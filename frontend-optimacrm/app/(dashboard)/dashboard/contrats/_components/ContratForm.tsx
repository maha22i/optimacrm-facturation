'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import type {
  ContratDetail, ContratLigne, ContratMachine, Client,
  TypeContrat, Periodicite, StatutContrat, CategorieLigne,
  ApiResponse, PaginatedResponse, FactureDetail, ReleveCompteur,
  CatalogueProduit,
} from '@/lib/types';
import { formatCout, toNumber } from '@/lib/utils/formatNumber';

// ---------------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------------

interface ContratFormData {
  numero_contrat: string;
  type_contrat: TypeContrat;
  type_facturation: 'Unique' | 'Periodique';
  client_id: number | '';
  periodicite: Periodicite;
  date_signature: string;
  date_installation: string;
  date_debut: string;
  date_echeance: string;
  date_prochaine_facture: string;
  date_renouvellement: string;
  duree_contrat_mois: number;
  numero_dossier_financement: string;
  organisme_credit: string;
  montant_finance: number;
  loyer_ht: number;
  location_interne: boolean;
  statut: StatutContrat;
  ftc: number;
  ect: number;
  notes: string;
  devis_id: number | '';
}

interface LigneLocal extends Omit<ContratLigne, 'id' | 'contrat_id'> {
  id?: number;
  _key: string;
}

interface MachineLocal extends Omit<ContratMachine, 'id' | 'contrat_id'> {
  id?: number;
  _key: string;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const CATEGORIES_PAR_TYPE: Record<TypeContrat, CategorieLigne[]> = {
  Copieur: ['Forfait Copie N&B', 'Forfait Copie Couleur', 'Service Connectic', 'PLC', 'Hors Forfait', 'Personnalisé'],
  Telephonie: ['Forfait Fixe', 'Forfait Mobile', 'Lien Internet', 'Location Matériel', 'Services', 'Autre', 'Hors Forfait', 'Personnalisé'],
  Informatique: ['Location Matériel', 'Services', 'Autre', 'Personnalisé'],
  Securite: ['Location Matériel', 'Services', 'Autre', 'Personnalisé'],
};

const PERIODICITE_MOIS: Record<Periodicite, number> = {
  Mensuel: 1, Bimestriel: 2, Trimestriel: 3, Semestriel: 6, Annuel: 12,
};

const EMPTY_FORM: ContratFormData = {
  numero_contrat: '',
  type_contrat: 'Copieur',
  type_facturation: 'Periodique',
  client_id: '',
  periodicite: 'Trimestriel',
  date_signature: '',
  date_installation: '',
  date_debut: new Date().toISOString().split('T')[0],
  date_echeance: '',
  date_prochaine_facture: '',
  date_renouvellement: '',
  duree_contrat_mois: 63,
  numero_dossier_financement: '',
  organisme_credit: '',
  montant_finance: 0,
  loyer_ht: 0,
  location_interne: false,
  statut: 'Brouillon',
  ftc: 0,
  ect: 0,
  notes: '',
  devis_id: '',
};

function uid() { return Math.random().toString(36).slice(2, 9); }

function formatMoney(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function ContratForm({ contratId }: { contratId?: number }) {
  const router = useRouter();
  const isEdit = !!contratId;

  const [form, setForm] = useState<ContratFormData>({ ...EMPTY_FORM });
  const [lignes, setLignes] = useState<LigneLocal[]>([]);
  const [machines, setMachines] = useState<MachineLocal[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [financementOpen, setFinancementOpen] = useState(false);

  // Client search
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);

  // Machine modal
  const [machineModal, setMachineModal] = useState<MachineLocal | null>(null);
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [produitSearch, setProduitSearch] = useState('');
  const [produitResults, setProduitResults] = useState<CatalogueProduit[]>([]);
  const [produitDropdownOpen, setProduitDropdownOpen] = useState(false);

  // Facture generation modal
  const [factureModalOpen, setFactureModalOpen] = useState(false);
  const [facturePeriodeDebut, setFacturePeriodeDebut] = useState('');
  const [facturePeriodeFin, setFacturePeriodeFin] = useState('');
  const [factureGenerating, setFactureGenerating] = useState(false);
  const [factureResult, setFactureResult] = useState<{ id: number; numero_facture: string } | null>(null);
  const [relevesDisponibles, setRelevesDisponibles] = useState<ReleveCompteur[]>([]);
  const [selectedReleveNb, setSelectedReleveNb] = useState<number | ''>('');
  const [selectedReleveCoul, setSelectedReleveCoul] = useState<number | ''>('');
  const [relevesLoading, setRelevesLoading] = useState(false);

  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const produitDropdownRef = useRef<HTMLDivElement>(null);

  // Fermer les dropdowns au clic extérieur
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
      if (produitDropdownRef.current && !produitDropdownRef.current.contains(e.target as Node)) {
        setProduitDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---------------------------------------------------------------------------
  // Chargement données existantes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!contratId) return;
    (async () => {
      try {
        const res = await api.get<ApiResponse<ContratDetail>>(`/contrats/${contratId}`);
        const c = res.data;
        setForm({
          numero_contrat: c.numero_contrat,
          type_contrat: c.type_contrat,
          type_facturation: c.type_facturation,
          client_id: c.client_id,
          periodicite: c.periodicite,
          date_signature: c.date_signature || '',
          date_installation: c.date_installation || '',
          date_debut: c.date_debut || '',
          date_echeance: c.date_echeance || '',
          date_prochaine_facture: c.date_prochaine_facture || '',
          date_renouvellement: c.date_renouvellement || '',
          duree_contrat_mois: c.duree_contrat_mois ?? 63,
          numero_dossier_financement: c.numero_dossier_financement || '',
          organisme_credit: c.organisme_credit || '',
          montant_finance: c.montant_finance ?? 0,
          loyer_ht: c.loyer_ht ?? 0,
          location_interne: c.location_interne ?? false,
          statut: c.statut,
          ftc: parseFloat(String(c.ftc)) || 0,
          ect: parseFloat(String(c.ect)) || 0,
          notes: c.notes || '',
          devis_id: c.devis_id || '',
        });
        setLignes(c.lignes.map(l => ({
          ...l,
          _key: uid(),
          quantite: toNumber(l.quantite) ?? 0,
          prix_unitaire_ht: toNumber(l.prix_unitaire_ht) ?? 0,
          remise_pourcentage: toNumber(l.remise_pourcentage) ?? 0,
          taux_tva: toNumber(l.taux_tva) ?? 20,
        })));
        setMachines(c.machines.map(m => ({
          ...m,
          _key: uid(),
          cout_copie_nb: toNumber(m.cout_copie_nb) ?? 0,
          cout_copie_couleur: toNumber(m.cout_copie_couleur) ?? 0,
          cout_copie_t1: toNumber(m.cout_copie_t1) ?? 0,
          cout_copie_t2: toNumber(m.cout_copie_t2) ?? 0,
          cout_copie_t3: toNumber(m.cout_copie_t3) ?? 0,
          service_connectic: toNumber(m.service_connectic) ?? 0,
          service_collecteur: toNumber(m.service_collecteur) ?? 0,
          service_divers: toNumber(m.service_divers) ?? 0,
          service_autre: toNumber(m.service_autre) ?? 0,
          volume_forfait_nb: toNumber(m.volume_forfait_nb) ?? 0,
          volume_forfait_couleur: toNumber(m.volume_forfait_couleur) ?? 0,
        })));
        if (c.client_raison_sociale) {
          setSelectedClient({ id: c.client_id, raison_sociale: c.client_raison_sociale, numero_client: c.client_code || '' } as Client);
          setClientSearch(c.client_raison_sociale);
        }
        if (c.numero_dossier_financement || c.organisme_credit || (c.montant_finance && c.montant_finance > 0)) {
          setFinancementOpen(true);
        }
      } catch {
        router.push('/dashboard/contrats');
      } finally {
        setLoading(false);
      }
    })();
  }, [contratId, router]);

  // ---------------------------------------------------------------------------
  // Recherche client
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!clientSearch || clientSearch.length < 2) {
      setClientResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.get<PaginatedResponse<Client>>(`/clients?search=${encodeURIComponent(clientSearch)}&limit=8`);
        setClientResults(res.data);
      } catch { /* */ }
    }, 250);
    return () => clearTimeout(t);
  }, [clientSearch]);

  const selectClient = (c: Client) => {
    setSelectedClient(c);
    setClientSearch(c.raison_sociale);
    setForm(prev => ({ ...prev, client_id: c.id }));
    setClientDropdownOpen(false);
    setErrors(prev => { const e = { ...prev }; delete e.client_id; return e; });
  };

  // ---------------------------------------------------------------------------
  // Recherche produit catalogue (machine modal)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!produitSearch || produitSearch.length < 2) {
      setProduitResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.get<PaginatedResponse<CatalogueProduit>>(`/catalogue?search=${encodeURIComponent(produitSearch)}&limit=8`);
        setProduitResults(res.data);
      } catch { /* */ }
    }, 250);
    return () => clearTimeout(t);
  }, [produitSearch]);

  const selectProduit = (p: CatalogueProduit) => {
    if (!machineModal) return;
    setMachineModal({
      ...machineModal,
      modele: p.modele || p.designation || '',
      marque: p.marque_nom || '',
      designation: p.designation || '',
      catalogue_produit_id: p.id,
    });
    setProduitSearch(p.designation + (p.marque_nom ? ` (${p.marque_nom})` : ''));
    setProduitDropdownOpen(false);
  };

  // ---------------------------------------------------------------------------
  // Auto-calcul dates
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (form.date_debut && form.duree_contrat_mois > 0 && !form.date_echeance) {
      const d = new Date(form.date_debut);
      d.setMonth(d.getMonth() + form.duree_contrat_mois);
      setForm(prev => ({ ...prev, date_echeance: d.toISOString().split('T')[0] }));
    }
  }, [form.date_debut, form.duree_contrat_mois, form.date_echeance]);

  // ---------------------------------------------------------------------------
  // Calculs totaux
  // ---------------------------------------------------------------------------

  const totaux = useMemo(() => {
    const sousTotal = lignes
      .filter(l => l.actif)
      .reduce((sum, l) => sum + (l.quantite * l.prix_unitaire_ht * (1 - (l.remise_pourcentage || 0) / 100)), 0);
    const totalHT = sousTotal + (form.ftc || 0) + (form.ect || 0);
    const tva = lignes.filter(l => l.actif).reduce((sum, l) => {
      const montant = l.quantite * l.prix_unitaire_ht * (1 - (l.remise_pourcentage || 0) / 100);
      return sum + montant * l.taux_tva / 100;
    }, 0) + ((form.ftc || 0) + (form.ect || 0)) * 0.2;
    const totalTTC = totalHT + tva;
    const caAnnuel = totalHT * (12 / PERIODICITE_MOIS[form.periodicite]);
    return { sousTotal, totalHT, tva, totalTTC, caAnnuel };
  }, [lignes, form.ftc, form.ect, form.periodicite]);

  // ---------------------------------------------------------------------------
  // Gestion lignes
  // ---------------------------------------------------------------------------

  const addLigne = () => {
    const categories = CATEGORIES_PAR_TYPE[form.type_contrat];
    setLignes(prev => [...prev, {
      _key: uid(),
      ordre: prev.length,
      categorie_ligne: categories[0] || null,
      reference: '',
      designation: '',
      complement_info: null,
      quantite: 1,
      prix_unitaire_ht: 0,
      remise_pourcentage: 0,
      taux_tva: 20,
      catalogue_produit_id: null,
      actif: true,
    }]);
  };

  const updateLigne = (key: string, field: string, value: unknown) => {
    setLignes(prev => prev.map(l => l._key === key ? { ...l, [field]: value } : l));
  };

  const removeLigne = (key: string) => {
    setLignes(prev => prev.filter(l => l._key !== key));
  };

  // ---------------------------------------------------------------------------
  // Gestion machines
  // ---------------------------------------------------------------------------

  const openMachineModal = (m?: MachineLocal) => {
    setMachineModal(m || {
      _key: uid(),
      numero_serie: '',
      modele: '',
      marque: '',
      designation: '',
      cout_copie_nb: 0,
      cout_copie_couleur: 0,
      cout_copie_t1: 0,
      cout_copie_t2: 0,
      cout_copie_t3: 0,
      volume_forfait_nb: 0,
      volume_forfait_couleur: 0,
      volume_forfait_t1: 0,
      volume_forfait_t2: 0,
      dernier_compteur_nb: 0,
      dernier_compteur_couleur: 0,
      date_dernier_releve: null,
      service_connectic: 0,
      service_collecteur: 0,
      service_divers: 0,
      service_autre: 0,
      actif: true,
      catalogue_produit_id: null,
    });
    setProduitSearch(m ? (m.designation || '') : '');
    setProduitResults([]);
    setProduitDropdownOpen(false);
    setMachineModalOpen(true);
  };

  const saveMachine = () => {
    if (!machineModal) return;
    if (!machineModal.numero_serie) return;
    setMachines(prev => {
      const idx = prev.findIndex(m => m._key === machineModal._key);
      if (idx >= 0) { const arr = [...prev]; arr[idx] = machineModal; return arr; }
      return [...prev, machineModal];
    });
    setMachineModalOpen(false);
    setMachineModal(null);
  };

  const removeMachine = (key: string) => {
    setMachines(prev => prev.filter(m => m._key !== key));
  };

  // ---------------------------------------------------------------------------
  // Validation + Submit
  // ---------------------------------------------------------------------------

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.type_contrat) e.type_contrat = 'Requis';
    if (!form.client_id) e.client_id = 'Veuillez sélectionner un client';
    if (!form.date_debut) e.date_debut = 'Requis';
    if (lignes.length === 0) e.lignes = 'Ajoutez au moins une ligne';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        client_id: Number(form.client_id),
        devis_id: form.devis_id ? Number(form.devis_id) : null,
        date_signature: form.date_signature || null,
        date_installation: form.date_installation || null,
        date_echeance: form.date_echeance || null,
        date_prochaine_facture: form.date_prochaine_facture || null,
        date_renouvellement: form.date_renouvellement || null,
        numero_contrat: form.numero_contrat || undefined,
        lignes: lignes.map((l, i) => ({
          ...l,
          ordre: i,
          _key: undefined,
          id: undefined,
        })),
        machines: machines.map(m => ({
          ...m,
          _key: undefined,
          id: undefined,
        })),
      };

      if (isEdit) {
        await api.put(`/contrats/${contratId}`, payload);
        // Also sync lignes and machines individually if editing
        // For simplicity, delete all then re-add
        const existing = await api.get<ApiResponse<ContratDetail>>(`/contrats/${contratId}`);
        for (const l of existing.data.lignes) {
          await api.delete(`/contrats/${contratId}/lignes/${l.id}`);
        }
        for (const m of existing.data.machines) {
          await api.delete(`/contrats/${contratId}/machines/${m.id}`);
        }
        for (let i = 0; i < lignes.length; i++) {
          const l = lignes[i];
          await api.post(`/contrats/${contratId}/lignes`, { ...l, ordre: i, _key: undefined, id: undefined });
        }
        for (const m of machines) {
          await api.post(`/contrats/${contratId}/machines`, { ...m, _key: undefined, id: undefined });
        }
        router.push(`/dashboard/contrats/${contratId}`);
      } else {
        const res = await api.post<ApiResponse<ContratDetail>>('/contrats', payload);
        router.push(`/dashboard/contrats/${res.data.id}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors({ _global: err.message });
      }
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const updateField = (field: keyof ContratFormData, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => { const e = { ...prev }; delete e[field]; delete e._global; return e; });
  };

  const categories = CATEGORIES_PAR_TYPE[form.type_contrat];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-10 w-10 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEdit ? `Contrat ${form.numero_contrat}` : 'Nouveau contrat'}
            </h1>
            {selectedClient && (
              <p className="text-sm text-gray-500 mt-0.5">{selectedClient.raison_sociale}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving && <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
            {isEdit ? 'Enregistrer' : 'Créer le contrat'}
          </button>
        </div>
      </div>

      {errors._global && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">{errors._global}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* ── Colonne gauche ── */}
        <div className="space-y-6">

          {/* Section 1: Informations générales */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
            <h2 className="text-base font-semibold text-gray-900">Informations générales</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">N° de contrat <span className="text-gray-400 text-xs">(auto si vide)</span></label>
                <input
                  type="text"
                  value={form.numero_contrat}
                  onChange={e => updateField('numero_contrat', e.target.value)}
                  placeholder="Auto-généré"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type de facturation</label>
                <select
                  value={form.type_facturation}
                  onChange={e => updateField('type_facturation', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none cursor-pointer"
                >
                  <option value="Periodique">Périodique</option>
                  <option value="Unique">Unique</option>
                </select>
              </div>
            </div>

            {/* Type contrat radio */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Type de contrat *</label>
              <div className="flex flex-wrap gap-2">
                {(['Copieur', 'Telephonie', 'Informatique', 'Securite'] as TypeContrat[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => updateField('type_contrat', t)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all cursor-pointer ${
                      form.type_contrat === t
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {t === 'Telephonie' ? 'Téléphonie' : t === 'Securite' ? 'Sécurité' : t}
                  </button>
                ))}
              </div>
              {errors.type_contrat && <p className="text-xs text-red-500 mt-1">{errors.type_contrat}</p>}
            </div>

            {/* Client search */}
            <div className="relative" ref={clientDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
              <input
                type="text"
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setClientDropdownOpen(true); if (!e.target.value) { setSelectedClient(null); updateField('client_id', ''); } }}
                onFocus={() => clientResults.length > 0 && setClientDropdownOpen(true)}
                placeholder="Rechercher par raison sociale ou code client..."
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/10 outline-none ${errors.client_id ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-blue-300'}`}
              />
              {errors.client_id && <p className="text-xs text-red-500 mt-1">{errors.client_id}</p>}
              {clientDropdownOpen && clientResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {clientResults.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectClient(c)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors cursor-pointer flex items-center justify-between"
                    >
                      <span className="font-medium text-gray-900">{c.raison_sociale}</span>
                      <span className="text-xs text-gray-400">{c.numero_client}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Périodicité */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Périodicité</label>
              <select
                value={form.periodicite}
                onChange={e => updateField('periodicite', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none cursor-pointer"
              >
                {(['Mensuel', 'Bimestriel', 'Trimestriel', 'Semestriel', 'Annuel'] as Periodicite[]).map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Section 2: Dates et durée */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Dates et durée</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date de signature</label>
                <input type="date" value={form.date_signature} onChange={e => updateField('date_signature', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d&apos;installation</label>
                <input type="date" value={form.date_installation} onChange={e => updateField('date_installation', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date de début *</label>
                <input type="date" value={form.date_debut} onChange={e => updateField('date_debut', e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/10 outline-none ${errors.date_debut ? 'border-red-300' : 'border-gray-200 focus:border-blue-300'}`} />
                {errors.date_debut && <p className="text-xs text-red-500 mt-1">{errors.date_debut}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Durée (mois)</label>
                <input type="number" value={form.duree_contrat_mois} onChange={e => updateField('duree_contrat_mois', parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d&apos;échéance</label>
                <input type="date" value={form.date_echeance} onChange={e => updateField('date_echeance', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Renouvellement</label>
                <input type="date" value={form.date_renouvellement} onChange={e => updateField('date_renouvellement', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prochaine facture</label>
                <input type="date" value={form.date_prochaine_facture} onChange={e => updateField('date_prochaine_facture', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
              </div>
            </div>
          </div>

          {/* Section 3: Financement (collapsible) */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setFinancementOpen(!financementOpen)}
              className="w-full flex items-center justify-between p-6 text-left cursor-pointer hover:bg-gray-50/50 transition-colors"
            >
              <h2 className="text-base font-semibold text-gray-900">Financement</h2>
              <svg className={`h-5 w-5 text-gray-400 transition-transform ${financementOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {financementOpen && (
              <div className="px-6 pb-6 space-y-4 border-t border-gray-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">N° dossier financement</label>
                    <input type="text" value={form.numero_dossier_financement} onChange={e => updateField('numero_dossier_financement', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Organisme de crédit</label>
                    <input type="text" value={form.organisme_credit} onChange={e => updateField('organisme_credit', e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Montant financé</label>
                    <input type="number" step="0.01" value={form.montant_finance} onChange={e => updateField('montant_finance', parseFloat(e.target.value) || 0)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Loyer HT</label>
                    <input type="number" step="0.01" value={form.loyer_ht} onChange={e => updateField('loyer_ht', parseFloat(e.target.value) || 0)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.location_interne} onChange={e => updateField('location_interne', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-sm text-gray-700">Location interne</span>
                </label>
              </div>
            )}
          </div>

          {/* Section 4: Machines (Copieur only) */}
          {form.type_contrat === 'Copieur' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">Machines</h2>
                <button type="button" onClick={() => openMachineModal()} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 cursor-pointer">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Ajouter une machine
                </button>
              </div>

              {machines.length > 0 ? (
                <div className="overflow-x-auto -mx-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">N° Série</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Modèle</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Marque</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Coût N&B</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Coût Couleur</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Forfait N&B</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Forfait Coul.</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {machines.map(m => (
                        <tr key={m._key} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2 font-medium text-gray-900">{m.numero_serie}</td>
                          <td className="px-4 py-2 text-gray-600">{m.modele || '—'}</td>
                          <td className="px-4 py-2 text-gray-600">{m.marque || '—'}</td>
                          <td className="px-4 py-2 text-right text-gray-600">{formatCout(m.cout_copie_nb, { formatFR: true })}</td>
                          <td className="px-4 py-2 text-right text-gray-600">{formatCout(m.cout_copie_couleur, { formatFR: true })}</td>
                          <td className="px-4 py-2 text-right text-gray-600">{Number(m.volume_forfait_nb).toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-2 text-right text-gray-600">{Number(m.volume_forfait_couleur).toLocaleString('fr-FR')}</td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button type="button" onClick={() => openMachineModal(m)} className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
                              </button>
                              <button type="button" onClick={() => removeMachine(m._key)} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">Aucune machine ajoutée</p>
              )}
            </div>
          )}

          {/* Section 5: Lignes de contrat */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Lignes de contrat</h2>
              <button type="button" onClick={addLigne} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 cursor-pointer">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Ajouter une ligne
              </button>
            </div>
            {errors.lignes && <p className="text-xs text-red-500">{errors.lignes}</p>}

            {lignes.length > 0 ? (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-8">#</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Catégorie</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-20">Réf.</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Désignation</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-20">Qté</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-24">P.U HT</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-16">TVA</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-24">Total HT</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-16">Act.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lignes.map((l, idx) => {
                      const total = l.quantite * l.prix_unitaire_ht * (1 - (l.remise_pourcentage || 0) / 100);
                      return (
                        <tr key={l._key} className="hover:bg-gray-50/50">
                          <td className="px-3 py-1.5 text-gray-400 text-center">{idx + 1}</td>
                          <td className="px-3 py-1.5">
                            <select value={l.categorie_ligne || ''} onChange={e => updateLigne(l._key, 'categorie_ligne', e.target.value || null)}
                              className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-300 outline-none cursor-pointer">
                              <option value="">—</option>
                              {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="text" value={l.reference || ''} onChange={e => updateLigne(l._key, 'reference', e.target.value)}
                              placeholder="REF" className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-300 outline-none" />
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="text" value={l.designation} onChange={e => updateLigne(l._key, 'designation', e.target.value)}
                              placeholder="Désignation" className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-300 outline-none" />
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="number" step="0.01" value={l.quantite} onChange={e => updateLigne(l._key, 'quantite', parseFloat(e.target.value) || 0)}
                              className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-right focus:border-blue-300 outline-none" />
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="number" step="0.0000000001" value={l.prix_unitaire_ht} onChange={e => updateLigne(l._key, 'prix_unitaire_ht', toNumber(e.target.value) ?? 0)}
                              className="w-full rounded border border-gray-200 px-2 py-1 text-xs text-right focus:border-blue-300 outline-none" />
                          </td>
                          <td className="px-3 py-1.5">
                            <select value={l.taux_tva} onChange={e => updateLigne(l._key, 'taux_tva', parseFloat(e.target.value))}
                              className="w-full rounded border border-gray-200 px-1 py-1 text-xs text-right focus:border-blue-300 outline-none cursor-pointer">
                              <option value={20}>20%</option>
                              <option value={10}>10%</option>
                              <option value={5.5}>5,5%</option>
                              <option value={0}>0%</option>
                            </select>
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium text-gray-900 text-xs whitespace-nowrap">
                            {formatMoney(total)}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <button type="button" onClick={() => removeLigne(l._key)}
                              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">Aucune ligne ajoutée</p>
            )}

            {/* FTC / ECT / Totaux */}
            <div className="border-t border-gray-100 pt-4 mt-4">
              <div className="flex flex-col items-end gap-2">
                <div className="grid grid-cols-[auto_120px] gap-x-4 gap-y-2 text-sm">
                  <span className="text-gray-500 text-right">Sous-total HT :</span>
                  <span className="text-right font-medium text-gray-900">{formatMoney(totaux.sousTotal)}</span>

                  <span className="text-gray-500 text-right flex items-center gap-2 justify-end">
                    FTC :
                    <input type="number" step="0.01" value={form.ftc} onChange={e => updateField('ftc', parseFloat(e.target.value) || 0)}
                      className="w-20 rounded border border-gray-200 px-2 py-1 text-xs text-right focus:border-blue-300 outline-none" />
                  </span>
                  <span className="text-right font-medium text-gray-900">{formatMoney(form.ftc)}</span>

                  <span className="text-gray-500 text-right flex items-center gap-2 justify-end">
                    ECT :
                    <input type="number" step="0.01" value={form.ect} onChange={e => updateField('ect', parseFloat(e.target.value) || 0)}
                      className="w-20 rounded border border-gray-200 px-2 py-1 text-xs text-right focus:border-blue-300 outline-none" />
                  </span>
                  <span className="text-right font-medium text-gray-900">{formatMoney(form.ect)}</span>

                  <span className="text-gray-700 text-right font-semibold border-t border-gray-200 pt-2">Total HT :</span>
                  <span className="text-right font-bold text-gray-900 border-t border-gray-200 pt-2">{formatMoney(totaux.totalHT)}</span>

                  <span className="text-gray-500 text-right">TVA :</span>
                  <span className="text-right font-medium text-gray-600">{formatMoney(totaux.tva)}</span>

                  <span className="text-gray-700 text-right font-semibold">Total TTC :</span>
                  <span className="text-right font-bold text-blue-600 text-base">{formatMoney(totaux.totalTTC)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 7: Notes */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-3">
            <h2 className="text-base font-semibold text-gray-900">Notes internes</h2>
            <textarea
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              rows={3}
              placeholder="Notes internes sur ce contrat..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none resize-y"
            />
          </div>
        </div>

        {/* ── Colonne droite (30%) ── */}
        <div className="space-y-5">

          {/* Card Statut */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Statut</h3>
            <select
              value={form.statut}
              onChange={e => updateField('statut', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none cursor-pointer"
            >
              {(['Brouillon', 'Actif', 'Suspendu', 'Résilié', 'Échu', 'Renouvelé'] as StatutContrat[]).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {isEdit && (
              <div className="text-xs text-gray-400 space-y-1">
                <p>Créé le {new Date(form.date_debut).toLocaleDateString('fr-FR')}</p>
              </div>
            )}
          </div>

          {/* Card Résumé financier */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Résumé financier</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Montant HT {form.periodicite.toLowerCase()}</span>
                <span className="font-semibold text-gray-900">{formatMoney(totaux.totalHT)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Montant TTC {form.periodicite.toLowerCase()}</span>
                <span className="font-semibold text-gray-900">{formatMoney(totaux.totalTTC)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-100">
                <span className="text-gray-500">CA annuel estimé</span>
                <span className="font-bold text-blue-600">{formatMoney(totaux.caAnnuel)}</span>
              </div>
            </div>
          </div>

          {/* Card Dernière facturation */}
          {isEdit && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Dernière facturation</h3>
              <div className="space-y-2 text-sm text-gray-500">
                <p>Pas encore de facture émise</p>
              </div>
            </div>
          )}

          {/* Card Client */}
          {selectedClient && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Client</h3>
              <div className="space-y-1.5 text-sm">
                <p className="font-medium text-gray-900">{selectedClient.raison_sociale}</p>
                <p className="text-gray-500">{selectedClient.numero_client}</p>
                {selectedClient.email_principal && <p className="text-gray-500">{selectedClient.email_principal}</p>}
              </div>
              <button
                type="button"
                onClick={() => router.push(`/dashboard/clients/${selectedClient.id}`)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                Voir la fiche client →
              </button>
            </div>
          )}

          {/* Card Actions */}
          {isEdit && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Actions</h3>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await api.post<ApiResponse<ContratDetail>>(`/contrats/${contratId}/duplicate`, {});
                      router.push(`/dashboard/contrats/${res.data.id}`);
                    } catch { /* */ }
                  }}
                  className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer flex items-center gap-2"
                >
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                  </svg>
                  Dupliquer le contrat
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const debut = new Date(now.getFullYear(), now.getMonth(), 1);
                    const fin = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    setFacturePeriodeDebut(debut.toISOString().slice(0, 10));
                    setFacturePeriodeFin(fin.toISOString().slice(0, 10));
                    setFactureResult(null);
                    setSelectedReleveNb('');
                    setSelectedReleveCoul('');
                    setRelevesDisponibles([]);
                    setFactureModalOpen(true);
                    if (form.type_contrat === 'Copieur' && contratId) {
                      setRelevesLoading(true);
                      api.get<ApiResponse<ReleveCompteur[]>>(`/factures/releves-disponibles/${contratId}`)
                        .then(res => setRelevesDisponibles(res.data))
                        .catch(() => setRelevesDisponibles([]))
                        .finally(() => setRelevesLoading(false));
                    }
                  }}
                  disabled={form.statut !== 'Actif'}
                  className={`w-full text-left px-3 py-2 text-sm rounded-lg flex items-center gap-2 transition-colors cursor-pointer ${form.statut === 'Actif' ? 'text-violet-700 hover:bg-violet-50 font-medium' : 'text-gray-400 cursor-not-allowed'}`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                  </svg>
                  Créer une facture
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Facture Generation Modal ── */}
      {factureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {factureResult ? 'Facture créée' : `Générer une facture pour ${form.numero_contrat}`}
              </h3>
              <button type="button" onClick={() => setFactureModalOpen(false)} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {factureResult ? (
                <div className="text-center py-4">
                  <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                    <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  </div>
                  <p className="font-semibold text-gray-900 mb-1">Facture {factureResult.numero_facture} créée en brouillon</p>
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/factures/${factureResult.id}`)}
                    className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition cursor-pointer"
                  >
                    Ouvrir la facture
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Période du</label>
                      <input type="date" value={facturePeriodeDebut} onChange={e => setFacturePeriodeDebut(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">au</label>
                      <input type="date" value={facturePeriodeFin} onChange={e => setFacturePeriodeFin(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none" />
                    </div>
                  </div>

                  {form.type_contrat === 'Copieur' && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm font-semibold text-gray-700 mb-3">Relevés de compteur</p>
                      {relevesLoading ? (
                        <p className="text-sm text-gray-400">Chargement des relevés...</p>
                      ) : relevesDisponibles.length === 0 ? (
                        <p className="text-sm text-gray-500">Aucun relevé importé — les compteurs seront à 0</p>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Relevé N&B</label>
                            <select value={selectedReleveNb} onChange={e => setSelectedReleveNb(e.target.value ? Number(e.target.value) : '')}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 outline-none cursor-pointer">
                              <option value="">Aucun</option>
                              {relevesDisponibles.map(r => (
                                <option key={r.id} value={r.id}>
                                  {new Date(r.date_releve).toLocaleDateString('fr-FR')} — NB: {r.compteur_nb?.toLocaleString('fr-FR') ?? 0} | Coul: {r.compteur_couleur?.toLocaleString('fr-FR') ?? 0}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">Relevé Couleur</label>
                            <select value={selectedReleveCoul} onChange={e => setSelectedReleveCoul(e.target.value ? Number(e.target.value) : '')}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 outline-none cursor-pointer">
                              <option value="">Aucun</option>
                              {relevesDisponibles.map(r => (
                                <option key={r.id} value={r.id}>
                                  {new Date(r.date_releve).toLocaleDateString('fr-FR')} — NB: {r.compteur_nb?.toLocaleString('fr-FR') ?? 0} | Coul: {r.compteur_couleur?.toLocaleString('fr-FR') ?? 0}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {!factureResult && (
              <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
                <button type="button" onClick={() => setFactureModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={!facturePeriodeDebut || !facturePeriodeFin || factureGenerating}
                  onClick={async () => {
                    if (!contratId || !facturePeriodeDebut || !facturePeriodeFin) return;
                    setFactureGenerating(true);
                    try {
                      const body: Record<string, unknown> = { periode_debut: facturePeriodeDebut, periode_fin: facturePeriodeFin };
                      if (selectedReleveNb) body.releve_compteur_nb_id = selectedReleveNb;
                      if (selectedReleveCoul) body.releve_compteur_coul_id = selectedReleveCoul;
                      const res = await api.post<ApiResponse<FactureDetail>>(`/contrats/${contratId}/generer-facture`, body);
                      setFactureResult({ id: res.data.id, numero_facture: res.data.numero_facture });
                    } catch (err: unknown) {
                      alert(err instanceof Error ? err.message : 'Erreur lors de la génération');
                    } finally {
                      setFactureGenerating(false);
                    }
                  }}
                  className="px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {factureGenerating ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Génération...
                    </span>
                  ) : 'Générer la facture'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Machine Modal ── */}
      {machineModalOpen && machineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                {machineModal.id ? 'Modifier la machine' : 'Ajouter une machine'}
              </h3>
              <button type="button" onClick={() => setMachineModalOpen(false)} className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* Recherche produit catalogue */}
              <div className="relative" ref={produitDropdownRef}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rechercher dans le catalogue
                  <span className="text-xs text-gray-400 font-normal ml-1">(optionnel)</span>
                </label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                  <input
                    type="text"
                    value={produitSearch}
                    onChange={e => { setProduitSearch(e.target.value); setProduitDropdownOpen(true); }}
                    onFocus={() => produitResults.length > 0 && setProduitDropdownOpen(true)}
                    placeholder="Rechercher par désignation, référence, marque..."
                    className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none"
                  />
                </div>
                {produitDropdownOpen && produitResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {produitResults.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => selectProduit(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <span className="font-medium text-gray-900">{p.designation}</span>
                          {p.marque_nom && <span className="text-gray-500 ml-2">— {p.marque_nom}</span>}
                          {p.modele && <span className="text-gray-400 ml-1">({p.modele})</span>}
                        </div>
                        <span className="text-xs text-gray-400">{p.reference}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">N° Série *</label>
                  <input type="text" value={machineModal.numero_serie} onChange={e => setMachineModal({ ...machineModal, numero_serie: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Modèle</label>
                  <input type="text" value={machineModal.modele || ''} onChange={e => setMachineModal({ ...machineModal, modele: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Marque</label>
                  <input type="text" value={machineModal.marque || ''} onChange={e => setMachineModal({ ...machineModal, marque: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Désignation</label>
                <input type="text" value={machineModal.designation || ''} onChange={e => setMachineModal({ ...machineModal, designation: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-300 outline-none" />
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Coûts copie</h4>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">N&B</label>
                    <input type="number" step="0.0000000001" value={machineModal.cout_copie_nb ?? ''} onChange={e => setMachineModal({ ...machineModal, cout_copie_nb: toNumber(e.target.value) ?? 0 })}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-blue-300 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Couleur</label>
                    <input type="number" step="0.0000000001" value={machineModal.cout_copie_couleur ?? ''} onChange={e => setMachineModal({ ...machineModal, cout_copie_couleur: toNumber(e.target.value) ?? 0 })}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-blue-300 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">T1</label>
                    <input type="number" step="0.0000000001" value={machineModal.cout_copie_t1 ?? ''} onChange={e => setMachineModal({ ...machineModal, cout_copie_t1: toNumber(e.target.value) ?? 0 })}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-blue-300 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">T2</label>
                    <input type="number" step="0.0000000001" value={machineModal.cout_copie_t2 ?? ''} onChange={e => setMachineModal({ ...machineModal, cout_copie_t2: toNumber(e.target.value) ?? 0 })}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-blue-300 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">T3</label>
                    <input type="number" step="0.0000000001" value={machineModal.cout_copie_t3 ?? ''} onChange={e => setMachineModal({ ...machineModal, cout_copie_t3: toNumber(e.target.value) ?? 0 })}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-blue-300 outline-none" />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Volumes forfaitaires</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Forfait N&B</label>
                    <input type="number" value={machineModal.volume_forfait_nb} onChange={e => setMachineModal({ ...machineModal, volume_forfait_nb: parseInt(e.target.value) || 0 })}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-blue-300 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Forfait Couleur</label>
                    <input type="number" value={machineModal.volume_forfait_couleur} onChange={e => setMachineModal({ ...machineModal, volume_forfait_couleur: parseInt(e.target.value) || 0 })}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-blue-300 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">T1</label>
                    <input type="number" value={machineModal.volume_forfait_t1} onChange={e => setMachineModal({ ...machineModal, volume_forfait_t1: parseInt(e.target.value) || 0 })}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-blue-300 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">T2</label>
                    <input type="number" value={machineModal.volume_forfait_t2} onChange={e => setMachineModal({ ...machineModal, volume_forfait_t2: parseInt(e.target.value) || 0 })}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-blue-300 outline-none" />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">Services associés</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Connectic</label>
                    <input type="number" step="0.0000000001" value={machineModal.service_connectic ?? ''} onChange={e => setMachineModal({ ...machineModal, service_connectic: toNumber(e.target.value) ?? 0 })}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-blue-300 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Collecteur</label>
                    <input type="number" step="0.0000000001" value={machineModal.service_collecteur ?? ''} onChange={e => setMachineModal({ ...machineModal, service_collecteur: toNumber(e.target.value) ?? 0 })}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-blue-300 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Divers</label>
                    <input type="number" step="0.0000000001" value={machineModal.service_divers ?? ''} onChange={e => setMachineModal({ ...machineModal, service_divers: toNumber(e.target.value) ?? 0 })}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-blue-300 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Autre</label>
                    <input type="number" step="0.0000000001" value={machineModal.service_autre ?? ''} onChange={e => setMachineModal({ ...machineModal, service_autre: toNumber(e.target.value) ?? 0 })}
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-right focus:border-blue-300 outline-none" />
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
              <button type="button" onClick={() => setMachineModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer">
                Annuler
              </button>
              <button type="button" onClick={saveMachine}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer">
                {machineModal.id ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
