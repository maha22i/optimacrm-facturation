'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ApiResponse, ContratDetail } from '@/lib/types';
import { formatDate, formatMontant } from '@/lib/utils';
import { Card, BackLink, StatusBadge, BRAND_LINK } from '@/components/ui';

export default function ContratDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [contrat, setContrat] = useState<ContratDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get<ApiResponse<ContratDetail>>(`/contrats/${id}`)
      .then(res => setContrat(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 h-64" />
          <div className="bg-white rounded-2xl border border-gray-200/80 h-48" />
        </div>
      </div>
    );
  }

  if (!contrat) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Contrat introuvable</p>
        <Link href="/portal/contrats" className={`text-sm mt-2 inline-block ${BRAND_LINK}`}>Retour</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <BackLink href="/portal/contrats" />
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">{contrat.numero_contrat}</h1>
        <StatusBadge status={contrat.statut} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {contrat.lignes.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Lignes du contrat</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left">
                      <th className="px-5 py-2.5 font-medium text-gray-500">Désignation</th>
                      <th className="px-5 py-2.5 font-medium text-gray-500 text-right">Qté</th>
                      <th className="px-5 py-2.5 font-medium text-gray-500 text-right">P.U. HT</th>
                      <th className="px-5 py-2.5 font-medium text-gray-500 text-right">Total HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contrat.lignes.map((l, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-3 text-gray-900">{l.designation}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{l.quantite}</td>
                        <td className="px-5 py-3 text-right text-gray-600">{formatMontant(l.prix_unitaire_ht)}</td>
                        <td className="px-5 py-3 text-right font-medium text-gray-900">{formatMontant(l.total_ht)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {contrat.machines.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Machines</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left">
                      <th className="px-5 py-2.5 font-medium text-gray-500">N° série</th>
                      <th className="px-5 py-2.5 font-medium text-gray-500">Modèle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contrat.machines.map((m, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-3 text-gray-900 font-medium">{m.numero_serie}</td>
                        <td className="px-5 py-3 text-gray-600">{m.modele || m.designation || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card padded>
            <h2 className="font-semibold text-gray-900 mb-4">Informations</h2>
            <div className="space-y-3">
              <Row label="Type" value={contrat.type_contrat} />
              <Row label="Facturation" value={contrat.type_facturation} />
              <Row label="Périodicité" value={contrat.periodicite} />
              {contrat.terme_facturation && <Row label="Terme" value={contrat.terme_facturation === 'TAE' ? 'Terme à échoir' : 'Terme échu'} />}
              <Row label="Début" value={formatDate(contrat.date_debut)} />
              <Row label="Échéance" value={formatDate(contrat.date_echeance)} />
              {contrat.date_signature && <Row label="Signature" value={formatDate(contrat.date_signature)} />}
              <Row label="Durée" value={`${contrat.duree_contrat_mois} mois`} />
              {contrat.loyer_ht && <Row label="Loyer HT" value={formatMontant(contrat.loyer_ht)} />}
              {contrat.date_prochaine_facture && <Row label="Prochaine facture" value={formatDate(contrat.date_prochaine_facture)} />}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value || '—'}</span>
    </div>
  );
}
