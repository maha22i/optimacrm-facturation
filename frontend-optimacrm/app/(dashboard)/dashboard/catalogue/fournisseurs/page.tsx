'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { ApiResponse, PaginatedResponse, Fournisseur, TypeFournisseur } from '@/lib/types';

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-medium shadow-xl ${
      type === 'success' ? 'bg-emerald-600 text-white shadow-emerald-500/20' : 'bg-red-600 text-white shadow-red-500/20'
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

const TYPE_LABELS: Record<TypeFournisseur, string> = {
  FOURNISSEUR: 'Fournisseur',
  OPERATEUR_TELECOM: 'Opérateur Télécom',
  CONSTRUCTEUR: 'Constructeur',
  DISTRIBUTEUR: 'Distributeur',
  AUTRE: 'Autre',
};

const TYPE_COLORS: Record<TypeFournisseur, string> = {
  FOURNISSEUR: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OPERATEUR_TELECOM: 'bg-blue-50 text-blue-700 border-blue-200',
  CONSTRUCTEUR: 'bg-violet-50 text-violet-700 border-violet-200',
  DISTRIBUTEUR: 'bg-orange-50 text-orange-700 border-orange-200',
  AUTRE: 'bg-gray-50 text-gray-600 border-gray-200',
};

const EMPTY_FORM = {
  nom: '', code: '', type: 'FOURNISSEUR' as TypeFournisseur, site_web: '',
  contact_nom: '', contact_prenom: '', contact_email: '', contact_telephone: '',
  adresse_ligne1: '', adresse_ligne2: '', code_postal: '', ville: '', pays: 'France',
  numero_compte_client: '', conditions_paiement: '', delai_livraison_jours: '',
  notes: '',
};

const inputCls = 'w-full rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-blue-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition';
const labelCls = 'block text-sm font-semibold text-gray-700 mb-2';

export default function FournisseursPage() {
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterActif, setFilterActif] = useState('true');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterType) params.set('type', filterType);
      if (filterActif) params.set('actif', filterActif);
      params.set('limit', '100');
      const res = await api.get<PaginatedResponse<Fournisseur>>(`/fournisseurs?${params}`);
      setFournisseurs(res.data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search, filterType, filterActif]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditingId(null); setForm({ ...EMPTY_FORM }); setModalOpen(true); };

  const openEdit = (f: Fournisseur) => {
    setEditingId(f.id);
    setForm({
      nom: f.nom, code: f.code || '', type: f.type, site_web: f.site_web || '',
      contact_nom: f.contact_nom || '', contact_prenom: f.contact_prenom || '',
      contact_email: f.contact_email || '', contact_telephone: f.contact_telephone || '',
      adresse_ligne1: f.adresse_ligne1 || '', adresse_ligne2: f.adresse_ligne2 || '',
      code_postal: f.code_postal || '', ville: f.ville || '', pays: f.pays || 'France',
      numero_compte_client: f.numero_compte_client || '', conditions_paiement: f.conditions_paiement || '',
      delai_livraison_jours: f.delai_livraison_jours != null ? String(f.delai_livraison_jours) : '',
      notes: f.notes || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nom.trim()) { setToast({ message: 'Le nom est obligatoire', type: 'error' }); return; }
    setSaving(true);
    try {
      const body = { ...form, delai_livraison_jours: form.delai_livraison_jours ? parseInt(form.delai_livraison_jours) : null, code: form.code || null };
      if (editingId) {
        await api.put<ApiResponse<Fournisseur>>(`/fournisseurs/${editingId}`, body);
        setToast({ message: 'Fournisseur mis à jour', type: 'success' });
      } else {
        await api.post<ApiResponse<Fournisseur>>('/fournisseurs', body);
        setToast({ message: 'Fournisseur créé', type: 'success' });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    } finally { setSaving(false); }
  };

  const handleToggle = async (f: Fournisseur) => {
    try {
      if (f.actif) {
        await api.delete<ApiResponse<Fournisseur>>(`/fournisseurs/${f.id}`);
        setToast({ message: 'Fournisseur désactivé', type: 'success' });
      } else {
        await api.put<ApiResponse<Fournisseur>>(`/fournisseurs/${f.id}`, { actif: true });
        setToast({ message: 'Fournisseur réactivé', type: 'success' });
      }
      load();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    }
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-1.5a.75.75 0 0 0-.75.75v.375m-9-3.75h3.75m-3.75 0V14.25m0-4.5h9" /></svg>
            </span>
            Fournisseurs
          </h1>
          <p className="mt-1 text-sm text-gray-500 ml-[52px]">{fournisseurs.length} fournisseur{fournisseurs.length > 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all cursor-pointer">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Nouveau fournisseur
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom ou code..." className={`${inputCls} pl-10`} />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setFilterActif(filterActif === 'true' ? '' : 'true')} className={`rounded-lg px-3 py-2 text-xs font-semibold transition cursor-pointer ${filterActif === 'true' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'}`}>Actifs</button>
            <button onClick={() => setFilterActif(filterActif === 'false' ? '' : 'false')} className={`rounded-lg px-3 py-2 text-xs font-semibold transition cursor-pointer ${filterActif === 'false' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'}`}>Inactifs</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[{ value: '', label: 'Tous' }, ...Object.entries(TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))].map(t => (
            <button key={t.value} onClick={() => setFilterType(t.value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer border ${filterType === t.value ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center gap-3">
            <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
            <p className="text-sm text-gray-400">Chargement...</p>
          </div>
        ) : fournisseurs.length === 0 ? (
          <div className="py-20 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-1.5a.75.75 0 0 0-.75.75v.375m-9-3.75h3.75m-3.75 0V14.25m0-4.5h9" /></svg>
            <p className="mt-3 text-sm font-medium text-gray-500">Aucun fournisseur trouvé</p>
            <button onClick={openCreate} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition cursor-pointer">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Créer le premier fournisseur
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Code</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Nom</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Type</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Contact</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Téléphone</th>
                  <th className="text-left px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Ville</th>
                  <th className="text-center px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Actif</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fournisseurs.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-500">{f.code || '—'}</td>
                    <td className="px-5 py-3.5 font-semibold text-gray-900">{f.nom}</td>
                    <td className="px-5 py-3.5"><span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${TYPE_COLORS[f.type]}`}>{TYPE_LABELS[f.type]}</span></td>
                    <td className="px-5 py-3.5 text-gray-600">{[f.contact_prenom, f.contact_nom].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-600">{f.contact_telephone || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-600">{f.ville || '—'}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${f.actif ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${f.actif ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        {f.actif ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(f)} className="rounded-lg p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer" title="Modifier">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                        </button>
                        <button onClick={() => handleToggle(f)} className={`rounded-lg p-2 transition cursor-pointer ${f.actif ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'}`} title={f.actif ? 'Désactiver' : 'Réactiver'}>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h3>
              <button onClick={() => setModalOpen(false)} className="rounded-lg p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              {/* Identité */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="h-6 w-6 rounded-md bg-blue-50 flex items-center justify-center text-blue-600"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg></span>
                  Identité
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className={labelCls}>Nom <span className="text-red-500">*</span></label><input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Nom du fournisseur" className={inputCls} /></div>
                  <div><label className={labelCls}>Code fournisseur</label><input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="INNOV" className={`${inputCls} font-mono uppercase`} /></div>
                  <div>
                    <label className={labelCls}>Type</label>
                    <div className="relative">
                      <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as TypeFournisseur }))} className={`${inputCls} appearance-none pr-10 cursor-pointer`}>
                        {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                    </div>
                  </div>
                  <div><label className={labelCls}>Site web</label><input value={form.site_web} onChange={e => setForm(f => ({ ...f, site_web: e.target.value }))} placeholder="https://..." className={inputCls} /></div>
                </div>
              </div>
              {/* Contact */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="h-6 w-6 rounded-md bg-emerald-50 flex items-center justify-center text-emerald-600"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg></span>
                  Contact principal
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className={labelCls}>Nom</label><input value={form.contact_nom} onChange={e => setForm(f => ({ ...f, contact_nom: e.target.value }))} placeholder="Dupont" className={inputCls} /></div>
                  <div><label className={labelCls}>Prénom</label><input value={form.contact_prenom} onChange={e => setForm(f => ({ ...f, contact_prenom: e.target.value }))} placeholder="Jean" className={inputCls} /></div>
                  <div><label className={labelCls}>Email</label><input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="contact@fournisseur.fr" className={inputCls} /></div>
                  <div><label className={labelCls}>Téléphone</label><input value={form.contact_telephone} onChange={e => setForm(f => ({ ...f, contact_telephone: e.target.value }))} placeholder="01 23 45 67 89" className={inputCls} /></div>
                </div>
              </div>
              {/* Adresse */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="h-6 w-6 rounded-md bg-violet-50 flex items-center justify-center text-violet-600"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg></span>
                  Adresse
                </h4>
                <div className="space-y-4">
                  <div><label className={labelCls}>Adresse ligne 1</label><input value={form.adresse_ligne1} onChange={e => setForm(f => ({ ...f, adresse_ligne1: e.target.value }))} placeholder="123 rue de la Paix" className={inputCls} /></div>
                  <div><label className={labelCls}>Ligne 2</label><input value={form.adresse_ligne2} onChange={e => setForm(f => ({ ...f, adresse_ligne2: e.target.value }))} placeholder="Bâtiment A" className={inputCls} /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><label className={labelCls}>Code postal</label><input value={form.code_postal} onChange={e => setForm(f => ({ ...f, code_postal: e.target.value }))} placeholder="75001" className={inputCls} /></div>
                    <div><label className={labelCls}>Ville</label><input value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))} placeholder="Paris" className={inputCls} /></div>
                  </div>
                  <div><label className={labelCls}>Pays</label><input value={form.pays} onChange={e => setForm(f => ({ ...f, pays: e.target.value }))} placeholder="France" className={inputCls} /></div>
                </div>
              </div>
              {/* Conditions commerciales */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="h-6 w-6 rounded-md bg-amber-50 flex items-center justify-center text-amber-600"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg></span>
                  Conditions commerciales
                </h4>
                <div className="space-y-4">
                  <div><label className={labelCls}>Notre numéro de compte client</label><input value={form.numero_compte_client} onChange={e => setForm(f => ({ ...f, numero_compte_client: e.target.value }))} placeholder="CC-12345" className={inputCls} /></div>
                  <div><label className={labelCls}>Conditions de paiement</label><input value={form.conditions_paiement} onChange={e => setForm(f => ({ ...f, conditions_paiement: e.target.value }))} placeholder="30 jours fin de mois" className={inputCls} /></div>
                  <div><label className={labelCls}>Délai de livraison habituel (jours)</label><input type="number" min="0" value={form.delai_livraison_jours} onChange={e => setForm(f => ({ ...f, delai_livraison_jours: e.target.value }))} placeholder="5" className={inputCls} /></div>
                </div>
              </div>
              {/* Notes */}
              <div><label className={labelCls}>Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes internes..." rows={3} className={`${inputCls} resize-y`} /></div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setModalOpen(false)} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
              <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 cursor-pointer">
                {saving ? <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Enregistrement...</> : <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Enregistrer</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
