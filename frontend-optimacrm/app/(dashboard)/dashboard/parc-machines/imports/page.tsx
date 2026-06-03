'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type {
  ApiResponse,
  ImportReleve,
  ImportsRelevesStats,
  StatutImport,
  ImportFactureRow,
} from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} à ${dt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR');
}

function fmtEur(n: number): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  return `${(bytes / 1024).toFixed(1)} Ko`;
}

type DotColor = 'green' | 'orange' | 'red';

function getDotColor(imp: ImportReleve): DotColor {
  if (imp.statut === 'Annule') return 'red';
  if (imp.nb_lignes_erreur > 0 || imp.nb_lignes_ignorees > 0) return 'orange';
  return 'green';
}

const DOT_STYLES: Record<DotColor, string> = {
  green: 'bg-emerald-500 ring-emerald-100',
  orange: 'bg-amber-500 ring-amber-100',
  red: 'bg-red-500 ring-red-100',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Toast
// ═══════════════════════════════════════════════════════════════════════════════

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-medium shadow-xl ${
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
    }`}>
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        {type === 'success'
          ? <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        }
      </svg>
      {message}
      <button onClick={onClose} className="ml-2 hover:opacity-70 cursor-pointer">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Icons (inline SVG)
// ═══════════════════════════════════════════════════════════════════════════════

function IconArchive({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
    </svg>
  );
}

function IconCalendar({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
    </svg>
  );
}

function IconClock({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function IconXCircle({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function IconPlus({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function IconDots({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
    </svg>
  );
}

function IconChevronLeft({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
    </svg>
  );
}

function IconChevronRight({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function IconSearch({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  );
}

function IconWarning({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
  );
}

function IconShield({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286Z" />
    </svg>
  );
}

function IconDownload({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stat Card
// ═══════════════════════════════════════════════════════════════════════════════

function StatCard({ label, value, icon, color }: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'violet' | 'blue' | 'amber' | 'red';
}) {
  const colors = {
    violet: 'bg-violet-50 text-violet-600',
    blue: 'bg-blue-50 text-blue-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${colors[color]}`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Status Badge
// ═══════════════════════════════════════════════════════════════════════════════

function StatusBadge({ statut }: { statut: StatutImport }) {
  if (statut === 'Annule') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        Annulé
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Actif
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dropdown Menu
// ═══════════════════════════════════════════════════════════════════════════════

function DropdownMenu({ imp, onCancel }: { imp: ImportReleve; onCancel: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="cursor-pointer rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
      >
        <IconDots className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-gray-100 bg-white py-1.5 shadow-xl">
          <button
            onClick={() => { setOpen(false); router.push(`/dashboard/parc-machines/imports/${imp.id}`); }}
            className="cursor-pointer flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
            Voir le détail
          </button>
          <button
            onClick={() => { setOpen(false); router.push(`/dashboard/parc-machines/imports/${imp.id}?tab=factures`); }}
            className="cursor-pointer flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Voir les factures liées
          </button>
          {imp.nb_lignes_erreur > 0 && (
            <button
              onClick={() => { setOpen(false); window.open(`${API_URL}/imports-releves/${imp.id}/rapport?format=csv`); }}
              className="cursor-pointer flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <IconDownload className="h-4 w-4 text-gray-400" />
              Télécharger le rapport
            </button>
          )}
          <div className="my-1.5 border-t border-gray-100" />
          {imp.statut === 'Actif' && (
            <button
              onClick={() => { setOpen(false); onCancel(); }}
              className="cursor-pointer flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <IconXCircle className="h-4 w-4" />
              Annuler cet import
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cancel Modal
// ═══════════════════════════════════════════════════════════════════════════════

function CancelModal({
  imp,
  onClose,
  onConfirmed,
}: {
  imp: ImportReleve;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [factures, setFactures] = useState<ImportFactureRow[]>([]);
  const [motif, setMotif] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get<ApiResponse<ImportFactureRow[]>>(`/imports-releves/${imp.id}/factures`)
      .then((res) => {
        if (!cancelled) {
          setFactures(res.data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFactures([]);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [imp.id]);

  const hasFactures = factures.length > 0;

  async function handleConfirm() {
    if (!motif.trim()) {
      setError('Le motif d\'annulation est obligatoire.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.delete(`/imports-releves/${imp.id}`, { motif: motif.trim() });
      onConfirmed();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'annulation.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-violet-600" />
          </div>
        ) : hasFactures ? (
          <>
            <div className="border-b border-gray-100 px-6 pt-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50">
                  <IconShield className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Annulation impossible</h3>
                  <p className="text-sm text-gray-500">Cet import a des factures associées</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="mb-3 text-sm text-gray-600">
                L&apos;import <span className="font-mono font-semibold">{imp.numero_batch}</span> ne peut pas être annulé
                car {factures.length} facture{factures.length > 1 ? 's' : ''} y {factures.length > 1 ? 'sont liées' : 'est liée'} :
              </p>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-3 py-2 text-left font-medium text-gray-500">N° Facture</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Client</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">Montant HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factures.map((f) => (
                      <tr key={f.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs font-medium text-violet-700">{f.numero_facture}</td>
                        <td className="px-3 py-2 text-gray-700">{f.client_nom}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{fmtEur(f.total_ht)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <Link
                href={`/dashboard/parc-machines/imports/${imp.id}?tab=factures`}
                className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors cursor-pointer"
              >
                Voir les factures
              </Link>
              <button
                onClick={onClose}
                className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Fermer
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-gray-100 px-6 pt-6 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                  <IconWarning className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Confirmer l&apos;annulation</h3>
                  <p className="text-sm text-gray-500">Import {imp.numero_batch}</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4">
              <div className="mb-4 rounded-xl bg-gray-50 p-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-gray-500">Fichier</div>
                  <div className="font-medium text-gray-900">{imp.nom_fichier}</div>
                  <div className="text-gray-500">Relevés créés</div>
                  <div className="font-medium text-gray-900">{fmt(imp.nb_releves_crees)}</div>
                  <div className="text-gray-500">Date d&apos;import</div>
                  <div className="font-medium text-gray-900">{formatDateTime(imp.date_import)}</div>
                </div>
              </div>
              <div className="mb-4 rounded-xl border border-red-100 bg-red-50/50 p-4">
                <p className="mb-2 text-sm font-semibold text-red-800">Cette action va :</p>
                <ul className="space-y-1.5 text-sm text-red-700">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                    Supprimer les {fmt(imp.nb_releves_crees)} relevés de compteurs associés
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                    Rétablir les anciens compteurs sur les machines concernées
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                    Marquer l&apos;import comme annulé (irréversible)
                  </li>
                </ul>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Motif de l&apos;annulation <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  placeholder="Indiquez la raison de l'annulation…"
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-colors"
                />
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={onClose}
                disabled={submitting}
                className="cursor-pointer rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting || !motif.trim()}
                className="cursor-pointer rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {submitting && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                Confirmer l&apos;annulation
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Timeline Card
// ═══════════════════════════════════════════════════════════════════════════════

function TimelineCard({ imp, isLast, onCancel }: {
  imp: ImportReleve;
  isLast: boolean;
  onCancel: () => void;
}) {
  const dotColor = getDotColor(imp);
  const isCancelled = imp.statut === 'Annule';

  return (
    <div className="relative flex gap-6">
      {/* Timeline line + dot */}
      <div className="flex flex-col items-center">
        <div className={`relative z-10 h-4 w-4 shrink-0 rounded-full ring-4 ${DOT_STYLES[dotColor]}`} />
        {!isLast && <div className="w-0.5 grow bg-gray-200" />}
      </div>

      {/* Card */}
      <div className={`mb-8 w-full rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md ${
        isCancelled ? 'border-red-100 opacity-50' : 'border-gray-100'
      }`}>
        <div className="p-5">
          {/* Header */}
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="shrink-0 font-mono text-sm font-bold text-gray-900">{imp.numero_batch}</span>
              <StatusBadge statut={imp.statut} />
            </div>
            <DropdownMenu imp={imp} onCancel={onCancel} />
          </div>

          {/* File info */}
          <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
            <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <span className="truncate">{imp.nom_fichier}</span>
            <span className="text-gray-400">({formatFileSize(imp.taille_fichier)})</span>
          </div>

          {/* User + Date */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
            {imp.user_nom && (
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
                {imp.user_nom}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <IconClock className="h-4 w-4 text-gray-400" />
              {formatDateTime(imp.date_import)}
            </span>
          </div>

          {/* Period */}
          {(imp.periode_debut || imp.periode_fin) && (
            <div className="mb-4 flex items-center gap-1.5 text-sm text-gray-500">
              <IconCalendar className="h-4 w-4 text-gray-400" />
              <span>Période : {formatDate(imp.periode_debut)} → {formatDate(imp.periode_fin)}</span>
            </div>
          )}

          {/* Stats row */}
          <div className="mb-4 grid grid-cols-4 gap-2">
            <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-gray-900">{fmt(imp.nb_lignes_fichier)}</p>
              <p className="text-[11px] text-gray-500">Lignes</p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-emerald-700">{fmt(imp.nb_releves_crees)}</p>
              <p className="text-[11px] text-emerald-600">Relevés</p>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-center">
              <p className="text-lg font-bold text-amber-700">{fmt(imp.nb_lignes_ignorees)}</p>
              <p className="text-[11px] text-amber-600">Doublons</p>
            </div>
            <div className={`rounded-xl px-3 py-2.5 text-center ${imp.nb_lignes_erreur > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
              <p className={`text-lg font-bold ${imp.nb_lignes_erreur > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                {fmt(imp.nb_lignes_erreur)}
              </p>
              <p className={`text-[11px] ${imp.nb_lignes_erreur > 0 ? 'text-red-600' : 'text-gray-500'}`}>Erreurs</p>
            </div>
          </div>

          {/* Factures summary */}
          {(imp.nb_factures !== undefined && imp.nb_factures > 0) && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2.5 text-sm">
              <svg className="h-4 w-4 text-violet-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <span className="text-violet-700">
                <span className="font-semibold">{fmt(imp.nb_factures)}</span> facture{imp.nb_factures > 1 ? 's' : ''} générée{imp.nb_factures > 1 ? 's' : ''}
                {imp.montant_total_ht !== undefined && (
                  <> — Total : <span className="font-semibold">{fmtEur(imp.montant_total_ht)} € HT</span></>
                )}
              </span>
            </div>
          )}

          {/* Cancellation info */}
          {isCancelled && imp.motif_annulation && (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm">
              <p className="font-medium text-red-800">Motif d&apos;annulation :</p>
              <p className="mt-0.5 text-red-700">{imp.motif_annulation}</p>
              {imp.date_annulation && (
                <p className="mt-1 text-xs text-red-500">Annulé le {formatDateTime(imp.date_annulation)}</p>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/parc-machines/imports/${imp.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Voir le détail
            </Link>
            <Link
              href={`/dashboard/parc-machines/imports/${imp.id}?tab=factures`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 px-3.5 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 transition-colors cursor-pointer"
            >
              Voir les factures
            </Link>
            {imp.nb_lignes_erreur > 0 && (
              <button
                onClick={() => window.open(`${API_URL}/imports-releves/${imp.id}/rapport?format=csv`)}
                className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-amber-200 px-3.5 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors"
              >
                <IconDownload className="h-4 w-4" />
                Télécharger rapport
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type FilterStatut = '' | 'Actif' | 'Annule';

export default function ImportsHistoryPage() {
  const router = useRouter();

  const [imports, setImports] = useState<ImportReleve[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<ImportsRelevesStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filters
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [statut, setStatut] = useState<FilterStatut>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Cancel modal
  const [cancelTarget, setCancelTarget] = useState<ImportReleve | null>(null);

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<ImportsRelevesStats>>('/imports-releves/stats');
      setStats(res.data);
    } catch {
      // silently fail
    }
  }, []);

  const fetchImports = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('limit', '20');
      if (statut) params.set('statut', statut);
      if (dateDebut) params.set('date_debut', dateDebut);
      if (dateFin) params.set('date_fin', dateFin);
      if (search.trim()) params.set('search', search.trim());

      const res = await api.get<{
        data: { imports: ImportReleve[]; pagination: Pagination };
      }>(`/imports-releves?${params.toString()}`);

      setImports(res.data.imports);
      setPagination(res.data.pagination);
    } catch {
      setToast({ message: 'Erreur lors du chargement des imports.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [statut, dateDebut, dateFin, search]);

  // Debounced filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchImports(1);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [statut, dateDebut, dateFin, search, fetchImports]);

  // Page change (not debounced)
  useEffect(() => {
    fetchImports(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Initial stats load
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  function handleCancelConfirmed() {
    setCancelTarget(null);
    setToast({ message: 'Import annulé avec succès.', type: 'success' });
    fetchImports(page);
    fetchStats();
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {cancelTarget && (
        <CancelModal
          imp={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onConfirmed={handleCancelConfirmed}
        />
      )}

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Historique des imports de relevés</h1>
            <p className="mt-1 text-sm text-gray-500">
              Suivi complet de chaque vague d&apos;import — annulation, doublons, factures associées
            </p>
          </div>
          <Link
            href="/dashboard/parc-machines/import-releves"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 transition-colors cursor-pointer"
          >
            <IconPlus className="h-4 w-4" />
            Nouvel import
          </Link>
        </div>

        {/* Stat cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Total imports"
            value={stats ? fmt(stats.total_imports) : '—'}
            icon={<IconArchive />}
            color="violet"
          />
          <StatCard
            label="Imports ce mois-ci"
            value={stats ? fmt(stats.imports_ce_mois) : '—'}
            icon={<IconCalendar />}
            color="blue"
          />
          <StatCard
            label="Relevés en attente"
            value={stats ? fmt(stats.releves_non_factures) : '—'}
            icon={<IconClock />}
            color="amber"
          />
          <StatCard
            label="Imports annulés"
            value={stats ? fmt(stats.imports_annules) : '—'}
            icon={<IconXCircle />}
            color="red"
          />
        </div>

        {/* Filters */}
        <div className="mb-8 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">Date début</label>
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">Date fin</label>
              <input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-colors"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">Statut</label>
              <select
                value={statut}
                onChange={(e) => setStatut(e.target.value as FilterStatut)}
                className="w-full cursor-pointer rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-colors bg-white"
              >
                <option value="">Tous</option>
                <option value="Actif">Actifs</option>
                <option value="Annule">Annulés</option>
              </select>
            </div>
            <div className="flex-[2]">
              <label className="mb-1 block text-xs font-medium text-gray-500">Rechercher</label>
              <div className="relative">
                <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher par nom de fichier…"
                  className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-violet-600" />
              <p className="text-sm text-gray-500">Chargement des imports…</p>
            </div>
          </div>
        ) : imports.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white py-20 shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
              <IconArchive className="h-8 w-8 text-gray-400" />
            </div>
            <p className="mt-4 text-lg font-semibold text-gray-900">Aucun import trouvé</p>
            <p className="mt-1 text-sm text-gray-500">
              {search || dateDebut || dateFin || statut
                ? 'Aucun résultat ne correspond à vos filtres.'
                : 'Commencez par importer un fichier de relevés de compteurs.'}
            </p>
            {!search && !dateDebut && !dateFin && !statut && (
              <Link
                href="/dashboard/parc-machines/import-releves"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors cursor-pointer"
              >
                <IconPlus className="h-4 w-4" />
                Importer des relevés
              </Link>
            )}
          </div>
        ) : (
          <div className="pl-2">
            {imports.map((imp, idx) => (
              <TimelineCard
                key={imp.id}
                imp={imp}
                isLast={idx === imports.length - 1}
                onCancel={() => setCancelTarget(imp)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="mt-8 flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-6 py-4 shadow-sm">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconChevronLeft className="h-4 w-4" />
              Précédent
            </button>
            <span className="text-sm text-gray-600">
              Page <span className="font-semibold text-gray-900">{pagination.page}</span> sur{' '}
              <span className="font-semibold text-gray-900">{pagination.totalPages}</span>
              <span className="ml-2 text-gray-400">({fmt(pagination.total)} imports)</span>
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page >= pagination.totalPages}
              className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Suivant
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
