'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { statutColor, statutDotColor, prioriteColor, prioriteDotColor } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Classes de marque — dérivées des variables CSS --brand-* (voir lib/color.ts)
// pour que boutons, liens et champs s'adaptent à la société du client final.
// ---------------------------------------------------------------------------

export const BRAND_GRADIENT = 'bg-[linear-gradient(to_right,var(--brand),var(--brand-dark))]';
export const BRAND_GRADIENT_DIAGONAL = 'bg-[linear-gradient(135deg,var(--brand),var(--brand-dark))]';
export const BRAND_SHADOW = 'shadow-[0_10px_25px_-6px_var(--brand-shadow)]';
export const BRAND_SHADOW_SM = 'shadow-[0_6px_16px_-4px_var(--brand-shadow)]';
export const BRAND_BUTTON = `inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60 disabled:hover:brightness-100 ${BRAND_GRADIENT} ${BRAND_SHADOW}`;
export const BRAND_LINK = 'text-[var(--brand)] hover:text-[var(--brand-dark)]';
export const BRAND_FOCUS = 'focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-ring)]';
export const BRAND_SPINNER = 'border-[var(--brand-light)] border-t-[var(--brand)]';

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function Card({ children, className = '', padded = false }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${padded ? 'p-5 sm:p-6' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-3.5">
        {icon && (
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white ${BRAND_GRADIENT_DIAGONAL} ${BRAND_SHADOW_SM}`}>
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
    >
      <ArrowLeftIcon className="h-4.5 w-4.5" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statutColor(status)}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statutDotColor(status)}`} />
      {label ?? status}
    </span>
  );
}

export function PrioriteBadge({ priorite }: { priorite: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${prioriteColor(priorite)}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${prioriteDotColor(priorite)}`} />
      {priorite}
    </span>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export function EmptyState({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 text-gray-300">
        {icon ?? <InboxIcon className="h-7 w-7" />}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700">{title}</p>
        {description && <p className="mt-1 text-xs text-gray-400">{description}</p>}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-gray-50">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-5 py-3.5">
              <div className="h-4 animate-pulse rounded-md bg-gray-100" style={{ width: `${55 + ((i + j) % 4) * 12}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Search / Pagination
// ---------------------------------------------------------------------------

export function SearchInput({
  value,
  onChange,
  placeholder = 'Rechercher...',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full max-w-xs">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
        <SearchIcon className="h-4 w-4" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl border border-gray-200 bg-gray-50/60 py-2.5 pl-9 pr-3 text-sm outline-none transition-all placeholder:text-gray-400 focus:bg-white ${BRAND_FOCUS}`}
      />
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Précédent
      </button>
      <span className="text-xs font-medium text-gray-400">
        Page <span className="text-gray-700">{page}</span> / {totalPages}
      </span>
      <button
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Suivant
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ligne de tableau cliquable (navigue vers le détail, sauf clic sur un lien
// ou bouton imbriqué — ex: bouton de téléchargement dans la dernière colonne)
// ---------------------------------------------------------------------------

export function RowLink({ href, className = '', children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();

  function handleClick(e: MouseEvent<HTMLTableRowElement>) {
    if ((e.target as HTMLElement).closest('a, button')) return;
    router.push(href);
  }

  return (
    <tr onClick={handleClick} className={`cursor-pointer ${className}`}>
      {children}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Dashboard stat card
// ---------------------------------------------------------------------------

export function StatCard({
  href,
  label,
  value,
  icon,
  accent = 'indigo',
  cta = 'Voir le détail',
}: {
  href: string;
  label: string;
  value: ReactNode;
  icon: ReactNode;
  accent?: 'indigo' | 'fuchsia' | 'emerald' | 'amber';
  cta?: string;
}) {
  const accents: Record<string, string> = {
    indigo: `${BRAND_GRADIENT_DIAGONAL} ${BRAND_SHADOW_SM}`,
    fuchsia: 'bg-gradient-to-br from-fuchsia-500 to-fuchsia-600 shadow-lg shadow-fuchsia-500/20',
    emerald: 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/20',
    amber: 'bg-gradient-to-br from-amber-500 to-amber-600 shadow-lg shadow-amber-500/20',
  };
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-lg hover:shadow-gray-200/60"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">{value}</p>
        </div>
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white ${accents[accent]}`}>
          {icon}
        </div>
      </div>
      <p className={`mt-4 flex items-center gap-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100 ${BRAND_LINK}`}>
        {cta}
        <ArrowRightIcon className="h-3.5 w-3.5" />
      </p>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

type IconProps = { className?: string };

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

export function XIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export function LogoutIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

export function InboxIcon({ className }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.36a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
    </svg>
  );
}
