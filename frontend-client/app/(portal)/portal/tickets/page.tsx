'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { PaginatedResponse, Ticket } from '@/lib/types';
import { formatDatetime } from '@/lib/utils';
import { Card, PageHeader, SearchInput, Pagination, StatusBadge, PrioriteBadge, EmptyState, TableSkeleton, RowLink, PlusIcon, BRAND_GRADIENT, BRAND_SHADOW, BRAND_LINK } from '@/components/ui';

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const res = await api.get<PaginatedResponse<Ticket>>(`/tickets?${params}`);
      setTickets(res.data);
      setTotalPages(res.pagination.totalPages);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        description="Suivez vos demandes d'assistance"
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
          </svg>
        }
        actions={
          <Link
            href="/portal/tickets/nouveau"
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 ${BRAND_GRADIENT} ${BRAND_SHADOW}`}
          >
            <PlusIcon className="w-4 h-4" />
            Nouveau ticket
          </Link>
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
                <th className="px-5 py-3 font-medium text-gray-500">Numéro</th>
                <th className="px-5 py-3 font-medium text-gray-500">Sujet</th>
                <th className="px-5 py-3 font-medium text-gray-500">Priorité</th>
                <th className="px-5 py-3 font-medium text-gray-500">Statut</th>
                <th className="px-5 py-3 font-medium text-gray-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={5} />
              ) : tickets.length === 0 ? (
                <tr><td colSpan={5}><EmptyState title="Aucun ticket" description="Créez un ticket pour contacter notre support." /></td></tr>
              ) : (
                tickets.map(t => (
                  <RowLink key={t.id} href={`/portal/tickets/${t.id}`} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link href={`/portal/tickets/${t.id}`} className={`font-medium ${BRAND_LINK}`}>
                        {t.numero}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-gray-900 max-w-xs truncate">{t.sujet}</td>
                    <td className="px-5 py-3.5"><PrioriteBadge priorite={t.priorite} /></td>
                    <td className="px-5 py-3.5"><StatusBadge status={t.statut} label={t.statut.replace('_', ' ')} /></td>
                    <td className="px-5 py-3.5 text-gray-500">{formatDatetime(t.created_at)}</td>
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
