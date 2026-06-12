'use client';

import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type { User, PaginatedResponse, PermissionKey, UserRole } from '@/lib/types';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  user: 'Utilisateur',
  admin_technique: 'Admin Technique',
  technicien: 'Technicien',
};

interface CreateUserForm {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role: UserRole;
}

interface PermissionDef {
  key: string;
  label: string;
}

interface PermissionGroup {
  group: string;
  permissions: PermissionDef[];
}

const INITIAL_FORM: CreateUserForm = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  role: 'user',
};

export default function UsersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', email: '', password: '', role: 'user' as UserRole });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [resetSuccess, setResetSuccess] = useState('');

  const [permTarget, setPermTarget] = useState<User | null>(null);
  const [permGroups, setPermGroups] = useState<PermissionGroup[]>([]);
  const [permSelected, setPermSelected] = useState<Set<string>>(new Set());
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permSaved, setPermSaved] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isAdminTechnique = user?.role === 'admin_technique';
  const canManageUsers = isAdmin || isAdminTechnique;

  useEffect(() => {
    if (user && !canManageUsers) {
      router.push('/dashboard');
    }
  }, [user, router, canManageUsers]);

  useEffect(() => {
    if (!canManageUsers) return;

    async function fetchUsers() {
      setLoading(true);
      try {
        const res = await api.get<PaginatedResponse<User>>(`/auth/users?page=${page}&limit=20`);
        setUsers(res.data);
        setTotalPages(res.pagination.totalPages);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }

    fetchUsers();
  }, [page, user]);

  async function toggleActive(target: User) {
    try {
      await api.put(`/auth/users/${target.id}`, { is_active: !target.is_active });
      setUsers((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, is_active: !u.is_active } : u)),
      );
    } catch {
      // silently fail
    }
  }

  async function changeRole(target: User, newRole: UserRole) {
    try {
      await api.put(`/auth/users/${target.id}`, { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, role: newRole } : u)),
      );
    } catch {
      // silently fail
    }
  }

  async function deleteUser(target: User) {
    if (!confirm(`Supprimer ${target.first_name} ${target.last_name} ?`)) return;
    try {
      await api.delete(`/auth/users/${target.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
    } catch {
      // silently fail
    }
  }

  function openCreateModal() {
    setCreateForm(isAdminTechnique ? { ...INITIAL_FORM, role: 'technicien' } : INITIAL_FORM);
    setCreateError('');
    setShowCreateModal(true);
  }

  function openEditModal(target: User) {
    setEditForm({
      first_name: target.first_name,
      last_name: target.last_name,
      email: target.email,
      password: '',
      role: target.role as UserRole,
    });
    setEditError('');
    setShowEditPassword(false);
    setResetSuccess('');
    setEditTarget(target);
  }

  async function handleEditUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setEditSaving(true);
    setEditError('');

    try {
      const payload: Record<string, unknown> = {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        email: editForm.email,
        role: editForm.role,
      };
      if (editForm.password.trim().length > 0) {
        if (editForm.password.trim().length < 8) {
          setEditError('Le mot de passe doit contenir au moins 8 caractères');
          setEditSaving(false);
          return;
        }
        payload.password = editForm.password;
      }

      const res = await api.put<{ data: User }>(`/auth/users/${editTarget.id}`, payload);
      setUsers((prev) => prev.map((u) => (u.id === editTarget.id ? { ...u, ...res.data } : u)));
      setEditTarget(null);
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Une erreur est survenue';
      setEditError(message);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleSendResetLink() {
    if (!editTarget) return;
    setResetSending(true);
    setResetSuccess('');
    setEditError('');
    try {
      await api.post(`/auth/users/${editTarget.id}/reset-password-link`, {});
      setResetSuccess(`Lien envoyé à ${editTarget.email}`);
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Erreur lors de l\'envoi';
      setEditError(message);
    } finally {
      setResetSending(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');

    try {
      const res = await api.post<{ data: User }>('/auth/users', createForm);
      setUsers((prev) => [res.data, ...prev]);
      setShowCreateModal(false);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : 'Une erreur est survenue';
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }

  async function openPermissions(target: User) {
    setPermTarget(target);
    setPermLoading(true);
    setPermSaved(false);

    try {
      const [groupsRes, userPermsRes] = await Promise.all([
        api.get<{ data: PermissionGroup[] }>('/permissions/available'),
        api.get<{ data: string[] }>(`/permissions/user/${target.id}`),
      ]);
      setPermGroups(groupsRes.data);
      setPermSelected(new Set(userPermsRes.data));
    } catch {
      // silently fail
    } finally {
      setPermLoading(false);
    }
  }

  function togglePermission(key: string) {
    setPermSaved(false);
    setPermSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(group: PermissionGroup) {
    setPermSaved(false);
    const groupKeys = group.permissions.map((p) => p.key);
    const allSelected = groupKeys.every((k) => permSelected.has(k));
    setPermSelected((prev) => {
      const next = new Set(prev);
      groupKeys.forEach((k) => (allSelected ? next.delete(k) : next.add(k)));
      return next;
    });
  }

  function selectAll() {
    setPermSaved(false);
    const allKeys = permGroups.flatMap((g) => g.permissions.map((p) => p.key));
    setPermSelected(new Set(allKeys));
  }

  function deselectAll() {
    setPermSaved(false);
    setPermSelected(new Set());
  }

  async function savePermissions() {
    if (!permTarget) return;
    setPermSaving(true);
    try {
      await api.put(`/permissions/user/${permTarget.id}`, {
        permissions: Array.from(permSelected),
      });
      setPermSaved(true);
    } catch {
      // silently fail
    } finally {
      setPermSaving(false);
    }
  }

  if (!user || !canManageUsers) return null;

  const allPermKeys = permGroups.flatMap((g) => g.permissions.map((p) => p.key));
  const allChecked = allPermKeys.length > 0 && allPermKeys.every((k) => permSelected.has(k));

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isAdminTechnique ? 'Gestion des techniciens' : 'Gestion des utilisateurs'}
          </h1>
          <p className="mt-1 text-gray-600">
            {isAdminTechnique
              ? 'Créez et gérez les comptes techniciens.'
              : 'Gérez les comptes, les rôles et les accès des utilisateurs.'}
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
          </svg>
          Nouvel utilisateur
        </button>
      </div>

      {/* Modal de création */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div ref={modalRef} className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Créer un utilisateur</h2>
              <button onClick={() => setShowCreateModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {createError && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{createError}</div>
            )}
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                  <input type="text" required minLength={2} maxLength={100} value={createForm.first_name} onChange={(e) => setCreateForm((f) => ({ ...f, first_name: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Jean" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                  <input type="text" required minLength={2} maxLength={100} value={createForm.last_name} onChange={(e) => setCreateForm((f) => ({ ...f, last_name: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Dupont" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" required value={createForm.email} onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="jean.dupont@exemple.fr" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
                <div className="relative">
                  <input type={showCreatePassword ? 'text' : 'password'} required minLength={8} value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Minimum 8 caractères" />
                  <button type="button" onClick={() => setShowCreatePassword(!showCreatePassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition cursor-pointer">
                    {showCreatePassword ? (
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                    ) : (
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                {isAdminTechnique ? (
                  <input type="text" readOnly value="Technicien" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 outline-none" />
                ) : (
                  <select value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as UserRole }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer">
                    <option value="user">Utilisateur</option>
                    <option value="admin">Administrateur</option>
                    <option value="admin_technique">Admin Technique</option>
                    <option value="technicien">Technicien</option>
                  </select>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">Annuler</button>
                <button type="submit" disabled={creating} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer">
                  {creating && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de modification */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEditTarget(null)} />
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Modifier l&apos;utilisateur</h2>
              <button onClick={() => setEditTarget(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {editError && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{editError}</div>
            )}
            {resetSuccess && (
              <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                {resetSuccess}
              </div>
            )}
            <form onSubmit={handleEditUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                  <input type="text" required minLength={2} maxLength={100} value={editForm.first_name} onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                  <input type="text" required minLength={2} maxLength={100} value={editForm.last_name} onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" required value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                {isAdminTechnique ? (
                  <input type="text" readOnly value="Technicien" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 outline-none" />
                ) : (
                  <select value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as UserRole }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer">
                    <option value="user">Utilisateur</option>
                    <option value="admin">Administrateur</option>
                    <option value="admin_technique">Admin Technique</option>
                    <option value="technicien">Technicien</option>
                  </select>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nouveau mot de passe
                  <span className="ml-1 text-xs font-normal text-gray-400">optionnel</span>
                </label>
                <div className="relative">
                  <input type={showEditPassword ? 'text' : 'password'} value={editForm.password} onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Laisser vide pour ne pas changer" />
                  <button type="button" onClick={() => setShowEditPassword(!showEditPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition cursor-pointer">
                    {showEditPassword ? (
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                    ) : (
                      <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-gray-400">Minimum 8 caractères. Laissez vide si vous ne souhaitez pas le modifier.</p>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleSendResetLink}
                  disabled={resetSending}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {resetSending ? (
                    <><div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />Envoi en cours...</>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                      Envoyer un lien de réinitialisation par email
                    </>
                  )}
                </button>
                <p className="mt-1.5 text-xs text-gray-400 text-center">Un email avec un lien sécurisé (valable 24h) sera envoyé à {editTarget.email}</p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditTarget(null)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">Annuler</button>
                <button type="submit" disabled={editSaving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer">
                  {editSaving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de permissions */}
      {permTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setPermTarget(null)} />
          <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Permissions d&apos;accès</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {permTarget.first_name} {permTarget.last_name}
                  {permTarget.role === 'admin' && (
                    <span className="ml-2 inline-flex rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                      Admin — accès total
                    </span>
                  )}
                </p>
              </div>
              <button onClick={() => setPermTarget(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {permLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
                </div>
              ) : permTarget.role === 'admin' ? (
                <div className="rounded-lg bg-purple-50 border border-purple-200 px-4 py-6 text-center">
                  <p className="text-sm text-purple-800 font-medium">Les administrateurs ont automatiquement accès à toutes les fonctionnalités.</p>
                  <p className="text-xs text-purple-600 mt-1">Rétrogradez cet utilisateur en &quot;user&quot; pour gérer ses permissions individuellement.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium text-gray-900">{permSelected.size}</span> permission{permSelected.size > 1 ? 's' : ''} activée{permSelected.size > 1 ? 's' : ''}
                    </p>
                    <div className="flex items-center gap-2">
                      <button onClick={selectAll} disabled={allChecked} className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-300 cursor-pointer">
                        Tout cocher
                      </button>
                      <span className="text-gray-300">|</span>
                      <button onClick={deselectAll} disabled={permSelected.size === 0} className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-300 cursor-pointer">
                        Tout décocher
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {permGroups.map((group) => {
                      const groupKeys = group.permissions.map((p) => p.key);
                      const groupAllSelected = groupKeys.every((k) => permSelected.has(k));
                      const groupSomeSelected = groupKeys.some((k) => permSelected.has(k));

                      return (
                        <div key={group.group} className="rounded-lg border border-gray-200 overflow-hidden">
                          <button
                            onClick={() => toggleGroup(group)}
                            className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                          >
                            <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                              groupAllSelected
                                ? 'bg-blue-600 border-blue-600'
                                : groupSomeSelected
                                  ? 'bg-blue-100 border-blue-400'
                                  : 'border-gray-300'
                            }`}>
                              {groupAllSelected && (
                                <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                              {!groupAllSelected && groupSomeSelected && (
                                <div className="h-2 w-2 rounded-sm bg-blue-500" />
                              )}
                            </div>
                            <span className="text-sm font-semibold text-gray-800">{group.group}</span>
                            <span className="ml-auto text-xs text-gray-400">
                              {groupKeys.filter((k) => permSelected.has(k)).length}/{groupKeys.length}
                            </span>
                          </button>
                          <div className="divide-y divide-gray-100">
                            {group.permissions.map((perm) => {
                              const checked = permSelected.has(perm.key);
                              return (
                                <label
                                  key={perm.key}
                                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50/50 transition-colors cursor-pointer"
                                >
                                  <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
                                    checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                                  }`}>
                                    {checked && (
                                      <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    )}
                                  </div>
                                  <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={checked}
                                    onChange={() => togglePermission(perm.key)}
                                  />
                                  <span className="text-sm text-gray-700">{perm.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {permTarget.role !== 'admin' && !permLoading && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 shrink-0 rounded-b-xl">
                <div>
                  {permSaved && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-green-600 font-medium">
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Permissions enregistrées
                    </span>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setPermTarget(null)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    Fermer
                  </button>
                  <button
                    onClick={savePermissions}
                    disabled={permSaving}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {permSaving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                    Enregistrer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Utilisateur</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rôle</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Inscrit le</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-medium">
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
                      {ROLE_LABELS[u.role as UserRole] || u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.is_active ? 'text-green-700' : 'text-red-600'}`}>
                      <span className={`h-2 w-2 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                      {u.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(u.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                    {u.id !== user.id ? (
                      <>
                        <button
                          onClick={() => openEditModal(u)}
                          className="text-gray-600 hover:text-gray-800 font-medium cursor-pointer"
                        >
                          Modifier
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => openPermissions(u)}
                            className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                          >
                            Permissions
                          </button>
                        )}
                        <button
                          onClick={() => toggleActive(u)}
                          className="text-amber-600 hover:text-amber-800 font-medium cursor-pointer"
                        >
                          {u.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => deleteUser(u)}
                            className="text-red-600 hover:text-red-800 font-medium cursor-pointer"
                          >
                            Supprimer
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-gray-400 text-xs">Vous</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50 cursor-pointer"
            >
              Précédent
            </button>
            <span className="text-sm text-gray-600">Page {page} sur {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md disabled:opacity-50 hover:bg-gray-50 cursor-pointer"
            >
              Suivant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
