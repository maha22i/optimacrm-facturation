'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';
import type { TicketDetail, Ticket, ApiResponse, User, StatutTicket } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';

const STATUT_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  nouveau: { label: 'Nouveau', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  assigne: { label: 'Assigné', bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  en_cours: { label: 'En cours', bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  en_attente: { label: 'En attente', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  resolu: { label: 'Terminé', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
};

const PRIORITE_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  basse: { label: 'Basse', bg: 'bg-gray-100', text: 'text-gray-600' },
  normale: { label: 'Normale', bg: 'bg-blue-50', text: 'text-blue-700' },
  haute: { label: 'Haute', bg: 'bg-amber-50', text: 'text-amber-700' },
  urgente: { label: 'Urgente', bg: 'bg-red-50', text: 'text-red-700' },
};

const TRANSITIONS: Record<string, string[]> = {
  nouveau: ['assigne'],
  assigne: ['en_cours', 'nouveau'],
  en_cours: ['en_attente', 'resolu', 'nouveau'],
  en_attente: ['assigne', 'en_cours', 'nouveau'],
  resolu: [],
};

const AVATAR_GRADIENTS = [
  'from-blue-500 to-indigo-600', 'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600', 'from-purple-500 to-pink-600',
];

function getGradient(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const ticketId = params.id as string;

  const isTechnicien = user?.role === 'technicien';

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [clientTicketCount, setClientTicketCount] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [showStatutDropdown, setShowStatutDropdown] = useState(false);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [showStatutModal, setShowStatutModal] = useState<string | null>(null);
  const [statutMotif, setStatutMotif] = useState('');
  const [statutChanging, setStatutChanging] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [commentText, setCommentText] = useState('');
  const [commentInterne, setCommentInterne] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const statutRef = useRef<HTMLDivElement>(null);
  const assignRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (statutRef.current && !statutRef.current.contains(e.target as Node)) setShowStatutDropdown(false);
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) setShowAssignDropdown(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchTicket = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<TicketDetail>>(`/tickets/${ticketId}`);
      setTicket(res.data);
    } catch {
      setToast({ message: 'Erreur lors du chargement du ticket', type: 'error' });
    }
  }, [ticketId]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<User[]>>('/auth/users');
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
  }, []);

  const fetchClientTickets = useCallback(async (clientId: number) => {
    try {
      const res = await api.get<ApiResponse<Ticket[]>>(`/clients/${clientId}/tickets`);
      setClientTicketCount(Array.isArray(res.data) ? res.data.length : 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchTicket(), fetchUsers()]);
      setLoading(false);
    })();
  }, [fetchTicket, fetchUsers]);

  useEffect(() => {
    if (ticket?.client_id) fetchClientTickets(ticket.client_id);
  }, [ticket?.client_id, fetchClientTickets]);

  const isResolutionModal = showStatutModal === 'resolu' && isTechnicien;
  const resolutionMotifValid = !isResolutionModal || (statutMotif.trim().length >= 10);

  const handleChangeStatut = async () => {
    if (!showStatutModal) return;
    if (isResolutionModal && !resolutionMotifValid) {
      setToast({ message: 'Veuillez décrire le problème et la solution (min. 10 caractères)', type: 'error' });
      return;
    }
    setStatutChanging(true);
    try {
      await api.put(`/tickets/${ticketId}/statut`, { statut: showStatutModal, motif: statutMotif || undefined });
      setToast({ message: `Statut changé en "${(STATUT_CONFIG[showStatutModal] || {}).label || showStatutModal}"`, type: 'success' });
      setShowStatutModal(null);
      setStatutMotif('');
      fetchTicket();
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    } finally {
      setStatutChanging(false);
    }
  };

  const handleAssign = async (userId: string | null) => {
    try {
      await api.put(`/tickets/${ticketId}/assigner`, { technicien_id: userId });
      setToast({ message: 'Technicien assigné', type: 'success' });
      setShowAssignDropdown(false);
      fetchTicket();
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await api.delete(`/tickets/${ticketId}`);
      setToast({ message: 'Ticket supprimé', type: 'success' });
      setTimeout(() => router.push('/dashboard/tickets'), 500);
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
      setDeleteLoading(false);
    }
    setShowDeleteConfirm(false);
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      await api.post(`/tickets/${ticketId}/commentaires`, {
        contenu: commentText,
        est_interne: commentInterne,
        pieces_jointes: [],
      });
      setCommentText('');
      setCommentInterne(false);
      setToast({ message: 'Commentaire ajouté', type: 'success' });
      fetchTicket();
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    } finally {
      setSubmittingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="animate-spin h-10 w-10 border-[3px] border-blue-600 border-t-transparent rounded-full" />
        <p className="mt-4 text-sm text-gray-400">Chargement du ticket…</p>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="h-16 w-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
          <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-gray-500">Ticket introuvable</p>
        <button onClick={() => router.push('/dashboard/tickets')} className="mt-4 text-sm font-semibold text-blue-600 hover:text-blue-700 cursor-pointer">
          ← Retour aux tickets
        </button>
      </div>
    );
  }

  const sc = STATUT_CONFIG[ticket.statut] || STATUT_CONFIG.nouveau;
  const pc = PRIORITE_CONFIG[ticket.priorite] || PRIORITE_CONFIG.normale;
  const isTermine = ticket.statut === 'resolu';
  const transitions = TRANSITIONS[ticket.statut] || [];
  const canAssign = ['admin', 'admin_technique'].includes(user?.role || '') && !isTermine;
  const canDelete = ['admin', 'admin_technique'].includes(user?.role || '') && !isTermine;
  const canModify = !isTermine;
  const techNom = ticket.technicien_prenom && ticket.technicien_nom_famille
    ? `${ticket.technicien_prenom} ${ticket.technicien_nom_famille}` : null;
  const createurNom = ticket.createur_prenom && ticket.createur_nom_famille
    ? `${ticket.createur_prenom} ${ticket.createur_nom_famille}` : null;

  function computeSlaProgress(created: string, deadline: string | null, realized: string | null) {
    if (!deadline) return null;
    const createdMs = new Date(created).getTime();
    const deadlineMs = new Date(deadline).getTime();
    const totalMs = deadlineMs - createdMs;
    if (totalMs <= 0) return { percent: 100, elapsed: 0, total: 0 };

    const now = realized ? new Date(realized).getTime() : Date.now();
    const elapsedMs = now - createdMs;
    const percent = Math.min(200, (elapsedMs / totalMs) * 100);
    return {
      percent,
      elapsed: Math.round(elapsedMs / 3600000 * 10) / 10,
      total: Math.round(totalMs / 3600000 * 10) / 10,
      deadlineStr: formatDate(deadline),
    };
  }

  function slaBarColor(percent: number) {
    if (percent > 100) return 'bg-red-500';
    if (percent > 80) return 'bg-orange-500';
    if (percent > 50) return 'bg-yellow-500';
    return 'bg-emerald-500';
  }

  const slaPrise = computeSlaProgress(ticket.created_at, ticket.sla_prise_en_charge_echeance, ticket.date_prise_en_charge);
  const slaResolution = computeSlaProgress(ticket.created_at, ticket.sla_resolution_echeance, ticket.date_resolution);

  return (
    <div>
      {/* Breadcrumb */}
      <button onClick={() => router.push('/dashboard/tickets')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 mb-6 transition group cursor-pointer">
        <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Retour aux tickets
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1 text-sm font-mono font-bold text-gray-700">
                {ticket.numero}
              </span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${pc.bg} ${pc.text} ${ticket.priorite === 'urgente' ? 'animate-pulse' : ''}`}>
                {pc.label}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${sc.bg} ${sc.text}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                {sc.label}
              </span>
              {ticket.source === 'email' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700" title="Ticket créé depuis un email entrant">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                  Via mail
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{ticket.sujet}</h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Assigner — visible uniquement pour admin et admin_technique */}
            {canAssign && (
              <div className="relative" ref={assignRef}>
                <button
                  onClick={() => setShowAssignDropdown(!showAssignDropdown)}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  Assigner
                  <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {showAssignDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl border border-gray-100 shadow-xl py-1.5 z-20 max-h-60 overflow-y-auto">
                    <button onClick={() => handleAssign(null)} className="w-full px-4 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 transition cursor-pointer italic">
                      Désassigner
                    </button>
                    {users.map(u => (
                      <button
                        key={u.id}
                        onClick={() => handleAssign(u.id)}
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition cursor-pointer flex items-center gap-2 ${ticket.technicien_id === u.id ? 'text-blue-600 font-semibold' : 'text-gray-700'}`}
                      >
                        <div className={`h-6 w-6 rounded-lg bg-gradient-to-br ${getGradient(`${u.first_name} ${u.last_name}`)} flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>
                          {u.first_name[0]}{u.last_name[0]}
                        </div>
                        {u.first_name} {u.last_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Changer statut */}
            {transitions.length > 0 && (
              <div className="relative" ref={statutRef}>
                <button
                  onClick={() => setShowStatutDropdown(!showStatutDropdown)}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                  Changer statut
                  <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {showStatutDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl border border-gray-100 shadow-xl py-1.5 z-20">
                    {transitions.map(s => {
                      const cfg = STATUT_CONFIG[s] || STATUT_CONFIG.nouveau;
                      return (
                        <button
                          key={s}
                          onClick={() => { setShowStatutDropdown(false); setShowStatutModal(s); }}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition cursor-pointer flex items-center gap-2"
                        >
                          <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Modifier */}
            {canModify && (
              <button
                onClick={() => router.push(`/dashboard/tickets/${ticketId}/modifier`)}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                </svg>
                Modifier
              </button>
            )}

            {/* Supprimer — visible uniquement pour admin et admin_technique */}
            {canDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-xl border border-red-200 bg-white p-2 text-red-500 hover:bg-red-50 transition cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column (60%) */}
        <div className="lg:col-span-3 space-y-6">
          {/* Informations */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Informations</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Client</p>
                {ticket.client_id ? (
                  <Link href={`/dashboard/clients/${ticket.client_id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
                    {ticket.client_nom || `Client #${ticket.client_id}`}
                  </Link>
                ) : (
                  <span className="text-sm text-gray-400 italic">Non rapproché</span>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Machine</p>
                {ticket.machine_id ? (
                  <Link href={`/dashboard/parc-machines/${ticket.machine_id}`} className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline">
                    {ticket.machine_designation || ticket.machine_numero_serie || `Machine #${ticket.machine_id}`}
                  </Link>
                ) : (
                  <span className="text-sm text-gray-400 italic">Aucune</span>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Catégorie</p>
                {ticket.categorie_nom ? (
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${ticket.categorie_couleur}15`, color: ticket.categorie_couleur || '#6B7280' }}>
                    {ticket.categorie_nom}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">—</span>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Priorité</p>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${pc.bg} ${pc.text}`}>
                  {pc.label}
                </span>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Technicien</p>
                {techNom ? (
                  <div className="flex items-center gap-2">
                    <div className={`h-6 w-6 rounded-lg bg-gradient-to-br ${getGradient(techNom)} flex items-center justify-center text-white text-[9px] font-bold`}>
                      {techNom.split(' ').map(w => w[0]).join('').substring(0, 2)}
                    </div>
                    <span className="text-sm font-medium text-gray-800">{techNom}</span>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 italic">Non assigné</span>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Créé par</p>
                <span className="text-sm text-gray-800">{createurNom || '—'}</span>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Créé le</p>
                <span className="text-sm text-gray-800">{formatDate(ticket.created_at)}</span>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Dernière mise à jour</p>
                <span className="text-sm text-gray-800">{formatDate(ticket.updated_at)}</span>
              </div>
            </div>
          </div>

          {/* Encart "Reçu par email" */}
          {ticket.source === 'email' && (
            <div className="bg-violet-50 rounded-2xl border border-violet-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded-xl bg-violet-100 flex items-center justify-center">
                  <svg className="h-4 w-4 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-violet-900 uppercase tracking-wider">Reçu par email</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-violet-500 mb-0.5">Expéditeur</p>
                  <p className="text-sm font-medium text-violet-900 break-all">{ticket.email_from || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-violet-500 mb-0.5">Reçu le</p>
                  <p className="text-sm font-medium text-violet-900">
                    {ticket.email_received_at ? formatDate(ticket.email_received_at) : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Diagnostic & Résolution — affiché quand le ticket est terminé */}
          {isTermine && (() => {
            const resolutionEntry = [...(ticket.historique || [])].reverse().find(h => h.nouveau_statut === 'resolu' && h.motif);
            if (!resolutionEntry) return null;
            return (
              <div className="bg-emerald-50 rounded-2xl border border-emerald-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-emerald-900 uppercase tracking-wider">Diagnostic & Résolution</h3>
                    <p className="text-xs text-emerald-600">
                      par {resolutionEntry.user_nom || 'Inconnu'} — {formatDate(resolutionEntry.created_at)}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-emerald-900 whitespace-pre-wrap leading-relaxed">{resolutionEntry.motif}</p>
              </div>
            );
          })()}

          {/* Description */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">Description</h3>
            {ticket.description ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">Aucune description</p>
            )}
            {ticket.pieces_jointes && ticket.pieces_jointes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2">Pièces jointes</p>
                <div className="flex flex-wrap gap-3">
                  {ticket.pieces_jointes.map((pj, i) => {
                    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(pj);
                    if (isImage) {
                      return (
                        <a key={i} href={pj} target="_blank" rel="noopener noreferrer" className="block">
                          <img src={pj} alt={`Pièce jointe ${i + 1}`} className="h-24 w-24 rounded-xl object-cover border border-gray-200 hover:opacity-80 transition" />
                        </a>
                      );
                    }
                    const filename = pj.split('/').pop() || `Fichier ${i + 1}`;
                    return (
                      <a key={i} href={pj} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 transition">
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                        </svg>
                        {filename}
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Commentaires */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4">
              Commentaires ({ticket.commentaires?.length || 0})
            </h3>

            {/* Thread */}
            {ticket.commentaires && ticket.commentaires.length > 0 ? (
              <div className="space-y-4 mb-6">
                {ticket.commentaires.map(c => (
                  <div key={c.id} className={`rounded-xl p-4 ${c.est_interne ? 'bg-yellow-50 border border-yellow-100' : 'bg-gray-50 border border-gray-100'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`h-7 w-7 rounded-lg bg-gradient-to-br ${getGradient(c.user_nom || 'U')} flex items-center justify-center text-white text-[9px] font-bold`}>
                          {(c.user_nom || 'U').split(' ').map(w => w[0]).join('').substring(0, 2)}
                        </div>
                        <span className="text-sm font-semibold text-gray-800">{c.user_nom || 'Utilisateur'}</span>
                        {c.est_interne && (
                          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-700">Note interne</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">{formatDate(c.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.contenu}</p>
                    {c.pieces_jointes && c.pieces_jointes.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {c.pieces_jointes.map((pj, idx) => {
                          const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(pj);
                          if (isImg) {
                            return (
                              <a key={idx} href={pj} target="_blank" rel="noopener noreferrer" className="block">
                                <img src={pj} alt="pièce jointe" className="h-20 w-20 rounded-lg object-cover border border-gray-200" />
                              </a>
                            );
                          }
                          const fname = pj.split('/').pop() || `Fichier ${idx + 1}`;
                          return (
                            <a key={idx} href={pj} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 transition">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" /></svg>
                              {fname}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic mb-6">Aucun commentaire</p>
            )}

            {/* Add comment form */}
            <div className="border-t border-gray-100 pt-4">
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Ajouter un commentaire..."
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none transition resize-none"
              />
              <div className="flex items-center justify-between mt-3">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={commentInterne}
                    onChange={e => setCommentInterne(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500 cursor-pointer"
                  />
                  Note interne
                </label>
                <button
                  onClick={handleSubmitComment}
                  disabled={!commentText.trim() || submittingComment}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submittingComment ? (
                    <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> Envoi…</>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                      </svg>
                      Envoyer commentaire
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (40%) */}
        <div className="lg:col-span-2 space-y-6">
          {/* SLA Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              SLA
            </h3>

            {/* Prise en charge */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-600">Prise en charge</span>
                <div className="flex items-center gap-1.5">
                  {slaPrise && (
                    <>
                      <span className="text-xs text-gray-500">{slaPrise.elapsed}h / {slaPrise.total}h</span>
                      {ticket.date_prise_en_charge && slaPrise.percent <= 100 ? (
                        <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      ) : slaPrise.percent > 100 ? (
                        <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                      ) : (
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      )}
                    </>
                  )}
                </div>
              </div>
              {slaPrise ? (
                <>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${slaBarColor(slaPrise.percent)}`} style={{ width: `${Math.min(slaPrise.percent, 100)}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-gray-400">Échéance : {slaPrise.deadlineStr}</p>
                    {slaPrise.percent > 100 && (
                      <span className="text-[11px] font-semibold text-red-600">Dépassé de {Math.round((slaPrise.elapsed - slaPrise.total) * 10) / 10}h</span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-400 italic">Pas de SLA défini</p>
              )}
            </div>

            {/* Résolution */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-600">Résolution</span>
                <div className="flex items-center gap-1.5">
                  {slaResolution && (
                    <>
                      <span className="text-xs text-gray-500">{slaResolution.elapsed}h / {slaResolution.total}h</span>
                      {ticket.date_resolution && slaResolution.percent <= 100 ? (
                        <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      ) : slaResolution.percent > 100 ? (
                        <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                      ) : (
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                      )}
                    </>
                  )}
                </div>
              </div>
              {slaResolution ? (
                <>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${slaBarColor(slaResolution.percent)}`} style={{ width: `${Math.min(slaResolution.percent, 100)}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] text-gray-400">Échéance : {slaResolution.deadlineStr}</p>
                    {slaResolution.percent > 100 && (
                      <span className="text-[11px] font-semibold text-red-600">Dépassé de {Math.round((slaResolution.elapsed - slaResolution.total) * 10) / 10}h</span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-400 italic">Pas de SLA défini</p>
              )}
            </div>
          </div>

          {/* Historique des statuts */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
              </svg>
              Historique
            </h3>
            {ticket.historique && ticket.historique.length > 0 ? (
              <div className="relative">
                <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-gray-100" />
                <div className="space-y-4">
                  {[...ticket.historique].reverse().map(h => {
                    const hsc = STATUT_CONFIG[h.nouveau_statut] || STATUT_CONFIG.nouveau;
                    return (
                      <div key={h.id} className="relative flex gap-3">
                        <div className={`h-5 w-5 rounded-full border-2 border-white ${hsc.dot} shrink-0 z-10 shadow-sm`} />
                        <div className="pb-1">
                          <p className="text-sm font-semibold text-gray-800">{hsc.label}</p>
                          <p className="text-xs text-gray-500">
                            {h.user_nom ? `par ${h.user_nom}` : 'Création'} — {formatDateShort(h.created_at)}
                          </p>
                          {h.motif && <p className="text-xs text-gray-400 italic mt-0.5">&ldquo;{h.motif}&rdquo;</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">Aucun historique</p>
            )}
          </div>

          {/* Client Card */}
          {ticket.client_id ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
                Client
              </h3>
              <p className="text-base font-semibold text-gray-900">{ticket.client_nom}</p>
              {ticket.numero_client && (
                <p className="text-xs text-gray-500 mt-0.5">N° {ticket.numero_client}</p>
              )}
              {ticket.client_email && <p className="text-sm text-gray-500 mt-1">{ticket.client_email}</p>}
              {clientTicketCount !== null && (
                <p className="text-xs text-gray-500 mt-2">{clientTicketCount} ticket(s) au total</p>
              )}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <Link href={`/dashboard/clients/${ticket.client_id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 transition">
                  Voir fiche
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
                Client
              </h3>
              <p className="text-sm text-gray-400 italic">Aucun client rapproché</p>
              {ticket.email_from && (
                <p className="text-xs text-gray-500 mt-1 break-all">Expéditeur : {ticket.email_from}</p>
              )}
            </div>
          )}

          {/* Machine Card */}
          {ticket.machine_id && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M9.75 8.25h.008v.008H9.75V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                </svg>
                Machine
              </h3>
              <p className="text-base font-semibold text-gray-900">{ticket.machine_designation || 'Machine'}</p>
              {ticket.machine_numero_serie && <p className="text-sm text-gray-500 mt-0.5">N/S : {ticket.machine_numero_serie}</p>}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <Link href={`/dashboard/parc-machines/${ticket.machine_id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 transition">
                  Voir fiche
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal Changer Statut / Résolution */}
      {showStatutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`bg-white rounded-2xl shadow-2xl w-full mx-4 overflow-hidden ${isResolutionModal ? 'max-w-lg' : 'max-w-md'}`}>
            <div className={`p-6 ${isResolutionModal ? 'bg-gradient-to-r from-emerald-50 to-teal-50' : 'bg-gradient-to-r from-blue-50 to-indigo-50'}`}>
              <h3 className="text-lg font-bold text-gray-900">
                {isResolutionModal
                  ? 'Résoudre ce ticket'
                  : <>Changer le statut à &ldquo;{(STATUT_CONFIG[showStatutModal] || {}).label || showStatutModal}&rdquo;</>
                }
              </h3>
              {isResolutionModal && (
                <p className="text-sm text-gray-500 mt-1">Décrivez le problème rencontré et la solution apportée</p>
              )}
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  {isResolutionModal ? 'Diagnostic et solution apportée *' : 'Motif (optionnel)'}
                </label>
                <textarea
                  value={statutMotif}
                  onChange={e => setStatutMotif(e.target.value)}
                  rows={isResolutionModal ? 5 : 3}
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm text-gray-800 focus:ring-2 outline-none transition resize-none ${
                    isResolutionModal && statutMotif.length > 0 && statutMotif.trim().length < 10
                      ? 'border-red-300 focus:border-red-400 focus:ring-red-500/10'
                      : 'border-gray-200 focus:border-blue-300 focus:ring-blue-500/10'
                  }`}
                  placeholder={isResolutionModal
                    ? 'Ex: Problème de bourrage papier récurrent. Nettoyage complet du chemin papier, remplacement des rouleaux d\'entraînement...'
                    : 'Raison du changement...'
                  }
                />
                {isResolutionModal && (
                  <p className={`text-xs mt-1 ${statutMotif.trim().length >= 10 ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {statutMotif.trim().length}/10 caractères minimum
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button onClick={() => { setShowStatutModal(null); setStatutMotif(''); }} className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-sm font-medium transition cursor-pointer">
                Annuler
              </button>
              <button
                onClick={handleChangeStatut}
                disabled={statutChanging || (isResolutionModal && !resolutionMotifValid)}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold shadow-lg hover:opacity-90 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  isResolutionModal
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-500/25'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-500/25'
                }`}
              >
                {statutChanging ? (
                  <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> Changement…</>
                ) : isResolutionModal ? 'Marquer comme résolu' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Supprimer */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-red-50 to-orange-50 p-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Supprimer ce ticket ?</h3>
                <p className="text-sm text-gray-500 mt-0.5">Cette action est irréversible.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-sm font-medium transition cursor-pointer">
                Annuler
              </button>
              <button onClick={handleDelete} disabled={deleteLoading} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                {deleteLoading ? (
                  <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> Suppression…</>
                ) : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-lg ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
