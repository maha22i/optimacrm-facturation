'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ApiResponse, TicketDetail } from '@/lib/types';
import { formatDatetime } from '@/lib/utils';
import { Card, BackLink, StatusBadge, PrioriteBadge, BRAND_LINK, BRAND_GRADIENT_DIAGONAL, BRAND_GRADIENT, BRAND_FOCUS, BRAND_SHADOW_SM } from '@/components/ui';

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  function load() {
    api.get<ApiResponse<TicketDetail>>(`/tickets/${id}`)
      .then(res => setTicket(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setSending(true);
    try {
      await api.post(`/tickets/${id}/commentaires`, { contenu: comment });
      setComment('');
      load();
    } catch { /* ignore */ }
    setSending(false);
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 h-64" />
          <div className="bg-white rounded-2xl border border-gray-200/80 h-40" />
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Ticket introuvable</p>
        <Link href="/portal/tickets" className={`text-sm mt-2 inline-block ${BRAND_LINK}`}>Retour</Link>
      </div>
    );
  }

  const isClosed = ticket.statut === 'resolu' || ticket.statut === 'cloture';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <BackLink href="/portal/tickets" />
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">{ticket.numero}</h1>
        <StatusBadge status={ticket.statut} label={ticket.statut.replace('_', ' ')} />
        <PrioriteBadge priorite={ticket.priorite} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card padded>
            <h2 className="font-semibold text-gray-900 mb-2">{ticket.sujet}</h2>
            {ticket.description && (
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Commentaires ({ticket.commentaires.length})</h2>
            </div>

            <div className="divide-y divide-gray-50">
              {ticket.commentaires.length === 0 ? (
                <p className="px-5 py-10 text-sm text-gray-400 text-center">Aucun commentaire pour l&apos;instant</p>
              ) : (
                ticket.commentaires.map(c => {
                  const name = c.user_nom || 'Système';
                  const initials = name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
                  return (
                    <div key={c.id} className="px-5 py-4 flex gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${BRAND_GRADIENT_DIAGONAL}`}>
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900">{name}</span>
                          <span className="text-xs text-gray-400">{formatDatetime(c.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{c.contenu}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {!isClosed ? (
              <form onSubmit={handleComment} className="p-5 border-t border-gray-100 bg-gray-50/40">
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Ajouter un commentaire..."
                  rows={3}
                  className={`w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all resize-none ${BRAND_FOCUS}`}
                />
                <div className="flex justify-end mt-3">
                  <button
                    type="submit"
                    disabled={sending || !comment.trim()}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:shadow-none transition-all ${BRAND_GRADIENT} ${BRAND_SHADOW_SM}`}
                  >
                    {sending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                    {sending ? 'Envoi...' : 'Envoyer'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/60 text-center text-xs text-gray-400">
                Ce ticket est {ticket.statut === 'resolu' ? 'résolu' : 'clôturé'}, il n&apos;est plus possible d&apos;ajouter de commentaire.
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card padded>
            <h2 className="font-semibold text-gray-900 mb-4">Informations</h2>
            <div className="space-y-3">
              <InfoRow label="Créé le" value={formatDatetime(ticket.created_at)} />
              <InfoRow label="Mis à jour" value={formatDatetime(ticket.updated_at)} />
              {ticket.categorie_nom && <InfoRow label="Catégorie" value={ticket.categorie_nom} />}
              {ticket.machine_numero_serie && (
                <InfoRow label="Machine" value={`${ticket.machine_designation || ''} (${ticket.machine_numero_serie})`} />
              )}
            </div>
          </Card>
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
