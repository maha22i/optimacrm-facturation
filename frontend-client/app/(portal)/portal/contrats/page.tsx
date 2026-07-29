'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { PaginatedResponse, Contrat } from '@/lib/types';
import { formatDate, formatMontant } from '@/lib/utils';
import { Card, PageHeader, Pagination, StatusBadge, EmptyState, TableSkeleton, RowLink, BRAND_LINK } from '@/components/ui';

export default function ContratsPage() {
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      const res = await api.get<PaginatedResponse<Contrat>>(`/contrats?${params}`);
      setContrats(res.data);
      setTotalPages(res.pagination.totalPages);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contrats"
        description="Retrouvez l'ensemble de vos contrats"
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
          </svg>
        }
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-5 py-3 font-medium text-gray-500">Numéro</th>
                <th className="px-5 py-3 font-medium text-gray-500">Type</th>
                <th className="px-5 py-3 font-medium text-gray-500">Statut</th>
                <th className="px-5 py-3 font-medium text-gray-500">Début</th>
                <th className="px-5 py-3 font-medium text-gray-500">Échéance</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-right">Loyer HT</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : contrats.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title="Aucun contrat" description="Vos contrats apparaîtront ici." /></td></tr>
              ) : (
                contrats.map(c => (
                  <RowLink key={c.id} href={`/portal/contrats/${c.id}`} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link href={`/portal/contrats/${c.id}`} className={`font-medium ${BRAND_LINK}`}>
                        {c.numero_contrat}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{c.type_contrat}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={c.statut} /></td>
                    <td className="px-5 py-3.5 text-gray-600">{formatDate(c.date_debut)}</td>
                    <td className="px-5 py-3.5 text-gray-600">{formatDate(c.date_echeance)}</td>
                    <td className="px-5 py-3.5 text-right font-medium text-gray-900">{c.loyer_ht ? formatMontant(c.loyer_ht) : '—'}</td>
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
