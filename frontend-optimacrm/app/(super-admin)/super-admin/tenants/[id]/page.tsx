'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ApiResponse, TenantDetail, TenantUser, UserRole } from '@/lib/types';

const STATUT_BADGE: Record<string, string> = {
  actif: 'bg-green-50 text-green-700 ring-green-600/20',
  suspendu: 'bg-red-50 text-red-700 ring-red-600/20',
  inactif: 'bg-gray-100 text-gray-600 ring-gray-500/20',
};
const STATUT_DOT: Record<string, string> = {
  actif: 'bg-green-500',
  suspendu: 'bg-red-500',
  inactif: 'bg-gray-400',
};
const STATUT_LABEL: Record<string, string> = {
  actif: 'Actif',
  suspendu: 'Suspendu',
  inactif: 'Inactif',
};
const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  user: 'Utilisateur',
  admin_technique: 'Admin Technique',
  technicien: 'Technicien',
  super_admin: 'Super Admin',
  client: 'Client',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractErrorMessage(err: unknown, fallback: string): string {
  return err && typeof err === 'object' && 'message' in err
    ? (err as { message: string }).message
    : fallback;
}

const INITIAL_ADMIN_FORM = { email: '', password: '', first_name: '', last_name: '' };

// Modules optionnels — cf. plan validé : Devis, Email et Dashboard restent
// des modules socle toujours actifs (route publique de signature sans
// contexte tenant, envoi transverse, page d'atterrissage), ces 7-là sont
// les seuls pilotables par le super-admin.
const MODULES_CONFIG: { key: string; label: string; description: string }[] = [
  { key: 'tickets', label: 'Tickets & Planning', description: 'Support client, tickets par email et planification des interventions' },
  { key: 'sepa', label: 'Prélèvements SEPA', description: 'Génération des fichiers de prélèvement bancaire' },
  { key: 'parc_machines', label: 'Parc Machine', description: 'Suivi du parc installé et relevés de compteurs' },
  { key: 'contrats', label: 'Contrats', description: 'Gestion des contrats et facturation récurrente' },
  { key: 'catalogue', label: 'Catalogue', description: 'Catalogue produits, fournisseurs et marques' },
  { key: 'champs_perso', label: 'Champs personnalisés', description: 'Création de champs sur mesure (clients, devis, contrats)' },
  { key: 'journal', label: 'Journal d\u2019activité', description: 'Historique consultable des actions' },
];

// Sémantique opt-out : une clé absente ou différente de `false` = module
// actif — ne jamais tester `=== true`. Cf. lib/types.ts#Tenant.modules_actifs.
function isModuleActive(modulesActifs: Record<string, boolean> | undefined, key: string): boolean {
  return modulesActifs?.[key] !== false;
}

export default function TenantDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Formulaire "Informations" (nom / slug)
  const [editNom, setEditNom] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [infoSaved, setInfoSaved] = useState(false);

  // Suspend / réactiver
  const [statutSaving, setStatutSaving] = useState(false);
  const [statutError, setStatutError] = useState('');

  // Formulaire "Créer le premier admin"
  const [adminForm, setAdminForm] = useState(INITIAL_ADMIN_FORM);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminSuccess, setAdminSuccess] = useState('');

  // Modules — clé du toggle en cours de sauvegarde (un seul à la fois) et
  // message d'erreur par module (ex. 409 du garde-fou tickets).
  const [moduleSaving, setModuleSaving] = useState<string | null>(null);
  const [moduleErrors, setModuleErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.get<ApiResponse<TenantDetail>>(`/super-admin/tenants/${id}`);
      setTenant(res.data);
      setEditNom(res.data.nom);
      setEditSlug(res.data.slug);
    } catch (err: unknown) {
      setLoadError(extractErrorMessage(err, 'Tenant introuvable'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleSaveInfo(e: React.FormEvent) {
    e.preventDefault();
    setInfoSaving(true);
    setInfoError('');
    setInfoSaved(false);
    try {
      const res = await api.put<ApiResponse<TenantDetail>>(`/super-admin/tenants/${id}`, {
        nom: editNom,
        slug: editSlug,
      });
      setTenant((prev) => (prev ? { ...prev, ...res.data } : prev));
      setInfoSaved(true);
    } catch (err: unknown) {
      setInfoError(extractErrorMessage(err, 'Une erreur est survenue'));
    } finally {
      setInfoSaving(false);
    }
  }

  async function handleToggleStatut() {
    if (!tenant) return;
    const suspending = tenant.statut === 'actif';
    const verbe = suspending ? 'suspendre' : 'réactiver';
    if (!confirm(`Confirmer : ${verbe} le tenant "${tenant.nom}" ?\n${suspending ? 'Tous ses utilisateurs seront bloqués immédiatement.' : 'Ses utilisateurs retrouveront l\'accès immédiatement.'}`)) {
      return;
    }
    setStatutSaving(true);
    setStatutError('');
    try {
      const action = suspending ? 'suspend' : 'reactivate';
      const res = await api.post<ApiResponse<TenantDetail>>(`/super-admin/tenants/${id}/${action}`, {});
      setTenant((prev) => (prev ? { ...prev, ...res.data } : prev));
    } catch (err: unknown) {
      setStatutError(extractErrorMessage(err, 'Une erreur est survenue'));
    } finally {
      setStatutSaving(false);
    }
  }

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAdminSaving(true);
    setAdminError('');
    setAdminSuccess('');
    try {
      const res = await api.post<ApiResponse<TenantUser>>(`/super-admin/tenants/${id}/admin`, adminForm);
      setAdminSuccess(`Administrateur "${res.data.email}" créé avec succès.`);
      setAdminForm(INITIAL_ADMIN_FORM);
      load(); // rafraîchit la liste des utilisateurs + les stats
    } catch (err: unknown) {
      setAdminError(extractErrorMessage(err, 'Une erreur est survenue'));
    } finally {
      setAdminSaving(false);
    }
  }

  async function handleToggleModule(key: string) {
    if (!tenant || moduleSaving) return;
    const nextValue = !isModuleActive(tenant.modules_actifs, key);

    setModuleSaving(key);
    setModuleErrors((prev) => ({ ...prev, [key]: '' }));
    try {
      const res = await api.put<ApiResponse<TenantDetail>>(`/super-admin/tenants/${id}/modules`, { [key]: nextValue });
      setTenant((prev) => (prev ? { ...prev, ...res.data } : prev));
    } catch (err: unknown) {
      // Le toggle n'est jamais basculé de manière optimiste avant la réponse
      // (son état visuel dérive directement de `tenant.modules_actifs`) : en
      // cas d'erreur (ex. 409 du garde-fou tickets), `tenant` n'a pas été
      // modifié, donc l'UI retombe naturellement sur l'état précédent sans
      // logique de "rollback" séparée à maintenir.
      setModuleErrors((prev) => ({ ...prev, [key]: extractErrorMessage(err, 'Une erreur est survenue') }));
    } finally {
      setModuleSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-slate-800 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (loadError || !tenant) {
    return (
      <div>
        <Link href="/super-admin/tenants" className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          ← Retour aux tenants
        </Link>
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {loadError || 'Tenant introuvable'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/super-admin/tenants"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Retour aux tenants
      </Link>

      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{tenant.nom}</h1>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUT_BADGE[tenant.statut]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUT_DOT[tenant.statut]}`} />
            {STATUT_LABEL[tenant.statut] || tenant.statut}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={handleToggleStatut}
            disabled={statutSaving}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer ${
              tenant.statut === 'actif'
                ? 'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                : 'border border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            {statutSaving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {tenant.statut === 'actif' ? 'Suspendre' : 'Réactiver'}
          </button>
          {statutError && <p className="text-xs text-red-600">{statutError}</p>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Utilisateurs', value: tenant.stats.users },
          { label: 'Clients', value: tenant.stats.clients },
          { label: 'Factures', value: tenant.stats.factures },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Informations éditables */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Informations</h2>
          {infoError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{infoError}</div>
          )}
          <form onSubmit={handleSaveInfo} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={255}
                value={editNom}
                onChange={(e) => setEditNom(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={editSlug}
                onChange={(e) => setEditSlug(slugify(e.target.value))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 font-mono focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={infoSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {infoSaving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                Enregistrer
              </button>
              {infoSaved && (
                <span className="inline-flex items-center gap-1.5 text-sm text-green-600 font-medium">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Enregistré
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Créer le premier admin */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">Créer le premier admin</h2>
          {adminError && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{adminError}</div>
          )}
          {adminSuccess && (
            <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">{adminSuccess}</div>
          )}
          <form onSubmit={handleCreateAdmin} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  value={adminForm.first_name}
                  onChange={(e) => setAdminForm((f) => ({ ...f, first_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  value={adminForm.last_name}
                  onChange={(e) => setAdminForm((f) => ({ ...f, last_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={adminForm.email}
                onChange={(e) => setAdminForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                placeholder="admin@client.fr"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
              <input
                type="password"
                required
                minLength={8}
                value={adminForm.password}
                onChange={(e) => setAdminForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
                placeholder="Minimum 8 caractères"
              />
            </div>
            <button
              type="submit"
              disabled={adminSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {adminSaving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Créer l&apos;administrateur
            </button>
          </form>
        </div>
      </div>

      {/* Modules */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-800 mb-1">Modules</h2>
        <p className="text-xs text-gray-400 mb-4">Modules optionnels activables ou désactivables pour ce tenant.</p>
        <div>
          {MODULES_CONFIG.map((m) => {
            const active = isModuleActive(tenant.modules_actifs, m.key);
            const saving = moduleSaving === m.key;
            const error = moduleErrors[m.key];
            return (
              <div key={m.key} className="flex items-start justify-between gap-4 py-4 border-b border-gray-100 last:border-b-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{m.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>
                  {error && (
                    <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                      {error}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
                  {saving && (
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={active}
                    disabled={saving}
                    onClick={() => handleToggleModule(m.key)}
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      active ? 'bg-slate-900' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition ${
                        active ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Liste des utilisateurs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">Utilisateurs ({tenant.users.length})</h2>
        </div>
        {tenant.users.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">Aucun utilisateur pour l&apos;instant.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Utilisateur</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rôle</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tenant.users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 text-sm font-medium">
                        {u.first_name[0]}{u.last_name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{u.first_name} {u.last_name}</div>
                        <div className="text-sm text-gray-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      u.role === 'admin' ? 'bg-purple-50 text-purple-700'
                        : u.role === 'admin_technique' ? 'bg-blue-50 text-blue-700'
                        : u.role === 'technicien' ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.is_active ? 'text-green-700' : 'text-red-600'}`}>
                      <span className={`h-2 w-2 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                      {u.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
