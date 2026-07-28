'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ApiResponse, Tenant } from '@/lib/types';

// Minuscules, accents supprimés, tout ce qui n'est pas alphanumérique
// devient un tiret simple, pas de tiret en début/fin — doit rester cohérent
// avec SLUG_RE côté backend (superAdmin.service.js).
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function NouveauTenantPage() {
  const router = useRouter();
  const [nom, setNom] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleNomChange(value: string) {
    setNom(value);
    // Le slug se régénère automatiquement depuis le nom jusqu'à ce que
    // l'utilisateur le modifie lui-même (slugTouched) — ensuite, priorité
    // à sa saisie manuelle.
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post<ApiResponse<Tenant>>('/super-admin/tenants', { nom, slug });
      router.push(`/super-admin/tenants/${res.data.id}`);
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? (err as { message: string }).message
        : 'Une erreur est survenue';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg">
      <Link
        href="/super-admin/tenants"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
        </svg>
        Retour aux tenants
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Nouveau tenant</h1>
      <p className="text-gray-600 mb-6">Crée l&apos;organisation. Le premier administrateur se crée juste après, depuis sa page de détail.</p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={255}
            value={nom}
            onChange={(e) => handleNomChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
            placeholder="Client Démo"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={100}
            value={slug}
            onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 font-mono placeholder-gray-400 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 outline-none"
            placeholder="client-demo"
          />
          <p className="mt-1.5 text-xs text-gray-400">
            Identifiant unique de l&apos;organisation. Minuscules, chiffres et tirets uniquement.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/super-admin/tenants"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            Créer le tenant
          </button>
        </div>
      </form>
    </div>
  );
}
