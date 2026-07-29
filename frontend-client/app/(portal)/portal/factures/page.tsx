'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { PaginatedResponse, Facture } from '@/lib/types';
import { formatDate, formatMontant } from '@/lib/utils';
import { Card, PageHeader, SearchInput, Pagination, StatusBadge, EmptyState, TableSkeleton, DownloadIcon, RowLink, BRAND_LINK, BRAND_SPINNER } from '@/components/ui';

export default function FacturesPage() {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const res = await api.get<PaginatedResponse<Facture>>(`/factures?${params}`);
      setFactures(res.data);
      setTotalPages(res.pagination.totalPages);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  async function handleDownload(id: number, numero: string) {
    setDownloadingId(id);
    try {
      await api.downloadPdf(`/factures/${id}/pdf`, `${numero}.pdf`);
    } catch { /* ignore */ }
    setDownloadingId(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Factures"
        description="Consultez et téléchargez vos factures"
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        }
      />

      <Card>
        <div className="p-4 border-b border-gray-100">
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Rechercher par numéro..." />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-5 py-3 font-medium text-gray-500">Numéro</th>
                <th className="px-5 py-3 font-medium text-gray-500">Date</th>
                <th className="px-5 py-3 font-medium text-gray-500">Échéance</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-right">Total TTC</th>
                <th className="px-5 py-3 font-medium text-gray-500">Statut</th>
                <th className="px-5 py-3 font-medium text-gray-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton cols={6} />
              ) : factures.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title="Aucune facture" description="Vos factures apparaîtront ici." /></td></tr>
              ) : (
                factures.map(f => (
                  <RowLink key={f.id} href={`/portal/factures/${f.id}`} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link href={`/portal/factures/${f.id}`} className={`font-medium ${BRAND_LINK}`}>
                        {f.numero_facture}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{formatDate(f.date_creation)}</td>
                    <td className="px-5 py-3.5 text-gray-600">{formatDate(f.date_echeance)}</td>
                    <td className="px-5 py-3.5 text-right font-medium text-gray-900">{formatMontant(f.total_ttc)}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={f.statut} /></td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleDownload(f.id, f.numero_facture)}
                        disabled={downloadingId === f.id}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[var(--brand-light)] hover:text-[var(--brand)] disabled:opacity-50"
                        title="Télécharger le PDF"
                      >
                        {downloadingId === f.id ? (
                          <span className={`h-4 w-4 animate-spin rounded-full border-2 ${BRAND_SPINNER}`} />
                        ) : (
                          <DownloadIcon className="w-5 h-5" />
                        )}
                      </button>
                    </td>
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
