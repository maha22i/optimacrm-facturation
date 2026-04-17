'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { ChampTemplate, ApiResponse, TypeChamp } from '@/lib/types';

type ModalMode = 'create' | 'edit';

interface FormData {
  label: string;
  cle: string;
  type: TypeChamp;
  valeur_defaut: string;
  options_liste: string;
  categorie: string;
  afficher_sur_pdf: boolean;
}

const EMPTY_FORM: FormData = {
  label: '',
  cle: '',
  type: 'TEXTE',
  valeur_defaut: '',
  options_liste: '',
  categorie: '',
  afficher_sur_pdf: false,
};

const TYPE_CONFIG: Record<TypeChamp, { label: string; bg: string; text: string }> = {
  TEXTE: { label: 'Texte', bg: 'bg-blue-50', text: 'text-blue-700' },
  NOMBRE: { label: 'Nombre', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  DATE: { label: 'Date', bg: 'bg-amber-50', text: 'text-amber-700' },
  LISTE: { label: 'Liste', bg: 'bg-violet-50', text: 'text-violet-700' },
  BOOLEEN: { label: 'Booléen', bg: 'bg-pink-50', text: 'text-pink-700' },
};

const TYPE_DOT: Record<TypeChamp, string> = {
  TEXTE: 'bg-blue-500',
  NOMBRE: 'bg-emerald-500',
  DATE: 'bg-amber-500',
  LISTE: 'bg-violet-500',
  BOOLEEN: 'bg-pink-500',
};

function slugify(str: string): string {
  const accents: Record<string, string> = {
    à: 'a', â: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e',
    î: 'i', ï: 'i', ô: 'o', ö: 'o', ù: 'u', û: 'u', ü: 'u',
    ç: 'c', ñ: 'n', œ: 'oe', æ: 'ae',
    À: 'a', Â: 'a', Ä: 'a', É: 'e', È: 'e', Ê: 'e', Ë: 'e',
    Î: 'i', Ï: 'i', Ô: 'o', Ö: 'o', Ù: 'u', Û: 'u', Ü: 'u',
    Ç: 'c', Ñ: 'n', Œ: 'oe', Æ: 'ae',
  };
  return str
    .split('')
    .map(c => accents[c] || c)
    .join('')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

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

export default function ChampsDevisPage() {
  const [templates, setTemplates] = useState<ChampTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [cleManuallyEdited, setCleManuallyEdited] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<string[]>>('/champs-templates/categories');
      setCategories(res.data);
    } catch {
      setCategories([]);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<ChampTemplate[]>>('/champs-templates');
      setTemplates(res.data);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchTemplates();
  }, [fetchCategories, fetchTemplates]);

  const grouped = templates.reduce<Record<string, ChampTemplate[]>>((acc, t) => {
    const cat = t.categorie || 'Sans catégorie';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    if (a === 'Sans catégorie') return 1;
    if (b === 'Sans catégorie') return -1;
    return a.localeCompare(b, 'fr');
  });

  const openCreateModal = () => {
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalMode('create');
    setEditingId(null);
    setCleManuallyEdited(false);
    setModalOpen(true);
  };

  const openEditModal = (tpl: ChampTemplate) => {
    setForm({
      label: tpl.label,
      cle: tpl.cle,
      type: tpl.type,
      valeur_defaut: tpl.valeur_defaut || '',
      options_liste: tpl.options_liste ? tpl.options_liste.join('\n') : '',
      categorie: tpl.categorie || '',
      afficher_sur_pdf: tpl.afficher_sur_pdf,
    });
    setFormErrors({});
    setModalMode('edit');
    setEditingId(tpl.id);
    setCleManuallyEdited(true);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setFormErrors({});
  };

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (field === 'label' && !cleManuallyEdited) {
        next.cle = slugify(value as string);
      }
      return next;
    });
    setFormErrors(e => { const n = { ...e }; delete n[field]; return n; });
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.label.trim()) errors.label = 'Le libellé est obligatoire';
    if (!form.cle.trim()) errors.cle = 'La clé est obligatoire';
    if (form.type === 'LISTE') {
      const options = form.options_liste.split('\n').filter(l => l.trim());
      if (options.length < 2) errors.options_liste = 'Au moins 2 options sont requises';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      const options = form.type === 'LISTE'
        ? form.options_liste.split('\n').map(l => l.trim()).filter(Boolean)
        : null;

      const body = {
        label: form.label.trim(),
        cle: form.cle.trim(),
        type: form.type,
        valeur_defaut: form.valeur_defaut.trim() || null,
        options_liste: options,
        categorie: form.categorie.trim() || null,
        afficher_sur_pdf: form.afficher_sur_pdf,
      };

      if (modalMode === 'create') {
        await api.post<ApiResponse<ChampTemplate>>('/champs-templates', body);
        setToast({ message: 'Template créé avec succès', type: 'success' });
      } else {
        await api.put<ApiResponse<ChampTemplate>>(`/champs-templates/${editingId}`, body);
        setToast({ message: 'Template mis à jour', type: 'success' });
      }
      closeModal();
      fetchTemplates();
      fetchCategories();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue';
      setToast({ message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      await api.delete<ApiResponse<null>>(`/champs-templates/${id}`);
      setToast({ message: 'Template supprimé', type: 'success' });
      setDeleteConfirmId(null);
      fetchTemplates();
      fetchCategories();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la suppression';
      setToast({ message, type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const inputClass = (field: string) =>
    `w-full rounded-xl border ${formErrors[field] ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-gray-200 focus:border-blue-400 focus:ring-blue-500/10'} bg-gray-50 py-2.5 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition`;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>
            </span>
            Champs personnalisés — Templates
          </h1>
          <p className="mt-1 text-sm text-gray-500 ml-[52px]">Définissez les champs personnalisés disponibles pour vos devis</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { fetchTemplates(); fetchCategories(); }}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
            Actualiser
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-700 hover:to-indigo-700 transition-all cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Nouveau template
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
            <p className="text-sm text-gray-400">Chargement des templates...</p>
          </div>
        </div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Aucun template de champ personnalisé</p>
              <p className="text-xs text-gray-400 mt-0.5">Créez votre premier template pour personnaliser vos devis</p>
            </div>
            <button
              onClick={openCreateModal}
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Créer un template
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Count */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">{templates.length}</span> template{templates.length > 1 ? 's' : ''} — <span className="font-semibold text-gray-700">{sortedCategories.length}</span> catégorie{sortedCategories.length > 1 ? 's' : ''}
            </p>
          </div>

          {sortedCategories.map(cat => (
            <div key={cat}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{cat}</h2>
                <div className="flex-1 border-t border-gray-100" />
                <span className="text-xs font-semibold text-gray-400 bg-gray-50 px-2.5 py-0.5 rounded-full">
                  {grouped[cat].length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {grouped[cat].map(tpl => (
                  <div
                    key={tpl.id}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-gray-200 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-gray-900 truncate">{tpl.label}</h3>
                        <p className="text-xs font-mono text-gray-400 mt-0.5 truncate">{tpl.cle}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shrink-0 ${TYPE_CONFIG[tpl.type].bg} ${TYPE_CONFIG[tpl.type].text}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[tpl.type]}`} />
                        {TYPE_CONFIG[tpl.type].label}
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="space-y-2 mb-4">
                      {tpl.valeur_defaut && (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" /></svg>
                          <span className="truncate">Défaut : <span className="font-medium text-gray-700">{tpl.valeur_defaut}</span></span>
                        </div>
                      )}
                      {tpl.type === 'LISTE' && tpl.options_liste && (
                        <div className="flex items-start gap-2 text-xs text-gray-500">
                          <svg className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                          <span className="truncate">{tpl.options_liste.length} option{tpl.options_liste.length > 1 ? 's' : ''} : {tpl.options_liste.slice(0, 3).join(', ')}{tpl.options_liste.length > 3 ? '...' : ''}</span>
                        </div>
                      )}
                    </div>

                    {/* Indicators */}
                    <div className="flex items-center gap-2 mb-4">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        tpl.actif ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${tpl.actif ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        {tpl.actif ? 'Actif' : 'Inactif'}
                      </span>
                      {tpl.afficher_sur_pdf && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                          PDF
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => openEditModal(tpl)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 transition cursor-pointer"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
                        Modifier
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(tpl.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition cursor-pointer"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-11 w-11 rounded-xl bg-red-50 flex items-center justify-center">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Confirmer la suppression</h3>
                <p className="text-xs text-gray-400">Cette action est irréversible</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Êtes-vous sûr de vouloir supprimer ce template de champ personnalisé ? Les champs déjà ajoutés aux devis existants ne seront pas affectés.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 shadow-lg shadow-red-500/25 transition disabled:opacity-50 cursor-pointer"
              >
                {deleting ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Suppression...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                    Supprimer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${modalMode === 'create' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                  {modalMode === 'create' ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
                  )}
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">
                    {modalMode === 'create' ? 'Nouveau template' : 'Modifier le template'}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {modalMode === 'create' ? 'Définissez un nouveau champ personnalisé' : 'Modifiez les propriétés du template'}
                  </p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto">
              <div className="space-y-5">
                {/* Label */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Libellé <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.label}
                    onChange={e => updateField('label', e.target.value)}
                    placeholder="Ex: Durée du contrat"
                    className={inputClass('label')}
                  />
                  {formErrors.label && (
                    <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                      {formErrors.label}
                    </p>
                  )}
                </div>

                {/* Clé interne */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Clé interne <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.cle}
                    onChange={e => { setCleManuallyEdited(true); updateField('cle', e.target.value); }}
                    placeholder="duree_du_contrat"
                    className={`${inputClass('cle')} font-mono text-xs`}
                  />
                  {!cleManuallyEdited && form.cle && (
                    <p className="mt-1.5 text-xs text-gray-400">Généré automatiquement à partir du libellé</p>
                  )}
                  {formErrors.cle && (
                    <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                      {formErrors.cle}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Type */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Type</label>
                    <div className="relative">
                      <select
                        value={form.type}
                        onChange={e => updateField('type', e.target.value)}
                        className="appearance-none w-full rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-4 pr-10 text-sm font-medium text-gray-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none transition cursor-pointer"
                      >
                        <option value="TEXTE">Texte</option>
                        <option value="NOMBRE">Nombre</option>
                        <option value="DATE">Date</option>
                        <option value="LISTE">Liste</option>
                        <option value="BOOLEEN">Booléen</option>
                      </select>
                      <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                    </div>
                  </div>

                  {/* Catégorie */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Catégorie</label>
                    <input
                      value={form.categorie}
                      onChange={e => updateField('categorie', e.target.value)}
                      placeholder="Saisir ou choisir..."
                      list="tpl-categories-list"
                      className={inputClass('categorie')}
                    />
                    <datalist id="tpl-categories-list">
                      {categories.map(cat => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* Options liste (conditional) */}
                {form.type === 'LISTE' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Options de la liste <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={form.options_liste}
                      onChange={e => updateField('options_liste', e.target.value)}
                      placeholder={"Option 1\nOption 2\nOption 3"}
                      rows={4}
                      className={`${inputClass('options_liste')} resize-none font-mono text-xs`}
                    />
                    <p className="mt-1.5 text-xs text-gray-400">Une option par ligne (minimum 2)</p>
                    {formErrors.options_liste && (
                      <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                        {formErrors.options_liste}
                      </p>
                    )}
                  </div>
                )}

                {/* Valeur par défaut */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Valeur par défaut</label>
                  <input
                    value={form.valeur_defaut}
                    onChange={e => updateField('valeur_defaut', e.target.value)}
                    placeholder="Laisser vide si aucune"
                    className={inputClass('valeur_defaut')}
                  />
                </div>

                {/* Afficher sur PDF */}
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form.afficher_sur_pdf}
                      onClick={() => updateField('afficher_sur_pdf', !form.afficher_sur_pdf)}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out cursor-pointer ${
                        form.afficher_sur_pdf ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        form.afficher_sur_pdf ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Afficher sur le PDF par défaut</p>
                      <p className="text-xs text-gray-400">Ce champ sera visible sur les PDF des devis</p>
                    </div>
                  </label>
                </div>

                {/* Preview */}
                {form.label && (
                  <div className="rounded-xl bg-indigo-50/70 border border-indigo-100 p-4">
                    <div className="flex items-center gap-3">
                      <svg className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold text-indigo-500 uppercase tracking-wider">Aperçu</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-sm font-semibold text-indigo-900">{form.label}</span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_CONFIG[form.type].bg} ${TYPE_CONFIG[form.type].text}`}>
                            {TYPE_CONFIG[form.type].label}
                          </span>
                          {form.cle && (
                            <code className="text-[10px] font-mono text-indigo-400 bg-indigo-100 px-1.5 py-0.5 rounded">{form.cle}</code>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={closeModal}
                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    {modalMode === 'create' ? 'Création...' : 'Enregistrement...'}
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    {modalMode === 'create' ? 'Créer' : 'Enregistrer'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
