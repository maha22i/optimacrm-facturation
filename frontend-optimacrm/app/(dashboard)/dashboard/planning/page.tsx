'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import type {
  ApiResponse, User, PlanningCreneau, TicketPlanifiable, PrioriteTicket,
} from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration de la grille horaire
// ─────────────────────────────────────────────────────────────────────────────

const HOUR_START = 7;   // première heure affichée
const HOUR_END = 19;    // dernière heure affichée (exclusive)
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 28; // hauteur en px d'un créneau de 30 min
const SLOTS_PER_DAY = ((HOUR_END - HOUR_START) * 60) / SLOT_MINUTES;
const DEFAULT_DURATION_MIN = 60; // durée par défaut d'un ticket déposé

const PRIORITE_CONFIG: Record<PrioriteTicket, { label: string; bg: string; text: string; border: string; solid: string }> = {
  basse:   { label: 'Basse',   bg: 'bg-gray-100',  text: 'text-gray-600',    border: 'border-l-gray-400',   solid: 'bg-gray-400' },
  normale: { label: 'Normale', bg: 'bg-blue-50',   text: 'text-blue-700',    border: 'border-l-blue-500',   solid: 'bg-blue-500' },
  haute:   { label: 'Haute',   bg: 'bg-amber-50',  text: 'text-amber-700',   border: 'border-l-amber-500',  solid: 'bg-amber-500' },
  urgente: { label: 'Urgente', bg: 'bg-red-50',    text: 'text-red-700',     border: 'border-l-red-500',    solid: 'bg-red-500' },
};

const STATUT_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  nouveau:    { label: 'Nouveau',    bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  assigne:    { label: 'Assigné',    bg: 'bg-indigo-50',  text: 'text-indigo-700',  dot: 'bg-indigo-500' },
  en_cours:   { label: 'En cours',   bg: 'bg-yellow-50',  text: 'text-yellow-700',  dot: 'bg-yellow-500' },
  en_attente: { label: 'En attente', bg: 'bg-orange-50',  text: 'text-orange-700',  dot: 'bg-orange-500' },
  resolu:     { label: 'Résolu',     bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  cloture:    { label: 'Clôturé',    bg: 'bg-gray-100',   text: 'text-gray-600',    dot: 'bg-gray-400' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers dates : les créneaux sont stockés en UTC (ISO 8601) côté serveur ;
// l'affichage et la grille utilisent l'heure locale du navigateur.
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); // lundi
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Date UTC ISO correspondant à un slot de la grille (jour local + index de slot). */
function slotToIso(dateStr: string, slotIndex: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const minutes = HOUR_START * 60 + slotIndex * SLOT_MINUTES;
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0).toISOString();
}

/** Minutes écoulées depuis HOUR_START pour une date UTC ISO, dans le jour local donné. */
function minutesFromDayStart(iso: string, dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayStart = new Date(y, m - 1, d, HOUR_START, 0, 0, 0);
  return (new Date(iso).getTime() - dayStart.getTime()) / 60000;
}

function formatHeure(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// ─────────────────────────────────────────────────────────────────────────────
// Types internes drag & drop
// ─────────────────────────────────────────────────────────────────────────────

type DragData =
  | { type: 'ticket'; ticket: TicketPlanifiable }
  | { type: 'creneau'; creneau: PlanningCreneau };

/** Une colonne de la grille = un jour + un technicien. */
interface GridColumn {
  key: string;
  dateStr: string;
  technicienId: string;
  header: string;
  subHeader?: string;
  isToday: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carte ticket draggable (liste latérale)
// ─────────────────────────────────────────────────────────────────────────────

function TicketCard({ ticket, dragging = false }: { ticket: TicketPlanifiable; dragging?: boolean }) {
  const prio = PRIORITE_CONFIG[ticket.priorite];
  return (
    <div className={`rounded-xl border border-gray-100 bg-white p-3 shadow-sm border-l-4 ${prio.border} ${dragging ? 'shadow-lg rotate-1 opacity-95' : 'hover:shadow-md'} transition-shadow`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-gray-500">{ticket.numero}</span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${prio.bg} ${prio.text} ${ticket.priorite === 'urgente' ? 'animate-pulse' : ''}`}>
          {prio.label}
        </span>
      </div>
      <p className="mt-1 text-[13px] font-medium text-gray-800 line-clamp-2">{ticket.sujet}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500 truncate">{ticket.client_nom || '—'}</span>
        {ticket.technicien_id ? (
          <span className="text-[10px] font-medium text-indigo-600 whitespace-nowrap">
            {ticket.technicien_prenom} {ticket.technicien_nom_famille?.[0] || ''}.
          </span>
        ) : (
          <span className="text-[10px] font-medium text-gray-400 whitespace-nowrap">Non assigné</span>
        )}
      </div>
    </div>
  );
}

function DraggableTicket({ ticket }: { ticket: TicketPlanifiable }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `ticket-${ticket.id}`,
    data: { type: 'ticket', ticket } satisfies DragData,
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`cursor-grab active:cursor-grabbing touch-none ${isDragging ? 'opacity-30' : ''}`}>
      <TicketCard ticket={ticket} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloc créneau (draggable + redimensionnable + cliquable)
// ─────────────────────────────────────────────────────────────────────────────

function CreneauBlock({
  creneau, dateStr, canEdit, suppressClickRef, onResizeEnd, onDelete, onOpen, compact,
}: {
  creneau: PlanningCreneau;
  dateStr: string;
  canEdit: boolean;
  suppressClickRef: React.MutableRefObject<boolean>;
  onResizeEnd: (creneau: PlanningCreneau, newFinIso: string) => void;
  onDelete: (creneau: PlanningCreneau) => void;
  onOpen: (creneau: PlanningCreneau) => void;
  compact: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `creneau-${creneau.id}`,
    data: { type: 'creneau', creneau } satisfies DragData,
    disabled: !canEdit,
  });

  const [resizeDeltaPx, setResizeDeltaPx] = useState<number | null>(null);

  const startMin = minutesFromDayStart(creneau.date_debut, dateStr);
  const endMin = minutesFromDayStart(creneau.date_fin, dateStr);
  const clampedStart = Math.max(0, startMin);
  const clampedEnd = Math.min(SLOTS_PER_DAY * SLOT_MINUTES, endMin);
  if (clampedEnd <= 0 || clampedStart >= SLOTS_PER_DAY * SLOT_MINUTES) return null;

  const top = (clampedStart / SLOT_MINUTES) * SLOT_HEIGHT;
  const baseHeight = ((clampedEnd - clampedStart) / SLOT_MINUTES) * SLOT_HEIGHT;
  const height = Math.max(SLOT_HEIGHT, baseHeight + (resizeDeltaPx ?? 0));

  const prio = PRIORITE_CONFIG[creneau.ticket_priorite] || PRIORITE_CONFIG.normale;
  const statut = STATUT_CONFIG[creneau.ticket_statut] || STATUT_CONFIG.nouveau;
  const termine = creneau.statut_creneau === 'termine';

  const handleResizeStart = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startY = e.clientY;
    let delta = 0;

    const onMove = (ev: PointerEvent) => {
      delta = ev.clientY - startY;
      setResizeDeltaPx(delta);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setResizeDeltaPx(null);
      const deltaMinutes = Math.round(delta / SLOT_HEIGHT) * SLOT_MINUTES;
      if (deltaMinutes !== 0) {
        const debut = new Date(creneau.date_debut).getTime();
        const fin = new Date(creneau.date_fin).getTime() + deltaMinutes * 60000;
        const newFin = Math.max(debut + SLOT_MINUTES * 60000, fin);
        onResizeEnd(creneau, new Date(newFin).toISOString());
      }
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ top, height }}
      className={`group absolute left-0.5 right-0.5 z-10 ${isDragging ? 'opacity-30' : ''}`}
    >
      <div
        {...listeners}
        {...attributes}
        onClick={() => { if (!suppressClickRef.current) onOpen(creneau); }}
        className={`relative flex h-full flex-col overflow-hidden rounded-lg border border-l-4 ${prio.border} ${termine ? 'border-gray-100 bg-gray-50 opacity-70' : 'border-gray-200 bg-white'} px-1.5 py-1 text-left shadow-sm transition-shadow hover:shadow-md ${canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} touch-none`}
        title={`${creneau.ticket_numero} — ${creneau.ticket_sujet}\n${formatHeure(creneau.date_debut)} → ${formatHeure(creneau.date_fin)}`}
      >
        <div className="flex items-center gap-1">
          <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${statut.dot}`} />
          <span className="truncate text-[10px] font-bold text-gray-700">{creneau.ticket_numero}</span>
          <span className="ml-auto text-[9px] text-gray-400 whitespace-nowrap">
            {formatHeure(creneau.date_debut)}–{formatHeure(creneau.date_fin)}
          </span>
        </div>
        {height >= SLOT_HEIGHT * 1.5 && (
          <p className={`text-[11px] font-medium leading-tight text-gray-800 ${termine ? 'line-through' : ''} ${height >= SLOT_HEIGHT * 3 ? 'line-clamp-2' : 'truncate'}`}>
            {creneau.ticket_sujet}
          </p>
        )}
        {height >= SLOT_HEIGHT * 2.5 && (
          <div className="mt-auto flex items-center justify-between gap-1">
            <span className="truncate text-[10px] text-gray-500">{creneau.client_nom || '—'}</span>
            {!compact && (
              <span className={`inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-semibold ${statut.bg} ${statut.text}`}>
                {statut.label}
              </span>
            )}
          </div>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(creneau); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-gray-100 text-[10px] text-gray-500 hover:bg-red-100 hover:text-red-600 group-hover:flex"
            title="Retirer du planning"
          >
            ✕
          </button>
        )}
      </div>
      {canEdit && (
        <div
          onPointerDown={handleResizeStart}
          className="absolute -bottom-0.5 left-1/2 h-2.5 w-8 -translate-x-1/2 cursor-ns-resize rounded-full opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
          title="Modifier la durée"
        >
          <div className="mx-auto mt-1 h-1 w-6 rounded-full bg-blue-400" />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cellule droppable de la grille
// ─────────────────────────────────────────────────────────────────────────────

function DroppableCell({ column, slotIndex }: { column: GridColumn; slotIndex: number }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `cell|${column.technicienId}|${column.dateStr}|${slotIndex}`,
  });
  const isHourStart = slotIndex % 2 === 0;
  return (
    <div
      ref={setNodeRef}
      style={{ height: SLOT_HEIGHT }}
      className={`border-b ${isHourStart ? 'border-gray-100' : 'border-gray-50'} ${isOver ? 'bg-blue-100/70' : ''} transition-colors`}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Planning
// ─────────────────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const router = useRouter();
  const { user } = useAuth();
  const isTechnicien = user?.role === 'technicien';
  const isManager = ['admin', 'admin_technique'].includes(user?.role || '');

  const [view, setView] = useState<'jour' | 'semaine'>('semaine');
  const [currentDate, setCurrentDate] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [techniciens, setTechniciens] = useState<User[]>([]);
  const [selectedTechId, setSelectedTechId] = useState<string>('');
  const [creneaux, setCreneaux] = useState<PlanningCreneau[]>([]);
  const [ticketsDispo, setTicketsDispo] = useState<TicketPlanifiable[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const suppressClickRef = useRef(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Plage visible ──────────────────────────────────────────────────────────
  const rangeStart = useMemo(
    () => (view === 'semaine' ? startOfWeek(currentDate) : currentDate),
    [view, currentDate],
  );
  const rangeDays = view === 'semaine' ? 7 : 1;
  const rangeEnd = useMemo(() => addDays(rangeStart, rangeDays), [rangeStart, rangeDays]);

  // ── Chargement des données ─────────────────────────────────────────────────
  const fetchTechniciens = useCallback(async () => {
    if (!isManager) return;
    try {
      const res = await api.get<ApiResponse<User[]>>('/auth/users');
      const techs = (Array.isArray(res.data) ? res.data : []).filter(
        u => u.role === 'technicien' && u.is_active,
      );
      setTechniciens(techs);
      setSelectedTechId(prev => prev || techs[0]?.id || '');
    } catch { /* ignore */ }
  }, [isManager]);

  const fetchCreneaux = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        date_debut: rangeStart.toISOString(),
        date_fin: rangeEnd.toISOString(),
      });
      const res = await api.get<ApiResponse<PlanningCreneau[]>>(`/planning?${params}`);
      setCreneaux(Array.isArray(res.data) ? res.data : []);
    } catch {
      setToast({ message: 'Erreur lors du chargement du planning', type: 'error' });
    }
  }, [rangeStart, rangeEnd]);

  const fetchTicketsDispo = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<TicketPlanifiable[]>>('/planning/tickets-disponibles');
      setTicketsDispo(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void (async () => {
      await fetchTechniciens();
    })();
  }, [fetchTechniciens]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.all([fetchCreneaux(), fetchTicketsDispo()]);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchCreneaux, fetchTicketsDispo]);

  const refresh = useCallback(() => {
    fetchCreneaux();
    fetchTicketsDispo();
  }, [fetchCreneaux, fetchTicketsDispo]);

  // ── Colonnes de la grille ──────────────────────────────────────────────────
  const columns: GridColumn[] = useMemo(() => {
    const todayStr = toLocalDateStr(new Date());

    if (isManager && view === 'jour') {
      // Vue jour manager : une colonne par technicien
      const dateStr = toLocalDateStr(currentDate);
      return techniciens.map(t => ({
        key: `${dateStr}-${t.id}`,
        dateStr,
        technicienId: t.id,
        header: `${t.first_name} ${t.last_name}`,
        isToday: dateStr === todayStr,
      }));
    }

    // Vue semaine (ou vue jour technicien) : une colonne par jour
    const techId = isManager ? selectedTechId : (user?.id || '');
    return Array.from({ length: rangeDays }, (_, i) => {
      const d = addDays(rangeStart, i);
      const dateStr = toLocalDateStr(d);
      return {
        key: dateStr,
        dateStr,
        technicienId: techId,
        header: `${JOURS[(d.getDay() + 6) % 7]} ${d.getDate()}`,
        subHeader: MOIS[d.getMonth()],
        isToday: dateStr === todayStr,
      };
    });
  }, [isManager, view, currentDate, techniciens, selectedTechId, user?.id, rangeStart, rangeDays]);

  const creneauxForColumn = useCallback((col: GridColumn) => {
    const [y, m, d] = col.dateStr.split('-').map(Number);
    const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    const dayEnd = dayStart + 24 * 3600000;
    return creneaux.filter(c =>
      c.technicien_id === col.technicienId &&
      c.statut_creneau !== 'annule' &&
      new Date(c.date_debut).getTime() < dayEnd &&
      new Date(c.date_fin).getTime() > dayStart,
    );
  }, [creneaux]);

  // ── Actions API ────────────────────────────────────────────────────────────
  const apiErrorMessage = (err: unknown) =>
    (err instanceof Error && err.message) ? err.message : 'Une erreur est survenue';

  const placeTicket = async (ticket: TicketPlanifiable, technicienId: string, debutIso: string) => {
    try {
      const fin = new Date(new Date(debutIso).getTime() + DEFAULT_DURATION_MIN * 60000).toISOString();
      await api.post('/planning', {
        ticket_id: ticket.id,
        technicien_id: technicienId,
        date_debut: debutIso,
        date_fin: fin,
      });
      setToast({ message: `Ticket ${ticket.numero} planifié`, type: 'success' });
      refresh();
    } catch (err) {
      setToast({ message: apiErrorMessage(err), type: 'error' });
    }
  };

  const moveCreneau = async (creneau: PlanningCreneau, technicienId: string, debutIso: string) => {
    const duree = new Date(creneau.date_fin).getTime() - new Date(creneau.date_debut).getTime();
    const finIso = new Date(new Date(debutIso).getTime() + duree).toISOString();
    // Mise à jour optimiste pour éviter le "saut" visuel
    setCreneaux(prev => prev.map(c =>
      c.id === creneau.id ? { ...c, technicien_id: technicienId, date_debut: debutIso, date_fin: finIso } : c,
    ));
    try {
      await api.put(`/planning/${creneau.id}`, {
        technicien_id: technicienId,
        date_debut: debutIso,
        date_fin: finIso,
      });
      fetchCreneaux();
    } catch (err) {
      setToast({ message: apiErrorMessage(err), type: 'error' });
      fetchCreneaux();
    }
  };

  const resizeCreneau = async (creneau: PlanningCreneau, newFinIso: string) => {
    setCreneaux(prev => prev.map(c => (c.id === creneau.id ? { ...c, date_fin: newFinIso } : c)));
    try {
      await api.put(`/planning/${creneau.id}`, { date_fin: newFinIso });
      fetchCreneaux();
    } catch (err) {
      setToast({ message: apiErrorMessage(err), type: 'error' });
      fetchCreneaux();
    }
  };

  const deleteCreneau = async (creneau: PlanningCreneau) => {
    try {
      await api.delete(`/planning/${creneau.id}`);
      setToast({ message: `Créneau du ticket ${creneau.ticket_numero} retiré`, type: 'success' });
      refresh();
    } catch (err) {
      setToast({ message: apiErrorMessage(err), type: 'error' });
    }
  };

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const handleDragStart = (e: DragStartEvent) => {
    setActiveDrag((e.active.data.current as DragData) || null);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const data = e.active.data.current as DragData | undefined;
    setActiveDrag(null);
    suppressClickRef.current = true;
    setTimeout(() => { suppressClickRef.current = false; }, 0);

    if (!data || !e.over) return;
    const overId = String(e.over.id);
    if (!overId.startsWith('cell|')) return;

    const [, technicienId, dateStr, slotStr] = overId.split('|');
    const debutIso = slotToIso(dateStr, parseInt(slotStr));

    if (data.type === 'ticket') {
      placeTicket(data.ticket, technicienId, debutIso);
    } else {
      moveCreneau(data.creneau, technicienId, debutIso);
    }
  };

  // ── Navigation dates ───────────────────────────────────────────────────────
  const navigate = (dir: -1 | 1) => {
    setCurrentDate(d => addDays(d, dir * (view === 'semaine' ? 7 : 1)));
  };

  const rangeLabel = useMemo(() => {
    if (view === 'jour') {
      return `${JOURS[(currentDate.getDay() + 6) % 7]} ${currentDate.getDate()} ${MOIS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    const end = addDays(rangeStart, 6);
    if (rangeStart.getMonth() === end.getMonth()) {
      return `${rangeStart.getDate()} – ${end.getDate()} ${MOIS[end.getMonth()]} ${end.getFullYear()}`;
    }
    return `${rangeStart.getDate()} ${MOIS[rangeStart.getMonth()]} – ${end.getDate()} ${MOIS[end.getMonth()]} ${end.getFullYear()}`;
  }, [view, currentDate, rangeStart]);

  const canEditCreneau = useCallback((c: PlanningCreneau) => {
    if (isManager) return true;
    return c.technicien_id === user?.id;
  }, [isManager, user?.id]);

  const compactColumns = columns.length > 5;

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full flex-col gap-4">
        {/* En-tête */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Planning des techniciens</h1>
            <p className="text-[13px] text-gray-500">
              {isTechnicien
                ? 'Vos interventions planifiées — glissez un ticket disponible sur votre planning pour le prendre.'
                : 'Glissez les tickets à planifier sur le planning d\'un technicien.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isManager && view === 'semaine' && (
              <select
                value={selectedTechId}
                onChange={(e) => setSelectedTechId(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-700 focus:border-blue-400 focus:outline-none"
              >
                {techniciens.length === 0 && <option value="">Aucun technicien</option>}
                {techniciens.map(t => (
                  <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                ))}
              </select>
            )}

            <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
              {(['jour', 'semaine'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors ${
                    view === v ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {v === 'jour' ? 'Jour' : 'Semaine'}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                title="Précédent"
              >
                ‹
              </button>
              <button
                onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setCurrentDate(d); }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50"
              >
                Aujourd&apos;hui
              </button>
              <button
                onClick={() => navigate(1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                title="Suivant"
              >
                ›
              </button>
            </div>

            <span className="text-[13px] font-semibold capitalize text-gray-800">{rangeLabel}</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-4">
          {/* Liste latérale : tickets à planifier */}
          <aside className="flex w-64 flex-shrink-0 flex-col rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 className="text-[13px] font-bold text-gray-800">
                {isTechnicien ? 'Tickets disponibles' : 'Tickets à planifier'}
              </h2>
              <p className="text-[11px] text-gray-500">
                {ticketsDispo.length} ticket{ticketsDispo.length > 1 ? 's' : ''} — glisser sur le planning
              </p>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {loading && ticketsDispo.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-gray-400">Chargement…</p>
              ) : ticketsDispo.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-gray-400">Aucun ticket à planifier</p>
              ) : (
                ticketsDispo.map(t => <DraggableTicket key={t.id} ticket={t} />)
              )}
            </div>
          </aside>

          {/* Grille planning */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {columns.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-8 text-[13px] text-gray-400">
                {isManager ? 'Aucun technicien actif à afficher' : 'Aucune donnée'}
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                <div className="min-w-fit">
                  {/* En-têtes de colonnes */}
                  <div className="sticky top-0 z-20 flex border-b border-gray-200 bg-white">
                    <div className="w-14 flex-shrink-0 border-r border-gray-100" />
                    {columns.map(col => (
                      <div
                        key={col.key}
                        className={`flex-1 border-r border-gray-100 px-2 py-2 text-center ${col.isToday ? 'bg-blue-50/60' : ''}`}
                        style={{ minWidth: compactColumns ? 110 : 140 }}
                      >
                        <p className={`truncate text-[12px] font-bold ${col.isToday ? 'text-blue-700' : 'text-gray-800'}`}>
                          {col.header}
                        </p>
                        {col.subHeader && <p className="text-[10px] capitalize text-gray-400">{col.subHeader}</p>}
                      </div>
                    ))}
                  </div>

                  {/* Corps de la grille */}
                  <div className="flex">
                    {/* Gouttière des heures */}
                    <div className="w-14 flex-shrink-0 border-r border-gray-100">
                      {Array.from({ length: SLOTS_PER_DAY }, (_, i) => (
                        <div key={i} style={{ height: SLOT_HEIGHT }} className="relative">
                          {i % 2 === 0 && (
                            <span className="absolute -top-2 right-2 text-[10px] font-medium text-gray-400">
                              {pad(HOUR_START + i / 2)}:00
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Colonnes */}
                    {columns.map(col => (
                      <div
                        key={col.key}
                        className={`relative flex-1 border-r border-gray-100 ${col.isToday ? 'bg-blue-50/30' : ''}`}
                        style={{ minWidth: compactColumns ? 110 : 140 }}
                      >
                        {Array.from({ length: SLOTS_PER_DAY }, (_, i) => (
                          <DroppableCell key={i} column={col} slotIndex={i} />
                        ))}
                        {creneauxForColumn(col).map(c => (
                          <CreneauBlock
                            key={c.id}
                            creneau={c}
                            dateStr={col.dateStr}
                            canEdit={canEditCreneau(c)}
                            suppressClickRef={suppressClickRef}
                            onResizeEnd={resizeCreneau}
                            onDelete={deleteCreneau}
                            onOpen={(cr) => router.push(`/dashboard/tickets/${cr.ticket_id}`)}
                            compact={compactColumns}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Aperçu pendant le drag */}
      <DragOverlay dropAnimation={null}>
        {activeDrag?.type === 'ticket' && (
          <div className="w-60"><TicketCard ticket={activeDrag.ticket} dragging /></div>
        )}
        {activeDrag?.type === 'creneau' && (
          <div className={`w-40 rounded-lg border border-l-4 ${(PRIORITE_CONFIG[activeDrag.creneau.ticket_priorite] || PRIORITE_CONFIG.normale).border} border-gray-200 bg-white px-2 py-1.5 shadow-lg`}>
            <p className="text-[10px] font-bold text-gray-700">{activeDrag.creneau.ticket_numero}</p>
            <p className="truncate text-[11px] text-gray-800">{activeDrag.creneau.ticket_sujet}</p>
          </div>
        )}
      </DragOverlay>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-[13px] font-medium text-white shadow-lg ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}
    </DndContext>
  );
}
