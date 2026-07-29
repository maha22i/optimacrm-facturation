'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { PaginatedResponse, Machine } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { Card, PageHeader, SearchInput, Pagination, StatusBadge, EmptyState, TableSkeleton, RowLink, BRAND_LINK } from '@/components/ui';

export default function ParcMachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const res = await api.get<PaginatedResponse<Machine>>(`/parc-machines?${params}`);
      setMachines(res.data);
      setTotalPages(res.pagination.totalPages);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parc machines"
        description="Vos équipements et leurs relevés"
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
          </svg>
        }
      />

      <Card>
        <div className="p-4 border-b border-gray-100">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-5 py-3 font-medium text-gray-500">N° série</th>
                <th className="px-5 py-3 font-medium text-gray-500">Désignation</th>
                <th className="px-5 py-3 font-medium text-gray-500">Marque / Modèle</th>
                <th className="px-5 py-3 font-medium text-gray-500">Catégorie</th>
                <th className="px-5 py-3 font-medium text-gray-500">Statut</th>
                <th className="px-5 py-3 font-medium text-gray-500">Dernier relevé</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : machines.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title="Aucune machine" description="Votre parc de machines apparaîtra ici." /></td></tr>
              ) : (
                machines.map(m => (
                  <RowLink key={m.id} href={`/portal/parc-machines/${m.id}`} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link href={`/portal/parc-machines/${m.id}`} className={`font-medium ${BRAND_LINK}`}>
                        {m.numero_serie}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-gray-900">{m.designation || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-600">{[m.marque, m.modele].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-5 py-3.5 text-gray-600">{m.categorie}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={m.statut} /></td>
                    <td className="px-5 py-3.5 text-gray-500">{formatDate(m.date_dernier_releve)}</td>
                  </RowLink>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </Card>
    </div>
  );
}
