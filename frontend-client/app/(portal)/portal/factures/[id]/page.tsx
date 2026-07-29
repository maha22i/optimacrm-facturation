'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ApiResponse, FactureDetail } from '@/lib/types';
import { formatDate, formatMontant } from '@/lib/utils';
import { Card, BackLink, StatusBadge, DownloadIcon, BRAND_LINK, BRAND_GRADIENT, BRAND_SHADOW } from '@/components/ui';

export default function FactureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [facture, setFacture] = useState<FactureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.get<ApiResponse<FactureDetail>>(`/factures/${id}`)
      .then(res => setFacture(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDownload() {
    if (!facture) return;
    setDownloading(true);
    try {
      await api.downloadPdf(`/factures/${id}/pdf`, `${facture.numero_facture}.pdf`);
    } catch { /* ignore */ }
    setDownloading(false);
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 h-64" />
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-200/80 h-40" />
            <div className="bg-white rounded-2xl border border-gray-200/80 h-52" />
          </div>
        </div>
      </div>
    );
  }

  if (!facture) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Facture introuvable</p>
        <Link href="/portal/factures" className={`text-sm mt-2 inline-block ${BRAND_LINK}`}>Retour aux factures</Link>
      </div>
    );
  }

  const displayLines = facture.lignes.filter(l => !['COMMENTAIRE', 'SOUS_TOTAL', 'SAUT_DE_LIGNE'].includes(l.type_ligne));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <BackLink href="/portal/factures" />
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">{facture.numero_facture}</h1>
        <StatusBadge status={facture.statut} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Lignes de facture</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-5 py-2.5 font-medium text-gray-500">Désignation</th>
                    <th className="px-5 py-2.5 font-medium text-gray-500 text-right">Qté</th>
                    <th className="px-5 py-2.5 font-medium text-gray-500 text-right">P.U.</th>
                    <th className="px-5 py-2.5 font-medium text-gray-500 text-right">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {displayLines.map((l, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="px-5 py-3 text-gray-900">{l.designation}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{l.quantite}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatMontant(l.prix_unitaire)}</td>
                      <td className="px-5 py-3 text-right font-medium text-gray-900">{formatMontant(l.total_ht)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card padded>
            <h2 className="font-semibold text-gray-900 mb-4">Informations</h2>
            <div className="space-y-3">
              <InfoRow label="Date" value={formatDate(facture.date_creation)} />
              <InfoRow label="Échéance" value={formatDate(facture.date_echeance)} />
              <InfoRow label="Mode de règlement" value={facture.mode_reglement} />
              {facture.periode_debut && (
                <InfoRow label="Période" value={`${formatDate(facture.periode_debut)} — ${formatDate(facture.periode_fin)}`} />
              )}
              {facture.numero_contrat && <InfoRow label="Contrat" value={facture.numero_contrat} />}
            </div>
          </Card>

          <Card padded>
            <h2 className="font-semibold text-gray-900 mb-4">Totaux</h2>
            <div className="space-y-2">
              <TotalRow label="Total HT" value={formatMontant(facture.total_ht)} />
              {parseFloat(facture.frais_techniques) > 0 && <TotalRow label="Frais techniques" value={formatMontant(facture.frais_techniques)} />}
              {parseFloat(facture.eco_contribution) > 0 && <TotalRow label="Éco-contribution" value={formatMontant(facture.eco_contribution)} />}
              <TotalRow label={`TVA (${facture.taux_tva}%)`} value={formatMontant(facture.montant_tva)} />
              <div className="border-t border-gray-100 pt-2.5 mt-1">
                <TotalRow label="Total TTC" value={formatMontant(facture.total_ttc)} bold />
              </div>
              {parseFloat(facture.total_regle) > 0 && <TotalRow label="Déjà réglé" value={formatMontant(facture.total_regle)} />}
              <div className="rounded-xl bg-[var(--brand-light)] px-3.5 py-3 mt-2">
                <TotalRow label="Net à payer" value={formatMontant(facture.net_a_payer)} bold />
              </div>
            </div>
          </Card>

          <button
            onClick={handleDownload}
            disabled={downloading}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-60 ${BRAND_GRADIENT} ${BRAND_SHADOW}`}
          >
            {downloading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <DownloadIcon className="w-4 h-4" />
            )}
            Télécharger le PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value || '—'}</span>
    </div>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
