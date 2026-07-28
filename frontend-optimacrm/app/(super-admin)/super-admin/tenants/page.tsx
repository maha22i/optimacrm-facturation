'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { ApiResponse, TenantWithStats } from '@/lib/types';

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

export default function TenantsListPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await api.get<ApiResponse<TenantWithStats[]>>('/super-admin/tenants');
        setTenants(res.data);
      } catch (err: unknown) {
        const message = err && typeof err === 'object' && 'message' in err
          ? (err as { message: string }).message
          : 'Erreur lors du chargement des tenants';
        setError(message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="mt-1 text-gray-600">Gérez les organisations clientes de la plateforme.</p>
        </div>
        <Link
          href="/super-admin/tenants/nouveau"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
          </svg>
          Nouveau tenant
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-slate-800 border-t-transparent rounded-full" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-gray-500">Aucun tenant pour l&apos;instant.</p>
            <Link href="/super-admin/tenants/nouveau" className="mt-2 inline-block text-sm font-medium text-slate-900 hover:underline">
              Créer le premier tenant
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Utilisateurs</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Clients</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Factures</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Créé le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tenants.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => router.push(`/super-admin/tenants/${t.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{t.nom}</div>
                    <div className="text-sm text-gray-500">{t.slug}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUT_BADGE[t.statut]}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUT_DOT[t.statut]}`} />
                      {STATUT_LABEL[t.statut] || t.statut}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-700">{t.stats.users}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-700">{t.stats.clients}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-700">{t.stats.factures}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(t.created_at).toLocaleDateString('fr-FR')}
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
