'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import type { ApiResponse, Marque } from '@/lib/types';

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

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const resolveLogo = (url: string) => (!url ? '' : url.startsWith('http') ? url : `${BACKEND_URL}${url}`);
const getInitials = (nom: string) => { const p = nom.split(/\s+/); return p.length > 1 ? `${p[0][0]}${p[1][0]}`.toUpperCase() : nom.substring(0, 2).toUpperCase(); };
const COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-orange-500'];
const getColor = (id: number) => COLORS[id % COLORS.length];

const inputCls = 'w-full rounded-xl border border-gray-200 focus:border-blue-400 focus:ring-blue-500/10 bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition';
const labelCls = 'block text-sm font-semibold text-gray-700 mb-2';

export default function MarquesPage() {
  const [marques, setMarques] = useState<Marque[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ nom: '', site_web: '', notes: '', actif: true });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<Marque[]>>('/marques');
      setMarques(res.data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditingId(null); setForm({ nom: '', site_web: '', notes: '', actif: true }); setModalOpen(true); };

  const openEdit = (m: Marque) => {
    setEditingId(m.id);
    setForm({ nom: m.nom, site_web: m.site_web || '', notes: m.notes || '', actif: m.actif });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nom.trim()) { setToast({ message: 'Le nom est obligatoire', type: 'error' }); return; }
    setSaving(true);
    try {
      if (editingId) {
        await api.put<ApiResponse<Marque>>(`/marques/${editingId}`, form);
        setToast({ message: 'Marque mise à jour', type: 'success' });
      } else {
        await api.post<ApiResponse<Marque>>('/marques', form);
        setToast({ message: 'Marque créée', type: 'success' });
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    } finally { setSaving(false); }
  };

  const handleToggle = async (m: Marque) => {
    try {
      if (m.actif) {
        await api.delete<ApiResponse<Marque>>(`/marques/${m.id}`);
        setToast({ message: 'Marque désactivée', type: 'success' });
      } else {
        await api.put<ApiResponse<Marque>>(`/marques/${m.id}`, { actif: true });
        setToast({ message: 'Marque réactivée', type: 'success' });
      }
      load();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    }
  };

  const handleLogoUpload = async (marqueId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const res = await fetch(`${API_URL}/marques/${marqueId}/logo`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erreur upload');
      setToast({ message: 'Logo uploadé', type: 'success' });
      load();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur upload', type: 'error' });
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>
            </span>
            Marques
          </h1>
          <p className="mt-1 text-sm text-gray-500 ml-[52px]">{marques.length} marque{marques.length > 1 ? 's' : ''}</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all cursor-pointer">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Nouvelle marque
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center gap-3">
          <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
          <p className="text-sm text-gray-400">Chargement...</p>
        </div>
      ) : marques.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>
          <p className="mt-3 text-sm font-medium text-gray-500">Aucune marque</p>
          <button onClick={openCreate} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 transition cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Créer la première marque
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {marques.map(m => (
            <div key={m.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition group">
              <div className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  {m.logo_url ? (
                    <div className="h-12 w-12 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                      <img src={resolveLogo(m.logo_url)} alt={m.nom} className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <div className={`h-12 w-12 rounded-xl ${getColor(m.id)} flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-lg`}>
                      {getInitials(m.nom)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{m.nom}</p>
                    {m.site_web && (
                      <a href={m.site_web.startsWith('http') ? m.site_web : `https://${m.site_web}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-500 hover:text-blue-700 flex items-center gap-1 truncate">
                        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                        {m.site_web.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">{m.nb_produits} produit{m.nb_produits > 1 ? 's' : ''}</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${m.actif ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${m.actif ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                    {m.actif ? 'Actif' : 'Inactif'}
                  </span>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center gap-2">
                <button onClick={() => openEdit(m)} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                  Modifier
                </button>
                <button onClick={() => handleToggle(m)} className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${m.actif ? 'text-gray-600 hover:text-red-600 hover:bg-red-50' : 'text-gray-600 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9" /></svg>
                  {m.actif ? 'Désactiver' : 'Réactiver'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mx-4" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{editingId ? 'Modifier la marque' : 'Nouvelle marque'}</h3>
              <button onClick={() => setModalOpen(false)} className="rounded-lg p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div><label className={labelCls}>Nom <span className="text-red-500">*</span></label><input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Nom de la marque" className={inputCls} /></div>
              {editingId && (
                <div>
                  <label className={labelCls}>Logo</label>
                  <div className="flex items-center gap-4">
                    {marques.find(m => m.id === editingId)?.logo_url ? (
                      <div className="h-16 w-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                        <img src={resolveLogo(marques.find(m => m.id === editingId)!.logo_url!)} alt="" className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : (
                      <div className={`h-16 w-16 rounded-xl ${getColor(editingId)} flex items-center justify-center text-white text-lg font-bold`}>
                        {getInitials(form.nom || '??')}
                      </div>
                    )}
                    <button onClick={() => fileInputRef.current?.click()} disabled={logoUploading} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50">
                      {logoUploading ? <div className="h-3.5 w-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>}
                      {logoUploading ? 'Upload...' : 'Changer le logo'}
                    </button>
                    <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.svg" onChange={e => handleLogoUpload(editingId, e)} className="hidden" />
                  </div>
                  <p className="mt-2 text-xs text-gray-400">JPG, PNG ou SVG — max 2 Mo</p>
                </div>
              )}
              <div><label className={labelCls}>Site web</label><input value={form.site_web} onChange={e => setForm(f => ({ ...f, site_web: e.target.value }))} placeholder="https://www.marque.com" className={inputCls} /></div>
              <div><label className={labelCls}>Notes</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes internes..." rows={3} className={`${inputCls} resize-y`} /></div>
              {editingId && (
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button type="button" role="switch" aria-checked={form.actif} onClick={() => setForm(f => ({ ...f, actif: !f.actif }))}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${form.actif ? 'bg-blue-600' : 'bg-gray-300'}`}>
                      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition ${form.actif ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <span className="text-sm font-semibold text-gray-700">Marque active</span>
                  </label>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
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
