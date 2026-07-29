'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { BackLink, Card, BRAND_GRADIENT, BRAND_SHADOW, BRAND_FOCUS } from '@/components/ui';

export default function NouveauTicketPage() {
  const router = useRouter();
  const [sujet, setSujet] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ data: { id: number } }>('/tickets', { sujet, description });
      router.push(`/portal/tickets/${res.data.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    }
    setLoading(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <BackLink href="/portal/tickets" />
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">Nouveau ticket</h1>
      </div>

      <Card padded>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="sujet" className="block text-sm font-medium text-gray-700 mb-1.5">Sujet</label>
            <input
              id="sujet"
              type="text"
              required
              minLength={3}
              maxLength={255}
              value={sujet}
              onChange={e => setSujet(e.target.value)}
              className={`w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-gray-400 focus:bg-white ${BRAND_FOCUS}`}
              placeholder="Résumé de votre demande"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <textarea
              id="description"
              required
              minLength={10}
              rows={6}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className={`w-full rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 text-sm outline-none transition-all resize-none placeholder:text-gray-400 focus:bg-white ${BRAND_FOCUS}`}
              placeholder="Décrivez votre problème en détail..."
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-sm font-semibold hover:brightness-110 disabled:opacity-60 transition-all ${BRAND_GRADIENT} ${BRAND_SHADOW}`}
            >
              {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {loading ? 'Création...' : 'Créer le ticket'}
            </button>
            <Link href="/portal/tickets" className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              Annuler
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
