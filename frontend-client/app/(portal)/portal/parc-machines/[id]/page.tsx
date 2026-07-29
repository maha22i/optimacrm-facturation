'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ApiResponse, MachineDetail } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { Card, BackLink, StatusBadge, BRAND_LINK } from '@/components/ui';

export default function MachineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [machine, setMachine] = useState<MachineDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ApiResponse<MachineDetail>>(`/parc-machines/${id}`)
      .then(res => setMachine(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-gray-200/80 h-64" />
          <div className="bg-white rounded-2xl border border-gray-200/80 h-64" />
        </div>
      </div>
    );
  }

  if (!machine) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Machine introuvable</p>
        <Link href="/portal/parc-machines" className={`text-sm mt-2 inline-block ${BRAND_LINK}`}>Retour</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <BackLink href="/portal/parc-machines" />
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">{machine.designation || machine.numero_serie}</h1>
        <StatusBadge status={machine.statut} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padded>
          <h2 className="font-semibold text-gray-900 mb-4">Informations</h2>
          <div className="space-y-3">
            <Row label="N° série" value={machine.numero_serie} />
            {machine.matricule && <Row label="Matricule" value={machine.matricule} />}
            <Row label="Marque" value={machine.marque} />
            <Row label="Modèle" value={machine.modele} />
            <Row label="Catégorie" value={machine.categorie} />
            {machine.site_installation && <Row label="Site" value={machine.site_installation} />}
            {machine.date_installation && <Row label="Installation" value={formatDate(machine.date_installation)} />}
            {machine.date_fin_garantie && <Row label="Fin garantie" value={formatDate(machine.date_fin_garantie)} />}
            {machine.numero_contrat && <Row label="Contrat" value={machine.numero_contrat} />}
          </div>
        </Card>

        <div className="space-y-6">
          <Card padded>
            <h2 className="font-semibold text-gray-900 mb-4">Compteurs actuels</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-gradient-to-br from-gray-50 to-gray-100/60 p-4 text-center">
                <p className="text-xs font-medium text-gray-500 mb-1.5">N&amp;B</p>
                <p className="text-2xl font-semibold text-gray-900">{machine.dernier_compteur_nb?.toLocaleString('fr-FR') ?? '—'}</p>
              </div>
              <div className="rounded-xl bg-[var(--brand-light)] p-4 text-center">
                <p className="text-xs font-medium text-gray-500 mb-1.5">Couleur</p>
                <p className="text-2xl font-semibold text-gray-900">{machine.dernier_compteur_couleur?.toLocaleString('fr-FR') ?? '—'}</p>
              </div>
            </div>
            {machine.date_dernier_releve && (
              <p className="text-xs text-gray-400 mt-4 text-center">Relevé du {formatDate(machine.date_dernier_releve)}</p>
            )}
          </Card>

          {machine.derniers_releves.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Historique relevés</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-5 py-2.5 text-left font-medium text-gray-500">Date</th>
                      <th className="px-5 py-2.5 text-right font-medium text-gray-500">N&amp;B</th>
                      <th className="px-5 py-2.5 text-right font-medium text-gray-500">Couleur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machine.derniers_releves.map(r => (
                      <tr key={r.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-3 text-gray-600">{formatDate(r.date_releve)}</td>
                        <td className="px-5 py-3 text-right text-gray-900">{r.compteur_nb?.toLocaleString('fr-FR') ?? '—'}</td>
                        <td className="px-5 py-3 text-right text-gray-900">{r.compteur_couleur?.toLocaleString('fr-FR') ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
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
