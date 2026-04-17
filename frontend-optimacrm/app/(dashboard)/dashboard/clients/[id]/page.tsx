'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type {
  ClientDetail, ClientStats, ClientAdresse, ClientContact,
  StatutClient, ApiResponse, TypeAdresse, RoleContact, TypeDocument,
  Contrat,
} from '@/lib/types';
import ChampsPersonnalisesForm from '@/components/ChampsPersonnalisesForm';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ statut }: { statut: StatutClient }) {
  const config: Record<StatutClient, { bg: string; text: string; dot: string }> = {
    ACTIF: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    PROSPECT: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
    BLOQUE: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
    INACTIF: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  };
  const c = config[statut];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {statut}
    </span>
  );
}

function StatCard({ label, value, sub, icon, borderColor, iconBg }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; borderColor: string; iconBg: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow p-5 border-l-4 ${borderColor}`}>
      <div className="flex items-start gap-4">
        <div className={`flex-shrink-0 h-10 w-10 rounded-xl ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-0.5 text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function maskIban(iban: string | null): string {
  if (!iban) return '—';
  if (iban.length <= 8) return iban;
  return `${iban.substring(0, 4)} ${'**** '.repeat(Math.max(0, Math.floor((iban.length - 8) / 4)))}${iban.substring(iban.length - 4)}`;
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
}

const DELAI_LABELS: Record<string, string> = {
  COMPTANT: 'Comptant',
  '15_JOURS': '15 jours',
  '30_JOURS': '30 jours',
  '45_JOURS_FIN_MOIS': '45 jours fin de mois',
  '60_JOURS': '60 jours',
};

const MODE_LABELS: Record<string, string> = {
  VIREMENT: 'Virement',
  PRELEVEMENT_SEPA: 'Prélèvement SEPA',
  CHEQUE: 'Chèque',
  CARTE: 'Carte bancaire',
  ESPECES: 'Espèces',
};

const TYPE_ADRESSE_LABELS: Record<TypeAdresse, string> = {
  FACTURATION: 'Facturation',
  LIVRAISON: 'Livraison',
  SIEGE: 'Siège',
};

const TYPE_ADRESSE_COLORS: Record<TypeAdresse, string> = {
  FACTURATION: 'bg-blue-50 text-blue-700',
  LIVRAISON: 'bg-amber-50 text-amber-700',
  SIEGE: 'bg-purple-50 text-purple-700',
};

const ROLE_LABELS: Record<RoleContact, string> = {
  PRINCIPAL: 'Principal',
  COMPTABILITE: 'Comptabilité',
  TECHNIQUE: 'Technique',
  AUTRE: 'Autre',
};

const ROLE_COLORS: Record<RoleContact, string> = {
  PRINCIPAL: 'bg-blue-50 text-blue-700',
  COMPTABILITE: 'bg-emerald-50 text-emerald-700',
  TECHNIQUE: 'bg-amber-50 text-amber-700',
  AUTRE: 'bg-gray-100 text-gray-600',
};

const DOC_TYPE_LABELS: Record<TypeDocument, string> = {
  CONTRAT: 'Contrat',
  RIB: 'RIB',
  MANDAT_SEPA: 'Mandat SEPA',
  BON_COMMANDE: 'Bon de commande',
  AUTRE: 'Autre',
};

const AVATAR_GRADIENTS = [
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-purple-500 to-pink-500',
  'from-pink-500 to-rose-500',
  'from-cyan-500 to-blue-500',
];

function getAvatarGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5 text-sm font-medium shadow-lg backdrop-blur ${
      type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'
    }`}>
      {type === 'success' ? (
        <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
      ) : (
        <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
      )}
      {message}
      <button onClick={onClose} className="ml-1 hover:opacity-70 cursor-pointer">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation Modal
// ---------------------------------------------------------------------------

function ConfirmModal({ title, message, onConfirm, onCancel }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center">
            <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <p className="text-sm text-gray-600 ml-[52px]">{message}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
          <button onClick={onConfirm} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition cursor-pointer">Confirmer</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Input class helper
// ---------------------------------------------------------------------------

const inputCls = 'w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-3.5 text-sm text-gray-900 outline-none transition focus:bg-white focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20';
const selectCls = inputCls;
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';

// ---------------------------------------------------------------------------
// Address Form Modal
// ---------------------------------------------------------------------------

function AdresseFormModal({ adresse, onSave, onCancel }: {
  adresse?: ClientAdresse; onSave: (data: Record<string, unknown>) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    type: adresse?.type || 'FACTURATION',
    est_defaut: adresse?.est_defaut || false,
    ligne1: adresse?.ligne1 || '',
    ligne2: adresse?.ligne2 || '',
    code_postal: adresse?.code_postal || '',
    ville: adresse?.ville || '',
    pays: adresse?.pays || 'France',
    label: adresse?.label || '',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <svg className="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{adresse ? 'Modifier l\'adresse' : 'Nouvelle adresse'}</h3>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as TypeAdresse }))} className={selectCls}>
                <option value="FACTURATION">Facturation</option>
                <option value="LIVRAISON">Livraison</option>
                <option value="SIEGE">Siège</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Label</label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Ex: Siège Paris" className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Adresse ligne 1 *</label>
            <input value={form.ligne1} onChange={e => setForm(f => ({ ...f, ligne1: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Adresse ligne 2</label>
            <input value={form.ligne2} onChange={e => setForm(f => ({ ...f, ligne2: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Code postal *</label>
              <input value={form.code_postal} onChange={e => setForm(f => ({ ...f, code_postal: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Ville *</label>
              <input value={form.ville} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Pays</label>
              <input value={form.pays} onChange={e => setForm(f => ({ ...f, pays: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.est_defaut} onChange={e => setForm(f => ({ ...f, est_defaut: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
            <span className="text-sm text-gray-700">Adresse par défaut</span>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
          <button onClick={() => onSave(form)} className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-violet-700 hover:to-indigo-700 transition shadow-sm cursor-pointer">Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contact Form Modal
// ---------------------------------------------------------------------------

function ContactFormModal({ contact, onSave, onCancel }: {
  contact?: ClientContact; onSave: (data: Record<string, unknown>) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    role: contact?.role || 'PRINCIPAL',
    nom: contact?.nom || '',
    prenom: contact?.prenom || '',
    fonction: contact?.fonction || '',
    telephone: contact?.telephone || '',
    mobile: contact?.mobile || '',
    email: contact?.email || '',
    est_principal: contact?.est_principal || false,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <svg className="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">{contact ? 'Modifier le contact' : 'Nouveau contact'}</h3>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nom *</label>
              <input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Prénom *</label>
              <input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Rôle</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as RoleContact }))} className={selectCls}>
                <option value="PRINCIPAL">Principal</option>
                <option value="COMPTABILITE">Comptabilité</option>
                <option value="TECHNIQUE">Technique</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Fonction</label>
              <input value={form.fonction} onChange={e => setForm(f => ({ ...f, fonction: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Téléphone</label>
              <input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Mobile</label>
              <input value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form.est_principal} onChange={e => setForm(f => ({ ...f, est_principal: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
            <span className="text-sm text-gray-700">Contact principal</span>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer">Annuler</button>
          <button onClick={() => onSave(form)} className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-violet-700 hover:to-indigo-700 transition shadow-sm cursor-pointer">Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info row helper
// ---------------------------------------------------------------------------

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className="flex-shrink-0 mt-0.5 text-gray-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium text-gray-900 mt-0.5 break-words">{children}</p>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, dotColor }: { icon: React.ReactNode; title: string; dotColor: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      <span className="text-gray-400">{icon}</span>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">{title}</h3>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type Tab = 'infos' | 'adresses' | 'contacts' | 'contrats' | 'documents' | 'historique';

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('infos');
  const [showIban, setShowIban] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const [adresseModal, setAdresseModal] = useState<{ open: boolean; adresse?: ClientAdresse }>({ open: false });
  const [contactModal, setContactModal] = useState<{ open: boolean; contact?: ClientContact }>({ open: false });
  const [clientContrats, setClientContrats] = useState<Contrat[]>([]);

  const fetchClient = useCallback(async () => {
    try {
      const [clientRes, statsRes, contratsRes] = await Promise.all([
        api.get<ApiResponse<ClientDetail>>(`/clients/${clientId}`),
        api.get<ApiResponse<ClientStats>>(`/clients/${clientId}/stats`),
        api.get<ApiResponse<Contrat[]>>(`/contrats/client/${clientId}`),
      ]);
      setClient(clientRes.data);
      setStats(statsRes.data);
      setClientContrats(contratsRes.data);
    } catch {
      setToast({ message: 'Erreur lors du chargement du client', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchClient(); }, [fetchClient]);

  const handleDelete = async () => {
    try {
      await api.delete(`/clients/${clientId}`);
      setToast({ message: 'Client passé en inactif', type: 'success' });
      setTimeout(() => router.push('/dashboard/clients'), 1000);
    } catch {
      setToast({ message: 'Erreur lors de la suppression', type: 'error' });
    }
    setShowDeleteConfirm(false);
  };

  const handleSaveAdresse = async (data: Record<string, unknown>) => {
    try {
      if (adresseModal.adresse) {
        await api.put(`/clients/${clientId}/adresses/${adresseModal.adresse.id}`, data);
        setToast({ message: 'Adresse mise à jour', type: 'success' });
      } else {
        await api.post(`/clients/${clientId}/adresses`, data);
        setToast({ message: 'Adresse ajoutée', type: 'success' });
      }
      setAdresseModal({ open: false });
      fetchClient();
    } catch {
      setToast({ message: 'Erreur lors de la sauvegarde', type: 'error' });
    }
  };

  const handleDeleteAdresse = async (adresseId: number) => {
    try {
      await api.delete(`/clients/${clientId}/adresses/${adresseId}`);
      setToast({ message: 'Adresse supprimée', type: 'success' });
      fetchClient();
    } catch {
      setToast({ message: 'Erreur lors de la suppression', type: 'error' });
    }
  };

  const handleSaveContact = async (data: Record<string, unknown>) => {
    try {
      if (contactModal.contact) {
        await api.put(`/clients/${clientId}/contacts/${contactModal.contact.id}`, data);
        setToast({ message: 'Contact mis à jour', type: 'success' });
      } else {
        await api.post(`/clients/${clientId}/contacts`, data);
        setToast({ message: 'Contact ajouté', type: 'success' });
      }
      setContactModal({ open: false });
      fetchClient();
    } catch {
      setToast({ message: 'Erreur lors de la sauvegarde', type: 'error' });
    }
  };

  const handleDeleteContact = async (contactId: number) => {
    try {
      await api.delete(`/clients/${clientId}/contacts/${contactId}`);
      setToast({ message: 'Contact supprimé', type: 'success' });
      fetchClient();
    } catch {
      setToast({ message: 'Erreur lors de la suppression', type: 'error' });
    }
  };

  const handleDeleteDocument = async (docId: number) => {
    try {
      await api.delete(`/clients/${clientId}/documents/${docId}`);
      setToast({ message: 'Document supprimé', type: 'success' });
      fetchClient();
    } catch {
      setToast({ message: 'Erreur lors de la suppression', type: 'error' });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-violet-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!client) {
    return <div className="text-center py-20 text-gray-500">Client non trouvé</div>;
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'infos', label: 'Informations', icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg> },
    { id: 'adresses', label: `Adresses (${client.adresses.length})`, icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg> },
    { id: 'contacts', label: `Contacts (${client.contacts.length})`, icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg> },
    { id: 'contrats', label: `Contrats (${clientContrats.length})`, icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75h6m-6 3h4" /></svg> },
    { id: 'documents', label: `Documents (${client.documents.length})`, icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg> },
    { id: 'historique', label: 'Historique', icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg> },
  ];

  const initials = client.raison_sociale.substring(0, 2).toUpperCase();

  return (
    <div className="min-h-screen">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {showDeleteConfirm && (
        <ConfirmModal
          title="Supprimer ce client ?"
          message={`Le client "${client.raison_sociale}" sera passé en inactif. Cette action est irréversible.`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      {adresseModal.open && (
        <AdresseFormModal
          adresse={adresseModal.adresse}
          onSave={handleSaveAdresse}
          onCancel={() => setAdresseModal({ open: false })}
        />
      )}
      {contactModal.open && (
        <ContactFormModal
          contact={contactModal.contact}
          onSave={handleSaveContact}
          onCancel={() => setContactModal({ open: false })}
        />
      )}

      {/* Breadcrumb */}
      <button onClick={() => router.push('/dashboard/clients')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-violet-600 mb-6 transition group cursor-pointer">
        <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
        Retour aux clients
      </button>

      {/* Blocage alert */}
      {client.statut === 'BLOQUE' && client.blocage_raison && (
        <div className="mb-6 rounded-2xl bg-red-50 border border-red-100 p-4 flex items-start gap-3">
          <div className="flex-shrink-0 h-9 w-9 rounded-xl bg-red-100 flex items-center justify-center">
            <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-red-800">Client bloqué</p>
            <p className="text-sm text-red-700 mt-0.5">{client.blocage_raison}</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-5">
            <div className={`h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-violet-500/25`}>
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{client.raison_sociale}</h1>
                <StatusBadge statut={client.statut} />
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-lg bg-gray-100 px-2.5 py-0.5 text-xs font-mono font-medium text-gray-500">
                  {client.numero_client}
                </span>
                {client.forme_juridique && (
                  <span className="text-xs text-gray-400">{client.forme_juridique}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/dashboard/clients/${clientId}/modifier`)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
              Modifier
            </button>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="rounded-xl border border-gray-200 bg-white p-2.5 text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition cursor-pointer"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" /></svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-gray-100 shadow-xl py-1.5 z-10">
                  <button
                    onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }}
                    className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 transition flex items-center gap-2.5 cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="CA Total"
            value={formatCurrency(stats.ca_total)}
            borderColor="border-l-blue-500"
            iconBg="bg-blue-50"
            icon={<svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>}
          />
          <StatCard
            label="Factures en attente"
            value={String(stats.factures_en_attente)}
            sub={formatCurrency(stats.montant_en_attente)}
            borderColor="border-l-amber-500"
            iconBg="bg-amber-50"
            icon={<svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>}
          />
          <StatCard
            label="Solde dû"
            value={formatCurrency(stats.solde_du)}
            borderColor="border-l-red-500"
            iconBg="bg-red-50"
            icon={<svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>}
          />
          <StatCard
            label="Contrats actifs"
            value={String(stats.nb_contrats_actifs)}
            borderColor="border-l-emerald-500"
            iconBg="bg-emerald-50"
            icon={<svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" /></svg>}
          />
        </div>
      )}

      {/* Tabs */}
      <div className="bg-gray-100 rounded-2xl p-1 mb-6 inline-flex gap-0.5">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'infos' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Identité */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <SectionHeader
                dotColor="bg-violet-500"
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>}
                title="Identité"
              />
              <div className="divide-y divide-gray-50">
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" /></svg>} label="Raison sociale">
                  {client.raison_sociale}
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>} label="Forme juridique">
                  {client.forme_juridique}
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm-3.375 6.498h4.5a2.625 2.625 0 0 0-4.5 0Z" /></svg>} label="SIRET">
                  <span className="font-mono text-xs">{client.siret || '—'}</span>
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm-3.375 6.498h4.5a2.625 2.625 0 0 0-4.5 0Z" /></svg>} label="SIREN">
                  <span className="font-mono text-xs">{client.siren || '—'}</span>
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>} label="TVA Intracommunautaire">
                  <span className="font-mono text-xs">{client.tva_intracommunautaire || '—'}</span>
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>} label="Code APE">
                  <span className="font-mono text-xs">{client.code_ape || '—'}</span>
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>} label="Site web">
                  {client.site_web ? (
                    <a href={client.site_web} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:text-violet-700 hover:underline">{client.site_web}</a>
                  ) : '—'}
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>} label="Téléphone">
                  {client.telephone_principal || '—'}
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>} label="Email principal">
                  {client.email_principal ? (
                    <a href={`mailto:${client.email_principal}`} className="text-violet-600 hover:text-violet-700 hover:underline">{client.email_principal}</a>
                  ) : '—'}
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>} label="Email comptabilité">
                  {client.email_comptabilite ? (
                    <a href={`mailto:${client.email_comptabilite}`} className="text-violet-600 hover:text-violet-700 hover:underline">{client.email_comptabilite}</a>
                  ) : '—'}
                </InfoRow>
              </div>
            </div>

            {/* Conditions commerciales */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <SectionHeader
                dotColor="bg-indigo-500"
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>}
                title="Conditions commerciales"
              />
              <div className="divide-y divide-gray-50">
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>} label="Délai de paiement">
                  {DELAI_LABELS[client.delai_paiement] || client.delai_paiement}
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" /></svg>} label="Mode de paiement">
                  {client.mode_paiement_prefere ? (MODE_LABELS[client.mode_paiement_prefere] || client.mode_paiement_prefere) : '—'}
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>} label="Remise globale">
                  {client.remise_globale}%
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>} label="Plafond encours">
                  {client.plafond_encours !== null ? formatCurrency(client.plafond_encours) : '—'}
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" /></svg>} label="Taux TVA par défaut">
                  {client.taux_tva_defaut}%
                </InfoRow>
                <InfoRow icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>} label="Devise">
                  {client.devise}
                </InfoRow>
              </div>
            </div>
          </div>

          {/* Bancaire */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <SectionHeader
              dotColor="bg-blue-500"
              icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" /></svg>}
              title="Informations bancaires"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">IBAN</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium font-mono text-gray-900">{showIban ? (client.iban || '—') : maskIban(client.iban)}</span>
                  {client.iban && (
                    <button onClick={() => setShowIban(!showIban)} className="text-gray-400 hover:text-violet-600 transition cursor-pointer">
                      {showIban ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">BIC</p>
                <p className="text-sm font-medium font-mono text-gray-900">{client.bic || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Mandat SEPA</p>
                <p className="text-sm font-medium text-gray-900">
                  {client.reference_mandat_sepa || '—'}
                  {client.date_mandat_sepa && <span className="text-xs text-gray-400 ml-2">({new Date(client.date_mandat_sepa).toLocaleDateString('fr-FR')})</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {client.notes && (
            <div className="bg-yellow-50/60 rounded-2xl border border-amber-100 shadow-sm p-6 border-l-4 border-l-amber-400">
              <div className="flex items-center gap-2.5 mb-3">
                <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Notes</h3>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{client.notes}</p>
            </div>
          )}

          {/* Champs personnalisés (système unifié) */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <SectionHeader
              dotColor="bg-violet-400"
              icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" /></svg>}
              title="Champs personnalisés"
            />
            <ChampsPersonnalisesForm
              entite="CLIENT"
              entiteId={client.id}
              readOnly
            />
          </div>
        </div>
      )}

      {/* Adresses Tab */}
      {activeTab === 'adresses' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setAdresseModal({ open: true })} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:from-violet-700 hover:to-indigo-700 transition shadow-sm cursor-pointer">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Ajouter une adresse
            </button>
          </div>
          {client.adresses.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
              </div>
              <p className="text-sm text-gray-500">Aucune adresse enregistrée</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {client.adresses.map(a => (
                <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                        <svg className="h-4 w-4 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" /></svg>
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_ADRESSE_COLORS[a.type]}`}>{TYPE_ADRESSE_LABELS[a.type]}</span>
                      {a.est_defaut && <span className="rounded-full bg-violet-50 text-violet-700 px-2.5 py-0.5 text-xs font-medium">Par défaut</span>}
                      {a.label && <span className="text-xs text-gray-400">{a.label}</span>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setAdresseModal({ open: true, adresse: a })} className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition cursor-pointer">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
                      </button>
                      <button onClick={() => handleDeleteAdresse(a.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                      </button>
                    </div>
                  </div>
                  <div className="ml-10">
                    <p className="text-sm font-medium text-gray-900">{a.ligne1}</p>
                    {a.ligne2 && <p className="text-sm text-gray-600">{a.ligne2}</p>}
                    <p className="text-sm text-gray-600">{a.code_postal} {a.ville}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.pays}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Contacts Tab */}
      {activeTab === 'contacts' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setContactModal({ open: true })} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:from-violet-700 hover:to-indigo-700 transition shadow-sm cursor-pointer">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Ajouter un contact
            </button>
          </div>
          {client.contacts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
              </div>
              <p className="text-sm text-gray-500">Aucun contact enregistré</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {client.contacts.map(c => {
                const contactInitials = `${c.prenom[0] || ''}${c.nom[0] || ''}`.toUpperCase();
                const gradient = getAvatarGradient(`${c.nom}${c.prenom}`);
                return (
                  <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-sm font-semibold shadow-sm`}>{contactInitials}</div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{c.prenom} {c.nom}</p>
                          {c.fonction && <p className="text-xs text-gray-500">{c.fonction}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setContactModal({ open: true, contact: c })} className="p-1.5 rounded-lg text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition cursor-pointer">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
                        </button>
                        <button onClick={() => handleDeleteContact(c.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLORS[c.role]}`}>{ROLE_LABELS[c.role]}</span>
                      {c.est_principal && <span className="rounded-full bg-violet-50 text-violet-700 px-2.5 py-0.5 text-xs font-medium">Principal</span>}
                    </div>
                    <div className="space-y-2 text-sm">
                      {c.email && (
                        <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-gray-600 hover:text-violet-600 transition">
                          <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                          {c.email}
                        </a>
                      )}
                      {c.telephone && (
                        <a href={`tel:${c.telephone}`} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition">
                          <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" /></svg>
                          {c.telephone}
                        </a>
                      )}
                      {c.mobile && (
                        <a href={`tel:${c.mobile}`} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition">
                          <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg>
                          {c.mobile}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Contrats Tab */}
      {activeTab === 'contrats' && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => router.push(`/dashboard/contrats/nouveau?client_id=${clientId}`)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:from-violet-700 hover:to-indigo-700 transition shadow-sm cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Nouveau contrat
            </button>
          </div>
          {clientContrats.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
              </div>
              <p className="text-sm text-gray-500">Aucun contrat pour ce client</p>
              <p className="text-xs text-gray-400 mt-1">Créez un nouveau contrat pour commencer</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">N° Contrat</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Machine / Service</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Périodicité</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Échéance</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Statut</th>
                    <th className="text-right px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Montant HT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clientContrats.map(ct => {
                    const typeColors: Record<string, string> = {
                      Copieur: 'bg-blue-50 text-blue-700',
                      Telephonie: 'bg-green-50 text-green-700',
                      Informatique: 'bg-purple-50 text-purple-700',
                      Securite: 'bg-orange-50 text-orange-700',
                    };
                    const statutColors: Record<string, string> = {
                      Actif: 'text-emerald-700 bg-emerald-50',
                      Brouillon: 'text-gray-600 bg-gray-50',
                      Suspendu: 'text-amber-700 bg-amber-50',
                      'Résilié': 'text-red-700 bg-red-50',
                      'Échu': 'text-gray-500 bg-gray-50',
                    };
                    const mht = typeof ct.montant_ht === 'string' ? parseFloat(ct.montant_ht) : (ct.montant_ht || 0);
                    return (
                      <tr
                        key={ct.id}
                        onClick={() => router.push(`/dashboard/contrats/${ct.id}`)}
                        className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{ct.numero_contrat}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ring-current/20 ${typeColors[ct.type_contrat] || ''}`}>
                            {ct.type_contrat === 'Telephonie' ? 'Téléphonie' : ct.type_contrat === 'Securite' ? 'Sécurité' : ct.type_contrat}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-[200px]">{ct.machines_resume || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{ct.periodicite}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{ct.date_echeance ? new Date(ct.date_echeance).toLocaleDateString('fr-FR') : '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ring-current/20 ${statutColors[ct.statut] || ''}`}>
                            {ct.statut}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                          {mht.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div>
          <div className="flex justify-end mb-4">
            <button className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition shadow-sm cursor-pointer opacity-50" disabled title="Upload à venir">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Ajouter un document
            </button>
          </div>
          {client.documents.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
              </div>
              <p className="text-sm text-gray-500">Aucun document</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
              {client.documents.map(d => (
                <div key={d.id} className="flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 transition">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                      <svg className="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{d.nom}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{DOC_TYPE_LABELS[d.type]} — {new Date(d.created_at).toLocaleDateString('fr-FR')}</p>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteDocument(d.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Historique Tab */}
      {activeTab === 'historique' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          </div>
          <p className="text-sm font-medium text-gray-600">Les factures et devis apparaîtront ici</p>
          <p className="text-xs text-gray-400 mt-1.5">Cette fonctionnalité sera disponible dans un prochain sprint</p>
        </div>
      )}
    </div>
  );
}
