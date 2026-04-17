'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { ChampConfig, EntiteType, ApiResponse, TypeChamp } from '@/lib/types';

type ModalMode = 'create' | 'edit';

interface ChampFormData {
  section: string;
  label: string;
  cle: string;
  type: TypeChamp;
  valeur_defaut: string;
  options_liste: string;
  obligatoire: boolean;
}

interface SectionModalData {
  oldName: string;
  newName: string;
}

const EMPTY_FORM: ChampFormData = {
  section: '',
  label: '',
  cle: '',
  type: 'TEXTE',
  valeur_defaut: '',
  options_liste: '',
  obligatoire: false,
};

const ENTITES: { key: EntiteType; label: string; icon: ReactNode; color: string; gradient: string }[] = [
  {
    key: 'CLIENT',
    label: 'Clients',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
    color: 'blue',
    gradient: 'from-blue-500 to-blue-600',
  },
  {
    key: 'DEVIS',
    label: 'Devis',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
    color: 'emerald',
    gradient: 'from-emerald-500 to-emerald-600',
  },
  {
    key: 'CONTRAT',
    label: 'Contrats',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75h6m-6 3h4" />
      </svg>
    ),
    color: 'amber',
    gradient: 'from-amber-500 to-amber-600',
  },
  {
    key: 'CATALOGUE',
    label: 'Catalogue',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
    color: 'violet',
    gradient: 'from-violet-500 to-violet-600',
  },
];

const TYPE_CONFIG: Record<TypeChamp, { label: string; bg: string; text: string; dot: string }> = {
  TEXTE:   { label: 'Texte',    bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  NOMBRE:  { label: 'Nombre',   bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  DATE:    { label: 'Date',     bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  LISTE:   { label: 'Liste',    bg: 'bg-violet-50',  text: 'text-violet-700',  dot: 'bg-violet-500' },
  BOOLEEN: { label: 'Booléen',  bg: 'bg-pink-50',    text: 'text-pink-700',    dot: 'bg-pink-500' },
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
  return str.split('').map(c => accents[c] || c).join('')
    .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

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

export default function ChampsPersonnalisesPage() {
  const [activeEntite, setActiveEntite] = useState<EntiteType>('CLIENT');
  const [configs, setConfigs] = useState<ChampConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ChampFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [cleManuallyEdited, setCleManuallyEdited] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [sectionModalOpen, setSectionModalOpen] = useState(false);
  const [sectionModalMode, setSectionModalMode] = useState<'create' | 'rename'>('create');
  const [sectionModalData, setSectionModalData] = useState<SectionModalData>({ oldName: '', newName: '' });
  const [sectionSaving, setSectionSaving] = useState(false);

  const [deleteSectionConfirm, setDeleteSectionConfirm] = useState<string | null>(null);
  const [deletingSec, setDeletingSec] = useState(false);

  const [existingSections, setExistingSections] = useState<string[]>([]);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResponse<ChampConfig[]>>(`/champs-config?entite=${activeEntite}`);
      setConfigs(res.data);
      const sections = [...new Set(res.data.map(c => c.section))];
      setExistingSections(sections);
    } catch {
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  }, [activeEntite]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const grouped = configs.reduce<Record<string, ChampConfig[]>>((acc, c) => {
    if (!acc[c.section]) acc[c.section] = [];
    acc[c.section].push(c);
    return acc;
  }, {});

  const sortedSections = Object.keys(grouped).sort((a, b) => {
    const aOrdre = grouped[a][0]?.section_ordre ?? 0;
    const bOrdre = grouped[b][0]?.section_ordre ?? 0;
    return aOrdre - bOrdre;
  });

  const openCreateModal = (section?: string) => {
    setForm({ ...EMPTY_FORM, section: section || '' });
    setFormErrors({});
    setModalMode('create');
    setEditingId(null);
    setCleManuallyEdited(false);
    setModalOpen(true);
  };

  const openEditModal = (champ: ChampConfig) => {
    setForm({
      section: champ.section,
      label: champ.label,
      cle: champ.cle,
      type: champ.type,
      valeur_defaut: champ.valeur_defaut || '',
      options_liste: champ.options_liste ? champ.options_liste.join('\n') : '',
      obligatoire: champ.obligatoire,
    });
    setFormErrors({});
    setModalMode('edit');
    setEditingId(champ.id);
    setCleManuallyEdited(true);
    setModalOpen(true);
  };

  const closeModal = () => { setModalOpen(false); setEditingId(null); setFormErrors({}); };

  const updateField = (field: keyof ChampFormData, value: string | boolean) => {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (field === 'label' && !cleManuallyEdited) next.cle = slugify(value as string);
      return next;
    });
    setFormErrors(e => { const n = { ...e }; delete n[field]; return n; });
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!form.label.trim()) errors.label = 'Le libellé est obligatoire';
    if (!form.cle.trim()) errors.cle = 'La clé est obligatoire';
    if (!form.section.trim()) errors.section = 'La section est obligatoire';
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
        entite: activeEntite,
        section: form.section.trim(),
        label: form.label.trim(),
        cle: form.cle.trim(),
        type: form.type,
        valeur_defaut: form.valeur_defaut.trim() || null,
        options_liste: options,
        obligatoire: form.obligatoire,
      };

      if (modalMode === 'create') {
        await api.post<ApiResponse<ChampConfig>>('/champs-config', body);
        setToast({ message: 'Champ personnalisé créé avec succès', type: 'success' });
      } else {
        await api.put<ApiResponse<ChampConfig>>(`/champs-config/${editingId}`, body);
        setToast({ message: 'Champ personnalisé mis à jour', type: 'success' });
      }
      closeModal();
      fetchConfigs();
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
      await api.delete<ApiResponse<null>>(`/champs-config/${id}`);
      setToast({ message: 'Champ supprimé', type: 'success' });
      setDeleteConfirmId(null);
      fetchConfigs();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la suppression';
      setToast({ message, type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const openRenameSectionModal = (sectionName: string) => {
    setSectionModalData({ oldName: sectionName, newName: sectionName });
    setSectionModalMode('rename');
    setSectionModalOpen(true);
  };

  const openCreateSectionModal = () => {
    setSectionModalData({ oldName: '', newName: '' });
    setSectionModalMode('create');
    setSectionModalOpen(true);
  };

  const handleSectionSubmit = async () => {
    if (!sectionModalData.newName.trim()) return;
    setSectionSaving(true);
    try {
      if (sectionModalMode === 'rename') {
        await api.put(`/champs-config/sections/${activeEntite}/rename`, {
          oldName: sectionModalData.oldName,
          newName: sectionModalData.newName.trim(),
        });
        setToast({ message: 'Section renommée', type: 'success' });
      } else {
        openCreateModal(sectionModalData.newName.trim());
      }
      setSectionModalOpen(false);
      fetchConfigs();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur';
      setToast({ message, type: 'error' });
    } finally {
      setSectionSaving(false);
    }
  };

  const handleDeleteSection = async (section: string) => {
    setDeletingSec(true);
    try {
      await api.delete(`/champs-config/sections/${activeEntite}/${encodeURIComponent(section)}`);
      setToast({ message: 'Section et ses champs supprimés', type: 'success' });
      setDeleteSectionConfirm(null);
      fetchConfigs();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur';
      setToast({ message, type: 'error' });
    } finally {
      setDeletingSec(false);
    }
  };

  const activeEntiteConfig = ENTITES.find(e => e.key === activeEntite)!;

  const inputClass = (field: string) =>
    `w-full rounded-xl border ${formErrors[field] ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-gray-200 focus:border-blue-400 focus:ring-blue-500/10'} bg-gray-50 py-2.5 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition`;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>
            </span>
            Champs personnalisés
          </h1>
          <p className="mt-1 text-sm text-gray-500 ml-[52px]">Créez des sections et des champs personnalisés pour vos entités</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchConfigs}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
            Actualiser
          </button>
        </div>
      </div>

      {/* Entité tabs */}
      <div className="flex items-center gap-2 mb-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5">
        {ENTITES.map(ent => (
          <button
            key={ent.key}
            onClick={() => setActiveEntite(ent.key)}
            className={`flex-1 flex items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all cursor-pointer ${
              activeEntite === ent.key
                ? `bg-gradient-to-r ${ent.gradient} text-white shadow-lg shadow-${ent.color}-500/25`
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            {ent.icon}
            {ent.label}
            {activeEntite === ent.key && configs.length > 0 && (
              <span className="bg-white/20 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                {configs.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          {sortedSections.length > 0 && (
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-700">{sortedSections.length}</span> section{sortedSections.length > 1 ? 's' : ''} — <span className="font-semibold text-gray-700">{configs.length}</span> champ{configs.length > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCreateSectionModal}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
            Nouvelle section
          </button>
          <button
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-700 hover:to-indigo-700 transition-all cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            Nouveau champ
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
            <p className="text-sm text-gray-400">Chargement...</p>
          </div>
        </div>
      ) : configs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500">Aucun champ personnalisé pour {activeEntiteConfig.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">Commencez par créer une section puis ajoutez des champs</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openCreateSectionModal}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
                Créer une section
              </button>
              <button
                onClick={() => openCreateModal()}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Créer un champ
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedSections.map(section => (
            <div key={section} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Section header */}
              <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${activeEntiteConfig.gradient} flex items-center justify-center`}>
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider">{section}</h2>
                    <p className="text-xs text-gray-400">{grouped[section].length} champ{grouped[section].length > 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openCreateModal(section)}
                    className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                    title="Ajouter un champ"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  </button>
                  <button
                    onClick={() => openRenameSectionModal(section)}
                    className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition cursor-pointer"
                    title="Renommer la section"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
                  </button>
                  <button
                    onClick={() => setDeleteSectionConfirm(section)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                    title="Supprimer la section"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                  </button>
                </div>
              </div>

              {/* Champs */}
              <div className="divide-y divide-gray-50">
                {grouped[section].sort((a, b) => a.ordre - b.ordre).map(champ => (
                  <div key={champ.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/50 transition group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-sm font-semibold text-gray-800">{champ.label}</h3>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TYPE_CONFIG[champ.type].bg} ${TYPE_CONFIG[champ.type].text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${TYPE_CONFIG[champ.type].dot}`} />
                          {TYPE_CONFIG[champ.type].label}
                        </span>
                        {champ.obligatoire && (
                          <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                            Obligatoire
                          </span>
                        )}
                        {!champ.actif && (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                            Inactif
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <code className="text-[11px] font-mono text-gray-400">{champ.cle}</code>
                        {champ.valeur_defaut && (
                          <span className="text-[11px] text-gray-400">Défaut : <span className="font-medium text-gray-500">{champ.valeur_defaut}</span></span>
                        )}
                        {champ.type === 'LISTE' && champ.options_liste && (
                          <span className="text-[11px] text-gray-400">{champ.options_liste.length} options</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => openEditModal(champ)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition cursor-pointer"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(champ.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Champ Confirmation */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-11 w-11 rounded-xl bg-red-50 flex items-center justify-center">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Supprimer le champ</h3>
                <p className="text-xs text-gray-400">Cette action supprimera aussi toutes les valeurs associées</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 shadow-lg shadow-red-500/25 transition disabled:opacity-50 cursor-pointer"
              >
                {deleting ? (<><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Suppression...</>) : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Section Confirmation */}
      {deleteSectionConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteSectionConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-11 w-11 rounded-xl bg-red-50 flex items-center justify-center">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Supprimer la section &quot;{deleteSectionConfirm}&quot;</h3>
                <p className="text-xs text-gray-400">Tous les champs de cette section seront supprimés</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDeleteSectionConfirm(null)} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
              <button
                onClick={() => handleDeleteSection(deleteSectionConfirm)}
                disabled={deletingSec}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 shadow-lg shadow-red-500/25 transition disabled:opacity-50 cursor-pointer"
              >
                {deletingSec ? (<><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Suppression...</>) : 'Supprimer la section'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section Modal (create / rename) */}
      {sectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSectionModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
              </div>
              <h3 className="text-base font-bold text-gray-900">
                {sectionModalMode === 'create' ? 'Nouvelle section' : 'Renommer la section'}
              </h3>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nom de la section</label>
              <input
                value={sectionModalData.newName}
                onChange={e => setSectionModalData(d => ({ ...d, newName: e.target.value }))}
                placeholder="Ex: Identité, Conditions commerciales..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') handleSectionSubmit(); }}
              />
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setSectionModalOpen(false)} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
              <button
                onClick={handleSectionSubmit}
                disabled={sectionSaving || !sectionModalData.newName.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 cursor-pointer"
              >
                {sectionSaving ? (<div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />) : null}
                {sectionModalMode === 'create' ? 'Créer et ajouter un champ' : 'Renommer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Champ Modal */}
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
                    {modalMode === 'create' ? 'Nouveau champ' : 'Modifier le champ'}
                  </h2>
                  <p className="text-xs text-gray-400">Entité : {activeEntiteConfig.label}</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto">
              <div className="space-y-5">
                {/* Section */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Section <span className="text-red-500">*</span></label>
                  <input
                    value={form.section}
                    onChange={e => updateField('section', e.target.value)}
                    placeholder="Ex: Identité, Conditions commerciales..."
                    list="sections-list"
                    className={inputClass('section')}
                  />
                  <datalist id="sections-list">
                    {existingSections.map(s => <option key={s} value={s} />)}
                  </datalist>
                  {formErrors.section && (
                    <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                      {formErrors.section}
                    </p>
                  )}
                </div>

                {/* Label */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Libellé <span className="text-red-500">*</span></label>
                  <input value={form.label} onChange={e => updateField('label', e.target.value)} placeholder="Ex: Nom du dirigeant" className={inputClass('label')} />
                  {formErrors.label && (
                    <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                      {formErrors.label}
                    </p>
                  )}
                </div>

                {/* Clé */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Clé interne <span className="text-red-500">*</span></label>
                  <input
                    value={form.cle}
                    onChange={e => { setCleManuallyEdited(true); updateField('cle', e.target.value); }}
                    placeholder="nom_du_dirigeant"
                    className={`${inputClass('cle')} font-mono text-xs`}
                  />
                  {!cleManuallyEdited && form.cle && <p className="mt-1.5 text-xs text-gray-400">Généré automatiquement</p>}
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
                      <select value={form.type} onChange={e => updateField('type', e.target.value)} className="appearance-none w-full rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-4 pr-10 text-sm font-medium text-gray-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none transition cursor-pointer">
                        <option value="TEXTE">Texte</option>
                        <option value="NOMBRE">Nombre</option>
                        <option value="DATE">Date</option>
                        <option value="LISTE">Liste</option>
                        <option value="BOOLEEN">Booléen</option>
                      </select>
                      <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                    </div>
                  </div>

                  {/* Valeur par défaut */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Valeur par défaut</label>
                    <input value={form.valeur_defaut} onChange={e => updateField('valeur_defaut', e.target.value)} placeholder="Optionnel" className={inputClass('valeur_defaut')} />
                  </div>
                </div>

                {/* Options liste */}
                {form.type === 'LISTE' && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Options de la liste <span className="text-red-500">*</span></label>
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

                {/* Obligatoire toggle */}
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form.obligatoire}
                      onClick={() => updateField('obligatoire', !form.obligatoire)}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out cursor-pointer ${form.obligatoire ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${form.obligatoire ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Champ obligatoire</p>
                      <p className="text-xs text-gray-400">Ce champ devra être rempli lors de la saisie</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
              <button onClick={closeModal} className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? (
                  <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />{modalMode === 'create' ? 'Création...' : 'Enregistrement...'}</>
                ) : (
                  <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>{modalMode === 'create' ? 'Créer' : 'Enregistrer'}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
