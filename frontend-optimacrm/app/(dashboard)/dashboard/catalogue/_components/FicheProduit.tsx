'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { CatalogueProduit, Fournisseur, Marque, FamilleProduit, Unite, TarifClient, ProduitComptabilite, ApiResponse, PaginatedResponse, CategorieFamille } from '@/lib/types';
import JsBarcode from 'jsbarcode';

const CATEGORIES: { key: CategorieFamille; label: string; icon: string; gradient: string; ring: string }[] = [
  { key: 'COPIEUR', label: 'Copieur', icon: '🖨️', gradient: 'from-pink-500 to-rose-500', ring: 'ring-pink-500/20' },
  { key: 'TELEPHONIE', label: 'Téléphonie', icon: '📞', gradient: 'from-blue-500 to-cyan-500', ring: 'ring-blue-500/20' },
  { key: 'INFORMATIQUE', label: 'Informatique', icon: '💻', gradient: 'from-emerald-500 to-teal-500', ring: 'ring-emerald-500/20' },
  { key: 'SECURITE', label: 'Sécurité', icon: '🔒', gradient: 'from-orange-500 to-amber-500', ring: 'ring-orange-500/20' },
];

const TAUX_TVA = [{ label: '20%', value: 20 }, { label: '10%', value: 10 }, { label: '5,5%', value: 5.5 }, { label: '0%', value: 0 }];
const TYPE_LIGNE_OPTIONS = ['FIXE', 'MOBILE', 'FIBRE', 'ADSL', 'SDSL', 'SIP', 'TRUNK', 'AUTRE'];

const CAT_BADGE: Record<string, string> = {
  COPIEUR: 'bg-gradient-to-r from-pink-500 to-rose-500',
  TELEPHONIE: 'bg-gradient-to-r from-blue-500 to-cyan-500',
  INFORMATIQUE: 'bg-gradient-to-r from-emerald-500 to-teal-500',
  SECURITE: 'bg-gradient-to-r from-orange-500 to-amber-500',
};

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-medium shadow-2xl backdrop-blur-sm ${type === 'success' ? 'bg-emerald-600/95 text-white shadow-emerald-500/30' : 'bg-red-600/95 text-white shadow-red-500/30'}`}>
      <span className="h-5 w-5 shrink-0">
        {type === 'success' ? (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
        ) : (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
        )}
      </span>
      {message}
      <button onClick={onClose} className="ml-2 hover:opacity-70 cursor-pointer">&times;</button>
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/80 to-white">
      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-slate-100 to-gray-200 flex items-center justify-center text-gray-500 shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
        {subtitle && <p className="text-[11px] text-gray-400">{subtitle}</p>}
      </div>
    </div>
  );
}

interface Props { produitId?: number }

interface FormState {
  reference: string; designation: string; description: string;
  categorie: CategorieFamille | ''; unite: string; prix_unitaire_ht: string; taux_tva: number;
  type_document: 'MARCHANDISE' | 'PRESTATION';
  fournisseur_id: string; marque_id: string; famille_id: string; modele: string;
  reference_fournisseur: string; code_barre: string;
  contribution_environnement: string; frais_divers: string;
  prix_achat: string; prix_vendeur: string; prix_public: string; marge_pourcentage: string;
  quantite_stock: string; alerte_stock_mini: string; quantite_reapprovisionnement: string;
  hors_catalogue: boolean;
}

const EMPTY_FORM: FormState = {
  reference: '', designation: '', description: '', categorie: '',
  unite: 'unité', prix_unitaire_ht: '', taux_tva: 20, type_document: 'MARCHANDISE',
  fournisseur_id: '', marque_id: '', famille_id: '', modele: '',
  reference_fournisseur: '', code_barre: '',
  contribution_environnement: '0', frais_divers: '0',
  prix_achat: '', prix_vendeur: '', prix_public: '', marge_pourcentage: '',
  quantite_stock: '0', alerte_stock_mini: '0', quantite_reapprovisionnement: '0',
  hors_catalogue: false,
};

export default function FicheProduit({ produitId }: Props) {
  const router = useRouter();
  const isEdit = !!produitId;
  const barcodeRef = useRef<SVGSVGElement>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [details, setDetails] = useState<Record<string, unknown>>({});
  const [comptabilite, setComptabilite] = useState<ProduitComptabilite>({ compte_vente: null, compte_achat: null, code_analytique: null, centre_cout: null });
  const [tarifsClients, setTarifsClients] = useState<TarifClient[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [marques, setMarques] = useState<Marque[]>([]);
  const [familles, setFamilles] = useState<FamilleProduit[]>([]);
  const [unites, setUnites] = useState<Unite[]>([]);
  const [clients, setClients] = useState<{ id: number; numero_client: string; raison_sociale: string }[]>([]);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [adjacentIds, setAdjacentIds] = useState<{ prev_id: number | null; next_id: number | null }>({ prev_id: null, next_id: null });

  const [infoTab, setInfoTab] = useState<'information' | 'details'>('information');
  const [rightTab, setRightTab] = useState<'tarifs' | 'comptabilite' | 'avenir'>('tarifs');

  const [tarifForm, setTarifForm] = useState({ client_id: '', prix_vente: '', taux_tva: 20, notes: '' });
  const [editingTarifId, setEditingTarifId] = useState<number | null>(null);

  const prixRevient = useMemo(() => {
    const pa = parseFloat(form.prix_achat) || 0;
    const ce = parseFloat(form.contribution_environnement) || 0;
    const fd = parseFloat(form.frais_divers) || 0;
    return +(pa + ce + fd).toFixed(2);
  }, [form.prix_achat, form.contribution_environnement, form.frais_divers]);

  const fetchRefs = useCallback(async () => {
    const [fRes, mRes, famRes, uRes, cRes] = await Promise.allSettled([
      api.get<PaginatedResponse<Fournisseur>>('/fournisseurs?limit=500&actif=true'),
      api.get<ApiResponse<Marque[]>>('/marques?actif=true'),
      api.get<ApiResponse<FamilleProduit[]>>('/referentiel/familles?actif=true'),
      api.get<ApiResponse<Unite[]>>('/referentiel/unites'),
      api.get<PaginatedResponse<{ id: number; numero_client: string; raison_sociale: string }>>('/clients?limit=500&statut=ACTIF'),
    ]);
    if (fRes.status === 'fulfilled') setFournisseurs(fRes.value.data);
    if (mRes.status === 'fulfilled') setMarques(mRes.value.data);
    if (famRes.status === 'fulfilled') setFamilles(famRes.value.data);
    if (uRes.status === 'fulfilled') setUnites(uRes.value.data);
    if (cRes.status === 'fulfilled') setClients(cRes.value.data);
  }, []);

  const fetchProduit = useCallback(async () => {
    if (!produitId) return;
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<CatalogueProduit>>(`/catalogue/${produitId}`);
      const p = res.data;
      setForm({
        reference: p.reference || '', designation: p.designation || '', description: p.description || '',
        categorie: (p.categorie as CategorieFamille) || '', unite: p.unite || 'unité',
        prix_unitaire_ht: p.prix_unitaire_ht ? String(p.prix_unitaire_ht) : '', taux_tva: p.taux_tva ?? 20,
        type_document: p.type_document || 'MARCHANDISE',
        fournisseur_id: p.fournisseur_id ? String(p.fournisseur_id) : '',
        marque_id: p.marque_id ? String(p.marque_id) : '',
        famille_id: p.famille_id ? String(p.famille_id) : '',
        modele: p.modele || '', reference_fournisseur: p.reference_fournisseur || '',
        code_barre: p.code_barre || '',
        contribution_environnement: String(p.contribution_environnement ?? 0),
        frais_divers: String(p.frais_divers ?? 0),
        prix_achat: p.prix_achat != null ? String(p.prix_achat) : '',
        prix_vendeur: p.prix_vendeur != null ? String(p.prix_vendeur) : '',
        prix_public: p.prix_public != null ? String(p.prix_public) : '',
        marge_pourcentage: p.marge_pourcentage != null ? String(p.marge_pourcentage) : '',
        quantite_stock: String(p.quantite_stock ?? 0),
        alerte_stock_mini: String(p.alerte_stock_mini ?? 0),
        quantite_reapprovisionnement: String(p.quantite_reapprovisionnement ?? 0),
        hors_catalogue: p.hors_catalogue ?? false,
      });
      if (p.details) setDetails(p.details);
      if (p.comptabilite) setComptabilite(p.comptabilite);
      if (p.tarifs_clients) setTarifsClients(p.tarifs_clients);
      setImageUrl(p.image_url);
      try {
        const adj = await api.get<ApiResponse<{ prev_id: number | null; next_id: number | null }>>(`/catalogue/${produitId}/adjacent`);
        setAdjacentIds(adj.data);
      } catch { /* ignore */ }
    } catch { setToast({ message: 'Produit non trouvé', type: 'error' }); }
    finally { setLoading(false); }
  }, [produitId]);

  useEffect(() => { fetchRefs(); }, [fetchRefs]);
  useEffect(() => { fetchProduit(); }, [fetchProduit]);

  useEffect(() => {
    if (barcodeRef.current && form.code_barre.trim()) {
      try { JsBarcode(barcodeRef.current, form.code_barre.trim(), { format: 'CODE128', width: 1.5, height: 50, displayValue: true, fontSize: 12, margin: 5 }); } catch { /* invalid */ }
    }
  }, [form.code_barre]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const updateForm = (field: keyof FormState, value: unknown) => { setForm(f => ({ ...f, [field]: value })); setDirty(true); };
  const updateDetail = (field: string, value: unknown) => { setDetails(d => ({ ...d, [field]: value })); setDirty(true); };
  const updateCompta = (field: keyof ProduitComptabilite, value: string) => { setComptabilite(c => ({ ...c, [field]: value || null })); setDirty(true); };

  const handleMargeChange = (val: string) => {
    updateForm('marge_pourcentage', val);
    const marge = parseFloat(val);
    if (!isNaN(marge) && prixRevient > 0) updateForm('prix_public', (prixRevient * (1 + marge / 100)).toFixed(2));
  };
  const handlePrixPublicChange = (val: string) => {
    updateForm('prix_public', val);
    const pp = parseFloat(val);
    if (!isNaN(pp) && prixRevient > 0) updateForm('marge_pourcentage', (((pp - prixRevient) / prixRevient) * 100).toFixed(2));
  };

  const handleSave = async () => {
    if (!form.reference.trim() || !form.designation.trim()) { setToast({ message: 'La référence et la désignation sont obligatoires', type: 'error' }); return; }
    setSaving(true);
    try {
      const body = {
        reference: form.reference.trim(), designation: form.designation.trim(),
        description: form.description.trim() || null, categorie: form.categorie || null,
        unite: form.unite.trim() || 'unité', prix_unitaire_ht: form.prix_unitaire_ht ? Number(form.prix_unitaire_ht) : 0,
        taux_tva: form.taux_tva, type_document: form.type_document,
        fournisseur_id: form.fournisseur_id ? Number(form.fournisseur_id) : null,
        marque_id: form.marque_id ? Number(form.marque_id) : null,
        famille_id: form.famille_id ? Number(form.famille_id) : null,
        modele: form.modele.trim() || null, reference_fournisseur: form.reference_fournisseur.trim() || null,
        code_barre: form.code_barre.trim() || null,
        contribution_environnement: Number(form.contribution_environnement) || 0,
        frais_divers: Number(form.frais_divers) || 0,
        prix_achat: form.prix_achat ? Number(form.prix_achat) : null,
        prix_vendeur: form.prix_vendeur ? Number(form.prix_vendeur) : null,
        prix_public: form.prix_public ? Number(form.prix_public) : null,
        marge_pourcentage: form.marge_pourcentage ? Number(form.marge_pourcentage) : null,
        quantite_stock: Number(form.quantite_stock) || 0,
        alerte_stock_mini: Number(form.alerte_stock_mini) || 0,
        quantite_reapprovisionnement: Number(form.quantite_reapprovisionnement) || 0,
        hors_catalogue: form.hors_catalogue,
        details: form.categorie ? details : undefined, comptabilite,
      };
      if (isEdit) {
        await api.put<ApiResponse<CatalogueProduit>>(`/catalogue/${produitId}`, body);
        setToast({ message: 'Produit mis à jour', type: 'success' }); setDirty(false); fetchProduit();
      } else {
        const res = await api.post<ApiResponse<CatalogueProduit>>('/catalogue', body);
        setToast({ message: 'Produit créé', type: 'success' }); setDirty(false);
        router.push(`/dashboard/catalogue/${res.data.id}`);
      }
    } catch (err) { setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' }); }
    finally { setSaving(false); }
  };

  const handleDuplicate = async () => {
    if (!produitId) return;
    try {
      const res = await api.post<ApiResponse<CatalogueProduit>>(`/catalogue/${produitId}/duplicate`, {});
      setToast({ message: 'Produit dupliqué', type: 'success' });
      router.push(`/dashboard/catalogue/${res.data.id}`);
    } catch (err) { setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' }); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !produitId) return;
    const fd = new FormData(); fd.append('image', e.target.files[0]);
    try {
      const res = await api.upload<ApiResponse<{ image_url: string }>>(`/catalogue/${produitId}/image`, fd);
      setImageUrl(res.data.image_url); setToast({ message: 'Image uploadée', type: 'success' });
    } catch (err) { setToast({ message: err instanceof Error ? err.message : 'Erreur upload', type: 'error' }); }
  };
  const handleImageDelete = async () => {
    if (!produitId) return;
    try { await api.delete(`/catalogue/${produitId}/image`); setImageUrl(null); setToast({ message: 'Image supprimée', type: 'success' }); }
    catch (err) { setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' }); }
  };

  const handleAddTarif = async () => {
    if (!produitId || !tarifForm.client_id || !tarifForm.prix_vente) return;
    try {
      if (editingTarifId) {
        await api.put(`/catalogue/${produitId}/tarifs-clients/${editingTarifId}`, { prix_vente: Number(tarifForm.prix_vente), taux_tva: tarifForm.taux_tva, notes: tarifForm.notes || null });
        setToast({ message: 'Tarif mis à jour', type: 'success' });
      } else {
        await api.post(`/catalogue/${produitId}/tarifs-clients`, { client_id: Number(tarifForm.client_id), prix_vente: Number(tarifForm.prix_vente), taux_tva: tarifForm.taux_tva, notes: tarifForm.notes || null });
        setToast({ message: 'Tarif ajouté', type: 'success' });
      }
      setTarifForm({ client_id: '', prix_vente: '', taux_tva: 20, notes: '' }); setEditingTarifId(null);
      const res = await api.get<ApiResponse<TarifClient[]>>(`/catalogue/${produitId}/tarifs-clients`);
      setTarifsClients(res.data);
    } catch (err) { setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' }); }
  };
  const handleDeleteTarif = async (tid: number) => {
    if (!produitId) return;
    try { await api.delete(`/catalogue/${produitId}/tarifs-clients/${tid}`); setTarifsClients(t => t.filter(x => x.id !== tid)); }
    catch (err) { setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' }); }
  };
  const editTarif = (t: TarifClient) => {
    setTarifForm({ client_id: String(t.client_id), prix_vente: String(t.prix_vente), taux_tva: t.taux_tva, notes: t.notes || '' });
    setEditingTarifId(t.id);
  };

  const ic = 'w-full rounded-xl border border-gray-200/80 bg-white py-2.5 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200 hover:border-gray-300';
  const icSelect = `${ic} cursor-pointer appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10`;
  const icDisabled = 'w-full rounded-xl border border-gray-200/80 bg-gray-50 py-2.5 px-4 text-sm text-gray-500 outline-none cursor-not-allowed';
  const isMarchandise = form.type_document === 'MARCHANDISE';

  const formatPrice = (v: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin h-10 w-10 border-[3px] border-blue-600 border-t-transparent rounded-full" />
        <p className="text-sm text-gray-400 font-medium">Chargement du produit...</p>
      </div>
    </div>
  );

  const renderField = (label: string, children: React.ReactNode, required?: boolean) => (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );

  const renderDetailFields = () => {
    if (!form.categorie) return <div className="flex flex-col items-center justify-center py-12 text-gray-400"><svg className="h-12 w-12 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg><p className="text-sm font-medium">Sélectionnez une catégorie</p><p className="text-xs mt-1">Les champs spécifiques apparaîtront ici</p></div>;
    const fields: { label: string; key: string; type?: string; span?: number; options?: string[] }[] =
      form.categorie === 'COPIEUR' ? [
        { label: 'Cartouche', key: 'cartouche' }, { label: 'Consommation', key: 'consommation' },
        { label: 'Interface', key: 'interface' }, { label: 'Dimensions (L x H x P)', key: 'dimensions', span: 2 },
        { label: 'Conditionnement', key: 'conditionnement', span: 2 },
        { label: 'Poids (kg)', key: 'poids', type: 'number' }, { label: 'Résolution', key: 'resolution' },
        { label: 'Nb pages/mois', key: 'nb_pages', type: 'number' }, { label: 'Largeur impression', key: 'largeur_impression' },
      ] : form.categorie === 'TELEPHONIE' ? [
        { label: 'Opérateur', key: 'operateur' }, { label: 'Type de ligne', key: 'type_ligne', options: TYPE_LIGNE_OPTIONS },
        { label: 'Débit download', key: 'debit_download' }, { label: 'Débit upload', key: 'debit_upload' },
        { label: 'Engagement (mois)', key: 'engagement_mois', type: 'number' }, { label: 'Nombre de lignes', key: 'nombre_lignes', type: 'number' },
        { label: 'Nombre de postes', key: 'nombre_postes', type: 'number' }, { label: 'Data mobile', key: 'data_mobile' },
        { label: 'Appels inclus', key: 'inclus_appels', span: 2 },
        { label: 'Protocole', key: 'protocole' }, { label: 'Codec', key: 'codec' },
      ] : form.categorie === 'INFORMATIQUE' ? [
        { label: 'Type de matériel', key: 'type_materiel', span: 2 },
        { label: 'Processeur', key: 'processeur' }, { label: 'Mémoire RAM', key: 'memoire_ram' },
        { label: 'Stockage', key: 'stockage' }, { label: 'Système d\'exploitation', key: 'systeme_exploitation' },
        { label: 'Garantie (mois)', key: 'garantie_mois', type: 'number' }, { label: 'Type de licence', key: 'licence_type' },
        { label: 'Nb utilisateurs', key: 'nombre_utilisateurs', type: 'number' },
      ] : [
        { label: 'Type d\'équipement', key: 'type_equipement', span: 2 },
        { label: 'Résolution caméra', key: 'resolution_camera' }, { label: 'Angle de vue', key: 'angle_vue' },
        { label: 'IP Rating', key: 'ip_rating' }, { label: 'Stockage (jours)', key: 'stockage_jours', type: 'number' },
        { label: 'Protocole', key: 'protocole' },
      ];
    return (
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {fields.map(f => (
          <div key={f.key} className={f.span === 2 ? 'col-span-2' : ''}>
            {renderField(f.label, f.options ? (
              <select value={(details[f.key] as string) || ''} onChange={e => updateDetail(f.key, e.target.value)} className={icSelect}>
                <option value="">Sélectionner</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type={f.type || 'text'} step={f.type === 'number' ? '0.01' : undefined} value={(details[f.key] as string) || ''} onChange={e => updateDetail(f.key, e.target.value)} className={ic} />
            ))}
          </div>
        ))}
        {form.categorie === 'SECURITE' && (
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Vision nocturne</label>
            <label className="inline-flex items-center gap-2.5 mt-1 cursor-pointer select-none">
              <div className={`relative h-6 w-11 rounded-full transition-colors ${details.vision_nocturne ? 'bg-blue-600' : 'bg-gray-200'}`} onClick={() => updateDetail('vision_nocturne', !details.vision_nocturne)}>
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${details.vision_nocturne ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-gray-700">{details.vision_nocturne ? 'Oui' : 'Non'}</span>
            </label>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* ═══ HEADER ═══ */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => { if (dirty && !confirm('Quitter sans sauvegarder ?')) return; router.push('/dashboard/catalogue'); }}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition cursor-pointer group">
            <svg className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
            Retour au catalogue
          </button>
          {dirty && <span className="ml-2 text-[10px] font-semibold text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">Modifications non sauvegardées</span>}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg ${form.categorie ? `bg-gradient-to-br ${CAT_BADGE[form.categorie]} shadow-current/20` : 'bg-gradient-to-br from-violet-500 to-purple-600 shadow-violet-500/20'}`}>
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
              </div>
              <div>
                {isEdit ? (
                  <>
                    <div className="flex items-center gap-2.5">
                      <h1 className="text-lg font-bold text-gray-900">{form.designation || 'Sans nom'}</h1>
                      {form.categorie && <span className={`rounded-lg px-2.5 py-0.5 text-[10px] font-bold text-white ${CAT_BADGE[form.categorie]}`}>{form.categorie}</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{form.reference}</p>
                  </>
                ) : (
                  <>
                    <h1 className="text-lg font-bold text-gray-900">Nouveau produit/service</h1>
                    <p className="text-xs text-gray-400 mt-0.5">Remplissez les informations ci-dessous</p>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isEdit && adjacentIds.prev_id && (
                <button onClick={() => router.push(`/dashboard/catalogue/${adjacentIds.prev_id}`)} className="h-9 w-9 rounded-xl border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center transition cursor-pointer" title="Précédent">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                </button>
              )}
              {isEdit && adjacentIds.next_id && (
                <button onClick={() => router.push(`/dashboard/catalogue/${adjacentIds.next_id}`)} className="h-9 w-9 rounded-xl border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center transition cursor-pointer" title="Suivant">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                </button>
              )}
              {isEdit && <div className="h-6 w-px bg-gray-200 mx-1" />}
              {isEdit && (
                <button onClick={handleDuplicate} className="h-9 rounded-xl border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition cursor-pointer flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.5a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" /></svg>
                  Dupliquer
                </button>
              )}
              {!isEdit && (
                <button onClick={() => router.push('/dashboard/catalogue/nouveau')} className="h-9 rounded-xl border border-gray-200 bg-white px-3.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition cursor-pointer">Nouveau</button>
              )}
              <button onClick={handleSave} disabled={saving}
                className="h-9 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-xs font-bold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 cursor-pointer">
                {saving ? <><div className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Enregistrement...</> : (
                  <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Enregistrer</>
                )}
              </button>
            </div>
          </div>

          {/* Type + Catégorie bar */}
          <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-gray-200/80 shadow-sm">
              {(['MARCHANDISE', 'PRESTATION'] as const).map(t => (
                <button key={t} onClick={() => updateForm('type_document', t)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${form.type_document === t ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
                  {t === 'MARCHANDISE' ? 'Marchandise' : 'Prestation'}
                </button>
              ))}
            </div>
            <div className="h-6 w-px bg-gray-200 hidden sm:block" />
            <div className="flex items-center gap-2 flex-wrap">
              {CATEGORIES.map(cat => (
                <button key={cat.key} onClick={() => updateForm('categorie', form.categorie === cat.key ? '' : cat.key)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${form.categorie === cat.key ? `bg-gradient-to-r ${cat.gradient} text-white shadow-lg ${cat.ring} ring-4` : 'bg-white border border-gray-200/80 text-gray-500 hover:border-gray-300 hover:text-gray-700 shadow-sm'}`}>
                  <span className="text-sm">{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        {/* LEFT COLUMN */}
        <div className="xl:col-span-7 space-y-6">

          {/* Identification */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <SectionHeader
              icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>}
              title="Identification" subtitle="Références et désignation du produit"
            />
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {renderField('Référence interne', <input value={form.reference} onChange={e => updateForm('reference', e.target.value)} placeholder="Ex: PROD-001" className={ic} />, true)}
                {renderField('Référence fournisseur', <input value={form.reference_fournisseur} onChange={e => updateForm('reference_fournisseur', e.target.value)} placeholder="Réf. fournisseur" className={ic} />)}
              </div>
              {renderField('Désignation', <textarea value={form.designation} onChange={e => updateForm('designation', e.target.value)} rows={2} placeholder="Nom du produit ou service" className={`${ic} resize-none`} />, true)}
              {renderField('Description détaillée', <textarea value={form.description} onChange={e => updateForm('description', e.target.value)} rows={3} placeholder="Description complète du produit..." className={`${ic} resize-none`} />)}
            </div>

            <div className="px-6 pb-6 flex items-start gap-5 border-t border-gray-100 pt-5">
              <div className="shrink-0">
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Image</label>
                <div className="relative h-[100px] w-[100px] rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 flex items-center justify-center overflow-hidden group hover:border-blue-300 transition-colors">
                  {imageUrl ? (
                    <>
                      <img src={imageUrl.startsWith('/') ? `${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}${imageUrl}` : imageUrl} alt="" className="h-full w-full object-cover" />
                      {isEdit && <button onClick={handleImageDelete} className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer text-xs font-bold">Supprimer</button>}
                    </>
                  ) : (
                    <label className="flex flex-col items-center gap-1 cursor-pointer text-gray-400 hover:text-blue-500 transition p-2 text-center">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
                      <span className="text-[9px] font-medium leading-tight">{isEdit ? 'Ajouter une image' : 'Sauvegarder d\'abord'}</span>
                      {isEdit && <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />}
                    </label>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {renderField('Code barre', <input value={form.code_barre} onChange={e => updateForm('code_barre', e.target.value)} placeholder="EAN13, CODE128..." className={ic} />)}
                {form.code_barre.trim() && (
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex justify-center">
                    <svg ref={barcodeRef} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Informations / Détails */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex border-b border-gray-100">
              {([
                { key: 'information' as const, label: 'Informations', icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg> },
                { key: 'details' as const, label: form.categorie ? `Détails ${form.categorie.charAt(0) + form.categorie.slice(1).toLowerCase()}` : 'Détails catégorie', icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" /></svg> },
              ]).map(tab => (
                <button key={tab.key} onClick={() => setInfoTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-xs font-bold uppercase tracking-wider transition cursor-pointer border-b-2 ${infoTab === tab.key ? 'text-blue-600 border-blue-600 bg-blue-50/30' : 'text-gray-400 border-transparent hover:text-gray-600 hover:bg-gray-50/50'}`}>
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {infoTab === 'information' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Famille', <select value={form.famille_id} onChange={e => updateForm('famille_id', e.target.value)} className={icSelect}><option value="">Sélectionner une famille</option>{familles.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}</select>)}
                    {renderField('Fournisseur', <select value={form.fournisseur_id} onChange={e => updateForm('fournisseur_id', e.target.value)} className={icSelect}><option value="">Sélectionner un fournisseur</option>{fournisseurs.map(f => <option key={f.id} value={f.id}>{f.nom}</option>)}</select>)}
                    {renderField('Unité', <select value={form.unite} onChange={e => updateForm('unite', e.target.value)} className={icSelect}>{unites.map(u => <option key={u.id} value={u.nom}>{u.nom}</option>)}<option value="unité">unité</option></select>)}
                    {renderField('Marque', <select value={form.marque_id} onChange={e => updateForm('marque_id', e.target.value)} className={icSelect}><option value="">Sélectionner une marque</option>{marques.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}</select>)}
                    <div className="col-span-2">{renderField('Modèle', <input value={form.modele} onChange={e => updateForm('modele', e.target.value)} placeholder="Modèle du produit" className={ic} />)}</div>
                  </div>

                  <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${form.hors_catalogue ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50/50 hover:bg-gray-50'}`}>
                    <input type="checkbox" checked={form.hors_catalogue} onChange={e => updateForm('hors_catalogue', e.target.checked)} className="rounded border-gray-300 text-red-500 focus:ring-red-500/20" />
                    <div><span className={`text-sm font-semibold ${form.hors_catalogue ? 'text-red-600' : 'text-gray-600'}`}>Ce produit n&apos;est plus au catalogue</span><p className="text-[11px] text-gray-400">Il ne sera plus proposé dans les devis</p></div>
                  </label>

                  {/* Prix Achat */}
                  {isMarchandise && (
                    <div className="rounded-xl border border-gray-200/80 overflow-hidden">
                      <div className="px-4 py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100/80 flex items-center gap-2">
                        <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>
                        <span className="text-xs font-bold text-amber-700">Valeur d&apos;achat</span>
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-4">
                        {renderField('Contribution env. (€)', <input type="number" step="0.01" value={form.contribution_environnement} onChange={e => updateForm('contribution_environnement', e.target.value)} className={ic} />)}
                        {renderField('Frais divers (€)', <input type="number" step="0.01" value={form.frais_divers} onChange={e => updateForm('frais_divers', e.target.value)} className={ic} />)}
                        {renderField('Prix achat (€)', <input type="number" step="0.01" value={form.prix_achat} onChange={e => updateForm('prix_achat', e.target.value)} placeholder="0,00" className={ic} />)}
                        {renderField('Prix de revient (€)', <div className="flex items-center gap-2"><input type="text" value={formatPrice(prixRevient)} readOnly className={icDisabled} /><span className="text-[10px] text-gray-400 shrink-0">Auto</span></div>)}
                        <div className="col-span-2">{renderField('Prix vendeur (€)', <input type="number" step="0.01" value={form.prix_vendeur} onChange={e => updateForm('prix_vendeur', e.target.value)} placeholder="0,00" className={ic} />)}</div>
                      </div>
                    </div>
                  )}

                  {/* Prix Vente */}
                  <div className="rounded-xl border border-gray-200/80 overflow-hidden">
                    <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100/80 flex items-center gap-2">
                      <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      <span className="text-xs font-bold text-emerald-700">Valeur de vente</span>
                    </div>
                    <div className="p-4 grid grid-cols-2 gap-4">
                      {renderField('Prix de vente HT (€)', <input type="number" step="0.01" value={form.prix_unitaire_ht} onChange={e => updateForm('prix_unitaire_ht', e.target.value)} placeholder="0,00" className={ic} />)}
                      {renderField('Marge (%)', <input type="number" step="0.01" value={form.marge_pourcentage} onChange={e => handleMargeChange(e.target.value)} placeholder="%" className={ic} />)}
                      {renderField('Prix public (€)', <input type="number" step="0.01" value={form.prix_public} onChange={e => handlePrixPublicChange(e.target.value)} placeholder="Auto si marge" className={ic} />)}
                      {renderField('TVA', <select value={form.taux_tva} onChange={e => updateForm('taux_tva', Number(e.target.value))} className={icSelect}>{TAUX_TVA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>)}
                    </div>
                  </div>

                  {/* Stock */}
                  {isMarchandise && (
                    <div className="rounded-xl border border-gray-200/80 overflow-hidden">
                      <div className="px-4 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100/80 flex items-center gap-2">
                        <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>
                        <span className="text-xs font-bold text-blue-700">Stock</span>
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-4">
                        {renderField('Alerte stock mini', <input type="number" value={form.alerte_stock_mini} onChange={e => updateForm('alerte_stock_mini', e.target.value)} className={ic} />)}
                        {renderField('Qté réapprovisionnement', <input type="number" value={form.quantite_reapprovisionnement} onChange={e => updateForm('quantite_reapprovisionnement', e.target.value)} className={ic} />)}
                      </div>
                    </div>
                  )}
                </div>
              ) : renderDetailFields()}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="xl:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden xl:sticky xl:top-24">
            <div className="flex border-b border-gray-100">
              {([
                { key: 'tarifs' as const, label: 'Tarifs', icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /></svg> },
                { key: 'comptabilite' as const, label: 'Comptabilité', icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5ZM8.25 6h7.5v2.25h-7.5V6ZM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0 0 12 2.25Z" /></svg> },
                { key: 'avenir' as const, label: 'À venir', icon: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg> },
              ]).map(tab => (
                <button key={tab.key} onClick={() => setRightTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-3.5 text-[11px] font-bold uppercase tracking-wider transition cursor-pointer border-b-2 ${rightTab === tab.key ? 'text-blue-600 border-blue-600 bg-blue-50/30' : 'text-gray-400 border-transparent hover:text-gray-600'}`}>
                  {tab.icon}{tab.label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {rightTab === 'tarifs' ? (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-bold text-gray-800">Tarifs spéciaux par client</h4>
                    {tarifsClients.length > 0 && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{tarifsClients.length}</span>}
                  </div>
                  <p className="text-[11px] text-gray-400 mb-4">Ces tarifs remplacent le prix standard</p>

                  {!isEdit ? (
                    <div className="flex flex-col items-center py-8 text-gray-400">
                      <svg className="h-10 w-10 mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                      <p className="text-xs font-medium">Sauvegardez d&apos;abord</p>
                    </div>
                  ) : (
                    <>
                      {tarifsClients.length === 0 ? (
                        <div className="text-center py-5 border border-dashed border-gray-200 rounded-xl mb-4 bg-gray-50/30">
                          <p className="text-xs text-gray-400">Aucun tarif spécial configuré</p>
                        </div>
                      ) : (
                        <div className="border border-gray-100 rounded-xl overflow-hidden mb-4">
                          <table className="w-full text-sm">
                            <thead><tr className="bg-gray-50/80">
                              <th className="px-3 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Client</th>
                              <th className="px-3 py-2.5 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Prix</th>
                              <th className="px-3 py-2.5 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">TVA</th>
                              <th className="px-3 py-2.5 w-8"></th>
                            </tr></thead>
                            <tbody className="divide-y divide-gray-50">
                              {tarifsClients.map(t => (
                                <tr key={t.id} onClick={() => editTarif(t)} className="hover:bg-blue-50/30 cursor-pointer transition-colors">
                                  <td className="px-3 py-2.5"><span className="text-[10px] font-mono text-gray-400">{t.numero_client}</span><span className="ml-1.5 text-xs font-medium text-gray-700">{t.client_nom}</span></td>
                                  <td className="px-3 py-2.5 text-right text-xs font-bold text-gray-900">{formatPrice(t.prix_vente)}</td>
                                  <td className="px-3 py-2.5 text-center text-xs text-gray-500">{t.taux_tva}%</td>
                                  <td className="px-3 py-2.5">
                                    <button onClick={e => { e.stopPropagation(); handleDeleteTarif(t.id); }} className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition cursor-pointer">
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <div className="space-y-3 border-t border-gray-100 pt-4">
                        <select value={tarifForm.client_id} onChange={e => setTarifForm(f => ({ ...f, client_id: e.target.value }))} className={icSelect}>
                          <option value="">Sélectionner un client</option>
                          {clients.map(c => <option key={c.id} value={c.id}>{c.numero_client} — {c.raison_sociale}</option>)}
                        </select>
                        <div className="grid grid-cols-2 gap-3">
                          <input type="number" step="0.01" placeholder="Prix vente (€)" value={tarifForm.prix_vente} onChange={e => setTarifForm(f => ({ ...f, prix_vente: e.target.value }))} className={ic} />
                          <select value={tarifForm.taux_tva} onChange={e => setTarifForm(f => ({ ...f, taux_tva: Number(e.target.value) }))} className={icSelect}>
                            {TAUX_TVA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleAddTarif} className="flex-1 h-9 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-bold text-white hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-500/20 transition cursor-pointer">
                            {editingTarifId ? 'Mettre à jour' : 'Ajouter'}
                          </button>
                          {editingTarifId && (
                            <button onClick={() => { setEditingTarifId(null); setTarifForm({ client_id: '', prix_vente: '', taux_tva: 20, notes: '' }); }}
                              className="h-9 rounded-xl border border-gray-200 px-4 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : rightTab === 'comptabilite' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-bold text-gray-800">Comptes comptables</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {renderField('Compte de vente', <input value={comptabilite.compte_vente || ''} onChange={e => updateCompta('compte_vente', e.target.value)} placeholder="706000" className={ic} />)}
                    {renderField('Compte d\'achat', <input value={comptabilite.compte_achat || ''} onChange={e => updateCompta('compte_achat', e.target.value)} placeholder="607000" className={ic} />)}
                    {renderField('Code analytique', <input value={comptabilite.code_analytique || ''} onChange={e => updateCompta('code_analytique', e.target.value)} className={ic} />)}
                    {renderField('Centre de coût', <input value={comptabilite.centre_cout || ''} onChange={e => updateCompta('centre_cout', e.target.value)} className={ic} />)}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center mb-3">
                    <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-500">Bientôt disponible</p>
                  <p className="text-xs text-gray-400 mt-1 text-center max-w-[200px]">Commande fournisseur et Bons de livraison dans une prochaine version</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
