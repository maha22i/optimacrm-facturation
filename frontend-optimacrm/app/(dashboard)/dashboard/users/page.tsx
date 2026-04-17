'use client';

import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type { User, PaginatedResponse, PermissionKey } from '@/lib/types';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface CreateUserForm {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
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
  const modalRef = useRef<HTMLDivElement>(null);

  const [permTarget, setPermTarget] = useState<User | null>(null);
  const [permGroups, setPermGroups] = useState<PermissionGroup[]>([]);
  const [permSelected, setPermSelected] = useState<Set<string>>(new Set());
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permSaved, setPermSaved] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, router]);

  useEffect(() => {
    if (user?.role !== 'admin') return;

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

  async function toggleRole(target: User) {
    const newRole = target.role === 'admin' ? 'user' : 'admin';
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
    setCreateForm(INITIAL_FORM);
    setCreateError('');
    setShowCreateModal(true);
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

  if (!user || user.role !== 'admin') return null;

  const allPermKeys = permGroups.flatMap((g) => g.permissions.map((p) => p.key));
  const allChecked = allPermKeys.length > 0 && allPermKeys.every((k) => permSelected.has(k));

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des utilisateurs</h1>
          <p className="mt-1 text-gray-600">Gérez les comptes, les rôles et les accès des utilisateurs.</p>
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
                <input type="password" required minLength={8} value={createForm.password} onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Minimum 8 caractères" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                <select value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value as 'admin' | 'user' }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer">
                  <option value="user">Utilisateur</option>
                  <option value="admin">Administrateur</option>
                </select>
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
                      u.role === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {u.role}
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
                    {u.id !== user.id && (
                      <>
                        <button
                          onClick={() => openPermissions(u)}
                          className="text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                        >
                          Permissions
                        </button>
                        <button
                          onClick={() => toggleRole(u)}
                          className="text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
                        >
                          {u.role === 'admin' ? 'Rétrograder' : 'Promouvoir'}
                        </button>
                        <button
                          onClick={() => toggleActive(u)}
                          className="text-amber-600 hover:text-amber-800 font-medium cursor-pointer"
                        >
                          {u.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                        <button
                          onClick={() => deleteUser(u)}
                          className="text-red-600 hover:text-red-800 font-medium cursor-pointer"
                        >
                          Supprimer
                        </button>
                      </>
                    )}
                    {u.id === user.id && (
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
