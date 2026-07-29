'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { ApiResponse, DashboardData } from '@/lib/types';
import { formatDate, formatMontant } from '@/lib/utils';
import { Card, StatCard, StatusBadge, ArrowRightIcon, BRAND_GRADIENT, BRAND_SHADOW, BRAND_LINK } from '@/components/ui';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ApiResponse<DashboardData>>('/dashboard')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-7 w-64 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200/80 p-6 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
              <div className="h-9 bg-gray-100 rounded w-1/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-gray-400 capitalize">{today}</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900">
          {greeting()}, {user?.first_name} 👋
        </h1>
        <p className="mt-1.5 text-sm text-gray-500">Voici un aperçu de votre espace client.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          href="/portal/factures"
          label="Factures en attente"
          value={data.factures_en_attente}
          accent="indigo"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          }
        />
        <StatCard
          href="/portal/tickets"
          label="Tickets ouverts"
          value={data.tickets_ouverts}
          accent="fuchsia"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padded>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Dernière facture</h2>
            <Link href="/portal/factures" className={`text-xs font-medium flex items-center gap-1 ${BRAND_LINK}`}>
              Tout voir <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </div>
          {data.derniere_facture ? (
            <Link
              href="/portal/factures"
              className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 p-4 transition-colors hover:border-[var(--brand-light)] hover:bg-[var(--brand-light)]"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{data.derniere_facture.numero_facture}</p>
                <p className="mt-1 text-xs text-gray-400">{formatDate(data.derniere_facture.date_creation)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-base font-semibold text-gray-900">{formatMontant(data.derniere_facture.total_ttc)}</span>
                <StatusBadge status={data.derniere_facture.statut} />
              </div>
            </Link>
          ) : (
            <p className="text-sm text-gray-400 py-6 text-center">Aucune facture pour le moment</p>
          )}
        </Card>

        <Card padded>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Dernier ticket</h2>
            <Link href="/portal/tickets" className={`text-xs font-medium flex items-center gap-1 ${BRAND_LINK}`}>
              Tout voir <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </div>
          {data.dernier_ticket ? (
            <Link
              href="/portal/tickets"
              className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 p-4 transition-colors hover:border-[var(--brand-light)] hover:bg-[var(--brand-light)]"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{data.dernier_ticket.numero}</p>
                <p className="mt-1 text-xs text-gray-500 truncate">{data.dernier_ticket.sujet}</p>
              </div>
              <StatusBadge status={data.dernier_ticket.statut} label={data.dernier_ticket.statut.replace('_', ' ')} />
            </Link>
          ) : (
            <p className="text-sm text-gray-400 py-6 text-center">Aucun ticket pour le moment</p>
          )}
        </Card>
      </div>

      <Card padded className="bg-[linear-gradient(120deg,var(--brand-light),white)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Besoin d&apos;assistance ?</h2>
            <p className="mt-1 text-xs text-gray-500">Ouvrez un ticket et notre équipe vous répondra rapidement.</p>
          </div>
          <Link
            href="/portal/tickets/nouveau"
            className={`${BRAND_GRADIENT} ${BRAND_SHADOW} inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110`}
          >
            Créer un ticket
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </Card>
    </div>
  );
}
