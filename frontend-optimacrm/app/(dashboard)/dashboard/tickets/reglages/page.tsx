'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import type { ApiResponse, PaginatedResponse, User, TicketCategorie, TicketSlaRule, TicketEmailConfig, TicketEmailSyncResult } from '@/lib/types';

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

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
    {error}
  </p>;
}

const PRESET_COLORS = [
  { label: 'Rouge', value: '#EF4444' },
  { label: 'Bleu', value: '#3B82F6' },
  { label: 'Vert', value: '#10B981' },
  { label: 'Orange', value: '#F59E0B' },
  { label: 'Violet', value: '#8B5CF6' },
  { label: 'Indigo', value: '#6366F1' },
  { label: 'Rose', value: '#EC4899' },
  { label: 'Gris', value: '#6B7280' },
  { label: 'Jaune', value: '#EAB308' },
  { label: 'Cyan', value: '#06B6D4' },
];

export default function TicketReglagesPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'categories' | 'sla' | 'email'>('categories');

  const [categories, setCategories] = useState<TicketCategorie[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [techniciens, setTechniciens] = useState<User[]>([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<TicketCategorie | null>(null);
  const [catSaving, setCatSaving] = useState(false);
  const [catForm, setCatForm] = useState({
    nom: '',
    description: '',
    couleur: '#6B7280',
    ordre: 0,
    technicien_defaut_id: '',
  });
  const [catErrors, setCatErrors] = useState<Record<string, string>>({});

  const [slaRules, setSlaRules] = useState<TicketSlaRule[]>([]);
  const [slaLoading, setSlaLoading] = useState(true);
  const [showSlaModal, setShowSlaModal] = useState(false);
  const [editingSla, setEditingSla] = useState<TicketSlaRule | null>(null);
  const [slaSaving, setSlaSaving] = useState(false);
  const [slaForm, setSlaForm] = useState({
    delai_prise_en_charge_heures: 0,
    delai_resolution_heures: 0,
  });
  const [slaErrors, setSlaErrors] = useState<Record<string, string>>({});

  const [emailConfig, setEmailConfig] = useState<TicketEmailConfig | null>(null);
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [emailSyncing, setEmailSyncing] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [emailForm, setEmailForm] = useState({
    imap_host: '',
    imap_port: 993,
    imap_user: '',
    imap_password: '',
    imap_tls: true,
    folder: 'INBOX',
    actif: false,
  });
  const [emailErrors, setEmailErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.push('/login'); return; }
    const isTicketAdmin = user.role === 'admin' || user.role === 'admin_technique';
    if (!isTicketAdmin) {
      router.replace('/dashboard/tickets');
    }
  }, [user, isLoading, router]);

  const showToast = useCallback((t: { message: string; type: 'success' | 'error' }) => {
    setToast(t);
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);
      const [catRes, usersRes] = await Promise.all([
        api.get<ApiResponse<TicketCategorie[]>>('/tickets/categories?include_inactive=true'),
        api.get<PaginatedResponse<User>>('/auth/users?limit=100'),
      ]);
      setCategories(catRes.data);
      setTechniciens(
        (usersRes.data || []).filter(
          (u) => u.role === 'technicien' || u.role === 'admin_technique' || u.role === 'admin',
        ),
      );
    } catch {
      showToast({ message: 'Erreur lors du chargement des catégories', type: 'error' });
    } finally {
      setCategoriesLoading(false);
    }
  }, [showToast]);

  const loadSlaRules = useCallback(async () => {
    try {
      setSlaLoading(true);
      const res = await api.get<ApiResponse<TicketSlaRule[]>>('/tickets/sla-rules');
      setSlaRules(res.data);
    } catch {
      showToast({ message: 'Erreur lors du chargement des règles SLA', type: 'error' });
    } finally {
      setSlaLoading(false);
    }
  }, [showToast]);

  const loadEmailConfig = useCallback(async () => {
    try {
      setEmailLoading(true);
      const res = await api.get<ApiResponse<TicketEmailConfig>>('/tickets/email-config');
      setEmailConfig(res.data);
      setEmailForm({
        imap_host: res.data.imap_host || '',
        imap_port: res.data.imap_port || 993,
        imap_user: res.data.imap_user || '',
        imap_password: '',
        imap_tls: res.data.imap_tls ?? true,
        folder: res.data.folder || 'INBOX',
        actif: res.data.actif ?? false,
      });
    } catch {
      showToast({ message: 'Erreur lors du chargement de la configuration email', type: 'error' });
    } finally {
      setEmailLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!user) return;
    const isTicketAdmin = user.role === 'admin' || user.role === 'admin_technique';
    if (!isTicketAdmin) return;
    loadCategories();
    loadSlaRules();
    loadEmailConfig();
  }, [user, loadCategories, loadSlaRules, loadEmailConfig]);

  const validateEmailForm = () => {
    const errors: Record<string, string> = {};
    if (!emailForm.imap_host.trim()) errors.imap_host = "L'hôte IMAP est requis";
    if (!emailForm.imap_user.trim()) errors.imap_user = "L'utilisateur IMAP est requis";
    if (!emailForm.imap_port || emailForm.imap_port < 1 || emailForm.imap_port > 65535) errors.imap_port = 'Port invalide';
    if (emailForm.actif && !emailForm.imap_password && !emailConfig?.password_defini) {
      errors.imap_password = 'Un mot de passe est requis pour activer la synchronisation';
    }
    setEmailErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleEmailSave = async () => {
    if (!validateEmailForm()) return;
    setEmailSaving(true);
    try {
      const body: Record<string, unknown> = {
        imap_host: emailForm.imap_host.trim(),
        imap_port: emailForm.imap_port,
        imap_user: emailForm.imap_user.trim(),
        imap_tls: emailForm.imap_tls,
        folder: emailForm.folder.trim() || 'INBOX',
        actif: emailForm.actif,
      };
      if (emailForm.imap_password) body.imap_password = emailForm.imap_password;
      const res = await api.put<ApiResponse<TicketEmailConfig>>('/tickets/email-config', body);
      setEmailConfig(res.data);
      setEmailForm((f) => ({ ...f, imap_password: '' }));
      setEmailTestResult(null);
      showToast({ message: 'Configuration email enregistrée', type: 'success' });
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Erreur lors de la sauvegarde', type: 'error' });
    } finally {
      setEmailSaving(false);
    }
  };

  const handleEmailTest = async () => {
    setEmailTesting(true);
    setEmailTestResult(null);
    try {
      const body: Record<string, unknown> = {
        imap_host: emailForm.imap_host.trim(),
        imap_port: emailForm.imap_port,
        imap_user: emailForm.imap_user.trim(),
        imap_tls: emailForm.imap_tls,
        folder: emailForm.folder.trim() || 'INBOX',
      };
      if (emailForm.imap_password) body.imap_password = emailForm.imap_password;
      const res = await api.post<ApiResponse<{ success: boolean; message: string }>>('/tickets/email-config/test', body);
      setEmailTestResult(res.data);
    } catch (err) {
      setEmailTestResult({ success: false, message: err instanceof Error ? err.message : 'Erreur lors du test' });
    } finally {
      setEmailTesting(false);
    }
  };

  const handleEmailSync = async () => {
    setEmailSyncing(true);
    try {
      const res = await api.post<ApiResponse<TicketEmailSyncResult>>('/tickets/email-config/sync', {});
      showToast({
        message: `Synchronisation terminée : ${res.data.created} ticket(s) créé(s)${res.data.errors ? `, ${res.data.errors} erreur(s)` : ''}`,
        type: res.data.errors ? 'error' : 'success',
      });
      await loadEmailConfig();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Erreur lors de la synchronisation', type: 'error' });
    } finally {
      setEmailSyncing(false);
    }
  };

  const openNewCatModal = () => {
    setEditingCat(null);
    setCatForm({ nom: '', description: '', couleur: '#6B7280', ordre: categories.length + 1, technicien_defaut_id: '' });
    setCatErrors({});
    setShowCatModal(true);
  };

  const openEditCatModal = (cat: TicketCategorie) => {
    setEditingCat(cat);
    setCatForm({
      nom: cat.nom,
      description: cat.description || '',
      couleur: cat.couleur,
      ordre: cat.ordre,
      technicien_defaut_id: cat.technicien_defaut_id || '',
    });
    setCatErrors({});
    setShowCatModal(true);
  };

  const validateCatForm = () => {
    const errors: Record<string, string> = {};
    if (!catForm.nom.trim()) errors.nom = 'Le nom est requis';
    else if (catForm.nom.trim().length < 2) errors.nom = 'Le nom doit faire au moins 2 caractères';
    else if (catForm.nom.trim().length > 100) errors.nom = 'Le nom ne doit pas dépasser 100 caractères';
    if (!catForm.couleur || !/^#[0-9A-Fa-f]{6}$/.test(catForm.couleur)) errors.couleur = 'Couleur invalide';
    setCatErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCatSubmit = async () => {
    if (!validateCatForm()) return;
    setCatSaving(true);
    try {
      const body = {
        nom: catForm.nom.trim(),
        description: catForm.description.trim() || null,
        couleur: catForm.couleur,
        ordre: catForm.ordre,
        technicien_defaut_id: catForm.technicien_defaut_id || null,
      };
      if (editingCat) {
        await api.put(`/tickets/categories/${editingCat.id}`, body);
        showToast({ message: 'Catégorie mise à jour', type: 'success' });
      } else {
        await api.post('/tickets/categories', body);
        showToast({ message: 'Catégorie créée', type: 'success' });
      }
      setShowCatModal(false);
      await loadCategories();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Erreur lors de la sauvegarde', type: 'error' });
    } finally {
      setCatSaving(false);
    }
  };

  const toggleCatActive = async (cat: TicketCategorie) => {
    try {
      if (cat.actif) {
        await api.delete(`/tickets/categories/${cat.id}`);
        showToast({ message: `Catégorie "${cat.nom}" désactivée`, type: 'success' });
      } else {
        await api.put(`/tickets/categories/${cat.id}`, { actif: true });
        showToast({ message: `Catégorie "${cat.nom}" réactivée`, type: 'success' });
      }
      await loadCategories();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    }
  };

  const moveCatOrder = async (cat: TicketCategorie, direction: 'up' | 'down') => {
    const idx = categories.findIndex((c) => c.id === cat.id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= categories.length) return;
    const other = categories[swapIdx];
    try {
      await Promise.all([
        api.put(`/tickets/categories/${cat.id}`, { ordre: other.ordre }),
        api.put(`/tickets/categories/${other.id}`, { ordre: cat.ordre }),
      ]);
      await loadCategories();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    }
  };

  const openEditSlaModal = (rule: TicketSlaRule) => {
    setEditingSla(rule);
    setSlaForm({
      delai_prise_en_charge_heures: rule.delai_prise_en_charge_heures,
      delai_resolution_heures: rule.delai_resolution_heures,
    });
    setSlaErrors({});
    setShowSlaModal(true);
  };

  const validateSlaForm = () => {
    const errors: Record<string, string> = {};
    if (!slaForm.delai_prise_en_charge_heures || slaForm.delai_prise_en_charge_heures < 1)
      errors.delai_prise_en_charge_heures = 'Doit être un entier positif';
    if (!slaForm.delai_resolution_heures || slaForm.delai_resolution_heures < 1)
      errors.delai_resolution_heures = 'Doit être un entier positif';
    if (
      slaForm.delai_prise_en_charge_heures &&
      slaForm.delai_resolution_heures &&
      slaForm.delai_prise_en_charge_heures > slaForm.delai_resolution_heures
    )
      errors.delai_prise_en_charge_heures = 'Doit être inférieur au délai de résolution';
    setSlaErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSlaSubmit = async () => {
    if (!editingSla || !validateSlaForm()) return;
    setSlaSaving(true);
    try {
      await api.put(`/tickets/sla-rules/${editingSla.id}`, {
        delai_prise_en_charge_heures: Math.floor(slaForm.delai_prise_en_charge_heures),
        delai_resolution_heures: Math.floor(slaForm.delai_resolution_heures),
      });
      showToast({ message: 'Règle SLA mise à jour', type: 'success' });
      setShowSlaModal(false);
      await loadSlaRules();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Erreur lors de la sauvegarde', type: 'error' });
    } finally {
      setSlaSaving(false);
    }
  };

  const prioriteLabels: Record<string, string> = {
    basse: 'Basse',
    normale: 'Normale',
    haute: 'Haute',
    urgente: 'Urgente',
  };

  const inputCls = (field: string, errors: Record<string, string>) =>
    `w-full rounded-xl border ${errors[field] ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' : 'border-gray-200 focus:border-blue-400 focus:ring-blue-500/10'} bg-gray-50 py-3 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:ring-2 transition`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || (user.role !== 'admin' && user.role !== 'admin_technique')) return null;

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
          </span>
          Réglages Tickets
        </h1>
        <p className="mt-1 text-sm text-gray-500 ml-[52px]">Catégories et règles SLA</p>
      </div>

      {/* Tab bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('categories')}
            className={`flex-1 py-3.5 text-sm font-semibold text-center transition cursor-pointer ${
              activeTab === 'categories'
                ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Catégories
          </button>
          <button
            onClick={() => setActiveTab('sla')}
            className={`flex-1 py-3.5 text-sm font-semibold text-center transition cursor-pointer ${
              activeTab === 'sla'
                ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Règles SLA
          </button>
          <button
            onClick={() => setActiveTab('email')}
            className={`flex-1 py-3.5 text-sm font-semibold text-center transition cursor-pointer ${
              activeTab === 'email'
                ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            Boîte mail
          </button>
        </div>
      </div>

      {/* CATEGORIES TAB */}
      {activeTab === 'categories' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Catégories de tickets</h2>
                <p className="text-xs text-gray-400">Organisez les types de demandes support</p>
              </div>
            </div>
            <button
              onClick={openNewCatModal}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Nouvelle catégorie
            </button>
          </div>

          {categoriesLoading ? (
            <div className="p-12 flex items-center justify-center">
              <div className="h-8 w-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
            </div>
          ) : categories.length === 0 ? (
            <div className="p-12 text-center">
              <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /></svg>
              </div>
              <p className="text-sm font-medium text-gray-500">Aucune catégorie</p>
              <p className="text-xs text-gray-400 mt-1">Créez votre première catégorie de tickets</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-20">Ordre</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-16">Couleur</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Nom</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Technicien par défaut</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-24">Statut</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-32">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {categories.map((cat, idx) => (
                    <tr key={cat.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-gray-500 font-medium w-6 text-center">{cat.ordre}</span>
                          <div className="flex flex-col">
                            <button
                              onClick={() => moveCatOrder(cat, 'up')}
                              disabled={idx === 0}
                              className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer p-0.5"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>
                            </button>
                            <button
                              onClick={() => moveCatOrder(cat, 'down')}
                              disabled={idx === categories.length - 1}
                              className="text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer p-0.5"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block h-5 w-5 rounded-full border border-gray-200 shadow-sm" style={{ backgroundColor: cat.couleur }} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">{cat.nom}</p>
                        {cat.description && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{cat.description}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-600">
                          {cat.tech_prenom && cat.tech_nom ? `${cat.tech_prenom} ${cat.tech_nom}` : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          cat.actif
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cat.actif ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                          {cat.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditCatModal(cat)}
                            className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                            title="Modifier"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                          </button>
                          <button
                            onClick={() => toggleCatActive(cat)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition cursor-pointer ${
                              cat.actif ? 'bg-emerald-500' : 'bg-gray-300'
                            }`}
                            title={cat.actif ? 'Désactiver' : 'Activer'}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                              cat.actif ? 'translate-x-6' : 'translate-x-1'
                            }`} />
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
      )}

      {/* SLA TAB */}
      {activeTab === 'sla' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Règles SLA</h2>
                <p className="text-xs text-gray-400">Définissez les délais cibles par niveau de priorité</p>
              </div>
            </div>
          </div>

          {slaLoading ? (
            <div className="p-12 flex items-center justify-center">
              <div className="h-8 w-8 border-3 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Priorité</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-16">Couleur</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Prise en charge</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Résolution</th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {slaRules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-gray-50/50 transition">
                      <td className="px-6 py-4">
                        <span className="text-sm font-semibold text-gray-900">{prioriteLabels[rule.priorite] || rule.priorite}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block h-5 w-5 rounded-full border border-gray-200 shadow-sm" style={{ backgroundColor: rule.couleur }} />
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                          {rule.delai_prise_en_charge_heures}h
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                          {rule.delai_resolution_heures}h
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openEditSlaModal(rule)}
                          className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition cursor-pointer"
                          title="Modifier"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* EMAIL TAB */}
      {activeTab === 'email' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center text-violet-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900">Boîte mail support (IMAP)</h2>
                <p className="text-xs text-gray-400">Chaque mail entrant crée automatiquement un ticket &ldquo;Via mail&rdquo;</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Dernière synchronisation</p>
              <p className="text-sm font-semibold text-gray-700">
                {emailConfig?.derniere_synchro
                  ? new Date(emailConfig.derniere_synchro).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : 'Jamais'}
              </p>
            </div>
          </div>

          {emailLoading ? (
            <div className="p-12 flex items-center justify-center">
              <div className="h-8 w-8 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="p-6 space-y-5 max-w-2xl">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Hôte IMAP <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={emailForm.imap_host}
                    onChange={(e) => setEmailForm({ ...emailForm, imap_host: e.target.value })}
                    placeholder="imap.exemple.fr"
                    className={inputCls('imap_host', emailErrors)}
                  />
                  <FieldError error={emailErrors.imap_host} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Port <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={emailForm.imap_port}
                    onChange={(e) => setEmailForm({ ...emailForm, imap_port: parseInt(e.target.value) || 0 })}
                    className={inputCls('imap_port', emailErrors)}
                  />
                  <FieldError error={emailErrors.imap_port} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Utilisateur <span className="text-red-500">*</span>
                </label>
                <input
                  value={emailForm.imap_user}
                  onChange={(e) => setEmailForm({ ...emailForm, imap_user: e.target.value })}
                  placeholder="support@exemple.fr"
                  autoComplete="off"
                  className={inputCls('imap_user', emailErrors)}
                />
                <FieldError error={emailErrors.imap_user} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Mot de passe {!emailConfig?.password_defini && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="password"
                  value={emailForm.imap_password}
                  onChange={(e) => setEmailForm({ ...emailForm, imap_password: e.target.value })}
                  placeholder={emailConfig?.password_defini ? '•••••••• (inchangé)' : 'Mot de passe IMAP'}
                  autoComplete="new-password"
                  className={inputCls('imap_password', emailErrors)}
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  {emailConfig?.password_defini
                    ? 'Un mot de passe est déjà enregistré (chiffré). Laissez vide pour le conserver.'
                    : 'Le mot de passe est chiffré avant stockage, il ne sera jamais affiché.'}
                </p>
                <FieldError error={emailErrors.imap_password} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Dossier</label>
                <input
                  value={emailForm.folder}
                  onChange={(e) => setEmailForm({ ...emailForm, folder: e.target.value })}
                  placeholder="INBOX"
                  className={inputCls('folder', emailErrors)}
                />
              </div>

              <div className="flex items-center gap-8">
                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setEmailForm({ ...emailForm, imap_tls: !emailForm.imap_tls })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition cursor-pointer ${emailForm.imap_tls ? 'bg-emerald-500' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${emailForm.imap_tls ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-sm font-semibold text-gray-700">TLS / SSL</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setEmailForm({ ...emailForm, actif: !emailForm.actif })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition cursor-pointer ${emailForm.actif ? 'bg-emerald-500' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${emailForm.actif ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-sm font-semibold text-gray-700">Synchronisation active</span>
                </label>
              </div>

              {emailTestResult && (
                <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2 ${
                  emailTestResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {emailTestResult.success ? (
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                  ) : (
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                  )}
                  {emailTestResult.message}
                </div>
              )}

              <div className="flex items-center justify-between flex-wrap gap-3 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleEmailTest}
                    disabled={emailTesting || !emailForm.imap_host || !emailForm.imap_user}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {emailTesting ? (
                      <><div className="h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" /> Test…</>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" /></svg>
                        Tester la connexion
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleEmailSync}
                    disabled={emailSyncing || !emailConfig?.actif}
                    title={!emailConfig?.actif ? 'Activez et enregistrez la configuration pour synchroniser' : undefined}
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-700 hover:bg-violet-100 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {emailSyncing ? (
                      <><div className="h-4 w-4 border-2 border-violet-300 border-t-violet-700 rounded-full animate-spin" /> Synchronisation…</>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
                        Synchroniser maintenant
                      </>
                    )}
                  </button>
                </div>

                <button
                  onClick={handleEmailSave}
                  disabled={emailSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {emailSaving ? (
                    <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Enregistrement…</>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                      Enregistrer
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CATEGORY MODAL */}
      {showCatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCatModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">
                  {editingCat ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
                </h3>
                <button onClick={() => setShowCatModal(false)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nom <span className="text-red-500">*</span>
                </label>
                <input
                  value={catForm.nom}
                  onChange={(e) => setCatForm({ ...catForm, nom: e.target.value })}
                  placeholder="Ex: Panne matériel"
                  className={inputCls('nom', catErrors)}
                />
                <FieldError error={catErrors.nom} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                <textarea
                  value={catForm.description}
                  onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                  placeholder="Description optionnelle de la catégorie"
                  rows={2}
                  className={`${inputCls('description', catErrors)} resize-none`}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Couleur <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setCatForm({ ...catForm, couleur: c.value })}
                      className={`h-8 w-8 rounded-full border-2 transition cursor-pointer ${
                        catForm.couleur === c.value
                          ? 'border-gray-900 scale-110 shadow-lg'
                          : 'border-gray-200 hover:border-gray-400'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={catForm.couleur}
                    onChange={(e) => setCatForm({ ...catForm, couleur: e.target.value })}
                    className="h-9 w-12 rounded-lg border border-gray-200 cursor-pointer"
                  />
                  <input
                    value={catForm.couleur}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v.match(/^#?[0-9A-Fa-f]{0,6}$/)) {
                        setCatForm({ ...catForm, couleur: v.startsWith('#') ? v : `#${v}` });
                      }
                    }}
                    placeholder="#6B7280"
                    className="w-28 rounded-xl border border-gray-200 bg-gray-50 py-2 px-3 text-sm text-gray-900 font-mono outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 focus:bg-white transition"
                  />
                  <span className="inline-block h-6 w-6 rounded-full border border-gray-200 shadow-sm" style={{ backgroundColor: catForm.couleur }} />
                </div>
                <FieldError error={catErrors.couleur} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Technicien par défaut</label>
                <select
                  value={catForm.technicien_defaut_id}
                  onChange={(e) => setCatForm({ ...catForm, technicien_defaut_id: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 px-4 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 focus:bg-white transition cursor-pointer"
                >
                  <option value="">Aucun (sélectionner un technicien)</option>
                  {techniciens.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.first_name} {t.last_name} ({t.role === 'admin' ? 'Admin' : t.role === 'admin_technique' ? 'Admin technique' : 'Technicien'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Ordre d&apos;affichage</label>
                <input
                  type="number"
                  min={0}
                  value={catForm.ordre}
                  onChange={(e) => setCatForm({ ...catForm, ordre: parseInt(e.target.value) || 0 })}
                  className="w-24 rounded-xl border border-gray-200 bg-gray-50 py-3 px-4 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 focus:bg-white transition"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCatModal(false)}
                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleCatSubmit}
                disabled={catSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {catSaving ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    Enregistrer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SLA MODAL */}
      {showSlaModal && editingSla && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowSlaModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md mx-4">
            <div className="px-6 py-5 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="inline-block h-5 w-5 rounded-full border border-gray-200 shadow-sm" style={{ backgroundColor: editingSla.couleur }} />
                  <h3 className="text-lg font-bold text-gray-900">
                    Modifier le SLA — Priorité {prioriteLabels[editingSla.priorite]}
                  </h3>
                </div>
                <button onClick={() => setShowSlaModal(false)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Délai de prise en charge (heures) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={slaForm.delai_prise_en_charge_heures}
                  onChange={(e) => setSlaForm({ ...slaForm, delai_prise_en_charge_heures: parseInt(e.target.value) || 0 })}
                  className={inputCls('delai_prise_en_charge_heures', slaErrors)}
                />
                <p className="mt-1.5 text-xs text-gray-400">Temps maximum avant qu&apos;un ticket soit assigné</p>
                <FieldError error={slaErrors.delai_prise_en_charge_heures} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Délai de résolution (heures) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={slaForm.delai_resolution_heures}
                  onChange={(e) => setSlaForm({ ...slaForm, delai_resolution_heures: parseInt(e.target.value) || 0 })}
                  className={inputCls('delai_resolution_heures', slaErrors)}
                />
                <p className="mt-1.5 text-xs text-gray-400">Temps maximum avant qu&apos;un ticket soit résolu</p>
                <FieldError error={slaErrors.delai_resolution_heures} />
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowSlaModal(false)}
                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleSlaSubmit}
                disabled={slaSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {slaSaving ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    Enregistrer
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
