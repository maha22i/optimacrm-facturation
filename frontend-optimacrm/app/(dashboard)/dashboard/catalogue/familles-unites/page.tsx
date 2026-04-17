'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { ApiResponse, FamilleProduit, CategorieFamille, Unite } from '@/lib/types';

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

const CATEGORIE_LABELS: Record<CategorieFamille, string> = {
  COPIEUR: 'Copieur', TELEPHONIE: 'Téléphonie', INFORMATIQUE: 'Informatique', SECURITE: 'Sécurité',
};

const CATEGORIE_COLORS: Record<CategorieFamille, string> = {
  COPIEUR: 'bg-blue-50 text-blue-700 border-blue-200',
  TELEPHONIE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  INFORMATIQUE: 'bg-violet-50 text-violet-700 border-violet-200',
  SECURITE: 'bg-amber-50 text-amber-700 border-amber-200',
};

const inputCls = 'w-full rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-blue-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition';
const labelCls = 'block text-sm font-semibold text-gray-700 mb-2';

export default function FamillesUnitesPage() {
  const [familles, setFamilles] = useState<FamilleProduit[]>([]);
  const [unites, setUnites] = useState<Unite[]>([]);
  const [loadingF, setLoadingF] = useState(true);
  const [loadingU, setLoadingU] = useState(true);
  const [familleModal, setFamilleModal] = useState(false);
  const [editingFamilleId, setEditingFamilleId] = useState<number | null>(null);
  const [savingF, setSavingF] = useState(false);
  const [familleForm, setFamilleForm] = useState({ nom: '', categorie: 'COPIEUR' as CategorieFamille, description: '' });
  const [newUnite, setNewUnite] = useState('');
  const [addingUnite, setAddingUnite] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (t: { message: string; type: 'success' | 'error' }) => setToast(t);

  const loadFamilles = useCallback(async () => {
    setLoadingF(true);
    try { const res = await api.get<ApiResponse<FamilleProduit[]>>('/referentiel/familles'); setFamilles(res.data); } catch { /* ignore */ } finally { setLoadingF(false); }
  }, []);

  const loadUnites = useCallback(async () => {
    setLoadingU(true);
    try { const res = await api.get<ApiResponse<Unite[]>>('/referentiel/unites'); setUnites(res.data); } catch { /* ignore */ } finally { setLoadingU(false); }
  }, []);

  useEffect(() => { loadFamilles(); loadUnites(); }, [loadFamilles, loadUnites]);

  const openCreateFamille = () => { setEditingFamilleId(null); setFamilleForm({ nom: '', categorie: 'COPIEUR', description: '' }); setFamilleModal(true); };
  const openEditFamille = (f: FamilleProduit) => { setEditingFamilleId(f.id); setFamilleForm({ nom: f.nom, categorie: f.categorie, description: f.description || '' }); setFamilleModal(true); };

  const handleSaveFamille = async () => {
    if (!familleForm.nom.trim()) { showToast({ message: 'Le nom est obligatoire', type: 'error' }); return; }
    setSavingF(true);
    try {
      if (editingFamilleId) {
        await api.put<ApiResponse<FamilleProduit>>(`/referentiel/familles/${editingFamilleId}`, familleForm);
        showToast({ message: 'Famille mise à jour', type: 'success' });
      } else {
        await api.post<ApiResponse<FamilleProduit>>('/referentiel/familles', familleForm);
        showToast({ message: 'Famille créée', type: 'success' });
      }
      setFamilleModal(false);
      loadFamilles();
    } catch (err) { showToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' }); } finally { setSavingF(false); }
  };

  const handleDeleteFamille = async (id: number) => {
    try { await api.delete<ApiResponse<null>>(`/referentiel/familles/${id}`); showToast({ message: 'Famille supprimée', type: 'success' }); loadFamilles(); }
    catch (err) { showToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' }); }
  };

  const handleAddUnite = async () => {
    if (!newUnite.trim()) return;
    setAddingUnite(true);
    try { await api.post<ApiResponse<Unite>>('/referentiel/unites', { nom: newUnite.trim() }); setNewUnite(''); showToast({ message: 'Unité ajoutée', type: 'success' }); loadUnites(); }
    catch (err) { showToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' }); } finally { setAddingUnite(false); }
  };

  const handleDeleteUnite = async (id: number) => {
    try { await api.delete<ApiResponse<null>>(`/referentiel/unites/${id}`); showToast({ message: 'Unité supprimée', type: 'success' }); loadUnites(); }
    catch (err) { showToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' }); }
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" /></svg>
          </span>
          Familles & Unités
        </h1>
        <p className="mt-1 text-sm text-gray-500 ml-[52px]">Catégories de produits et unités de mesure</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Familles */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" /></svg>
              </div>
              <h3 className="text-sm font-bold text-gray-900">Familles de produits</h3>
            </div>
            <button onClick={openCreateFamille} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition cursor-pointer">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Nouvelle famille
            </button>
          </div>
          {loadingF ? (
            <div className="py-12 flex justify-center"><div className="animate-spin h-6 w-6 border-[3px] border-violet-600 border-t-transparent rounded-full" /></div>
          ) : familles.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">Aucune famille</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Nom</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Catégorie</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Produits</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-gray-500 text-xs uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {familles.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-4 py-3 font-semibold text-gray-900">{f.nom}</td>
                      <td className="px-4 py-3"><span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-semibold ${CATEGORIE_COLORS[f.categorie]}`}>{CATEGORIE_LABELS[f.categorie]}</span></td>
                      <td className="px-4 py-3 text-center text-gray-500">{f.nb_produits}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEditFamille(f)} className="rounded-lg p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                          </button>
                          <button onClick={() => handleDeleteFamille(f.id)} className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
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

        {/* Unités */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5" /></svg>
            </div>
            <h3 className="text-sm font-bold text-gray-900">Unités</h3>
          </div>
          <div className="p-5">
            {loadingU ? (
              <div className="py-8 flex justify-center"><div className="animate-spin h-6 w-6 border-[3px] border-cyan-600 border-t-transparent rounded-full" /></div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-5">
                  {unites.map(u => (
                    <span key={u.id} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700">
                      {u.nom}
                      <span className="text-[10px] text-gray-400">({u.nb_produits})</span>
                      {u.nb_produits === 0 && (
                        <button onClick={() => handleDeleteUnite(u.id)} className="ml-0.5 rounded-full p-0.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </span>
                  ))}
                  {unites.length === 0 && <p className="text-sm text-gray-400">Aucune unité</p>}
                </div>
                <div className="flex gap-2">
                  <input value={newUnite} onChange={e => setNewUnite(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddUnite()} placeholder="Nouvelle unité..." className={`${inputCls} flex-1`} />
                  <button onClick={handleAddUnite} disabled={addingUnite || !newUnite.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-50 px-4 py-2.5 text-sm font-semibold text-cyan-700 hover:bg-cyan-100 transition cursor-pointer disabled:opacity-50">
                    {addingUnite ? <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" /> : <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>}
                    Ajouter
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Famille Modal */}
      {familleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setFamilleModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{editingFamilleId ? 'Modifier la famille' : 'Nouvelle famille'}</h3>
              <button onClick={() => setFamilleModal(false)} className="rounded-lg p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div><label className={labelCls}>Nom <span className="text-red-500">*</span></label><input value={familleForm.nom} onChange={e => setFamilleForm(f => ({ ...f, nom: e.target.value }))} placeholder="Ex: COPIEUR COULEUR" className={inputCls} /></div>
              <div>
                <label className={labelCls}>Catégorie <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select value={familleForm.categorie} onChange={e => setFamilleForm(f => ({ ...f, categorie: e.target.value as CategorieFamille }))} className={`${inputCls} appearance-none pr-10 cursor-pointer`}>
                    {Object.entries(CATEGORIE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                </div>
              </div>
              <div><label className={labelCls}>Description</label><input value={familleForm.description} onChange={e => setFamilleForm(f => ({ ...f, description: e.target.value }))} placeholder="Description optionnelle" className={inputCls} /></div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
              <button onClick={() => setFamilleModal(false)} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
              <button onClick={handleSaveFamille} disabled={savingF} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 cursor-pointer">
                {savingF ? <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Enregistrement...</> : <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Enregistrer</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
