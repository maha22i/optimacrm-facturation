'use client';

import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface ClientAccount {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  client_id: number | null;
  client_raison_sociale: string | null;
  created_at: string;
}

interface ClientOption {
  id: number;
  raison_sociale: string;
  numero_client: string;
}

interface PaginatedRes<T> {
  success: boolean;
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export default function EspaceClientPage() {
  const { hasPermission } = useAuth();
  const canDeleteUsers = hasPermission('users_delete');
  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<PaginatedRes<ClientAccount>>('/auth/users?role=client&limit=100');
      setAccounts(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(userId: string, isActive: boolean) {
    try {
      await api.put(`/auth/users/${userId}`, { is_active: !isActive });
      load();
    } catch { /* ignore */ }
  }

  async function deleteAccount(userId: string) {
    if (!confirm('Supprimer ce compte client ?')) return;
    try {
      await api.delete(`/auth/users/${userId}`);
      load();
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Espace client</h1>
          <p className="text-sm text-gray-500 mt-1">Gerez les comptes de connexion de vos clients au portail</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Creer un compte
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-500">Nom</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Email</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Client</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-50 animate-pulse">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded w-24" /></td>
                  ))}
                </tr>
              ))
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Aucun compte client. Creez-en un pour donner acces au portail client.
                </td>
              </tr>
            ) : (
              accounts.map(a => (
                <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.first_name} {a.last_name}</td>
                  <td className="px-4 py-3 text-gray-600">{a.email}</td>
                  <td className="px-4 py-3 text-gray-600">{a.client_raison_sociale || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${a.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {a.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleActive(a.id, a.is_active)}
                        className="text-xs px-2.5 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        {a.is_active ? 'Desactiver' : 'Activer'}
                      </button>
                      {canDeleteUsers && (
                      <button
                        onClick={() => deleteAccount(a.id)}
                        className="text-xs px-2.5 py-1 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                      >
                        Supprimer
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && <CreateAccountModal onClose={() => setShowModal(false)} onCreated={load} />}
    </div>
  );
}

function CreateAccountModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clientListOpen, setClientListOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedClient = clients.find(c => String(c.id) === clientId);
  const searchTerm = selectedClient ? '' : clientSearch.trim().toLowerCase();
  const filteredClients = searchTerm
    ? clients.filter(c =>
        c.raison_sociale?.toLowerCase().includes(searchTerm) ||
        c.numero_client?.toLowerCase().includes(searchTerm))
    : clients;

  useEffect(() => {
    api.get<PaginatedRes<ClientOption>>('/clients?limit=500')
      .then(res => setClients(res.data))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clientId) { setError('Selectionnez un client'); return; }
    setError('');
    setSaving(true);
    try {
      await api.post('/auth/users', {
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        role: 'client',
        client_id: parseInt(clientId),
      });
      onCreated();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Nouveau compte client</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prenom</label>
              <input
                required minLength={2}
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
              <input
                required minLength={2}
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email" required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe temporaire</label>
            <input
              type="password" required minLength={8}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client rattache</label>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setClientId(''); setClientListOpen(true); }}
                onFocus={() => setClientListOpen(true)}
                onBlur={() => setTimeout(() => setClientListOpen(false), 150)}
                placeholder="Rechercher un client (nom ou numero)..."
                className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
              />
              {clientSearch && (
                <button
                  type="button"
                  onClick={() => { setClientSearch(''); setClientId(''); setClientListOpen(true); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  aria-label="Effacer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {clientListOpen && (
                <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg text-sm">
                  {filteredClients.length === 0 ? (
                    <li className="px-3 py-2 text-gray-400">Aucun client trouve</li>
                  ) : (
                    filteredClients.map(c => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            setClientId(String(c.id));
                            setClientSearch(`${c.raison_sociale} (${c.numero_client})`);
                            setClientListOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 hover:bg-blue-50 ${String(c.id) === clientId ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                        >
                          {c.raison_sociale} <span className="text-gray-400">({c.numero_client})</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creation...' : 'Creer le compte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
