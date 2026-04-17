'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { CatalogueProduit, Fournisseur, ApiResponse, PaginatedResponse } from '@/lib/types';

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-medium shadow-xl ${
      type === 'success'
        ? 'bg-emerald-600 text-white shadow-emerald-500/20'
        : 'bg-red-600 text-white shadow-red-500/20'
    }`}>
      <span className="h-5 w-5 shrink-0">
        {type === 'success' ? (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
        ) : (
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
        )}
      </span>
      {message}
      <button onClick={onClose} className="ml-2 hover:opacity-70 cursor-pointer">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

const CATEGORIE_COLORS: Record<string, string> = {
  COPIEUR: 'bg-pink-50 text-pink-700',
  TELEPHONIE: 'bg-blue-50 text-blue-700',
  INFORMATIQUE: 'bg-emerald-50 text-emerald-700',
  SECURITE: 'bg-orange-50 text-orange-700',
};

export default function CataloguePage() {
  const router = useRouter();
  const [produits, setProduits] = useState<CatalogueProduit[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');
  const [categorieFilter, setCategorieFilter] = useState('');
  const [fournisseurFilter, setFournisseurFilter] = useState('');
  const [actifFilter, setActifFilter] = useState<'' | 'true' | 'false'>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounce(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<string[]>>('/catalogue/categories');
      setCategories(res.data);
    } catch { setCategories([]); }
  }, []);

  const fetchFournisseurs = useCallback(async () => {
    try {
      const res = await api.get<PaginatedResponse<Fournisseur>>('/fournisseurs?limit=200&actif=true');
      setFournisseurs(res.data);
    } catch { setFournisseurs([]); }
  }, []);

  const fetchProduits = useCallback(async (page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (searchDebounce) params.set('search', searchDebounce);
      if (categorieFilter) params.set('categorie', categorieFilter);
      if (actifFilter) params.set('actif', actifFilter);
      if (fournisseurFilter) params.set('fournisseur_id', fournisseurFilter);

      const res = await api.get<PaginatedResponse<CatalogueProduit>>(`/catalogue?${params}`);
      setProduits(res.data);
      setPagination(res.pagination);
    } catch {
      setProduits([]);
    } finally {
      setLoading(false);
    }
  }, [searchDebounce, categorieFilter, actifFilter, fournisseurFilter]);

  useEffect(() => { fetchCategories(); fetchFournisseurs(); }, [fetchCategories, fetchFournisseurs]);
  useEffect(() => { fetchProduits(1); }, [fetchProduits]);

  const handleDelete = async (id: number) => {
    setDeleting(true);
    try {
      await api.delete<ApiResponse<null>>(`/catalogue/${id}`);
      setToast({ message: 'Produit/service désactivé', type: 'success' });
      setDeleteConfirmId(null);
      fetchProduits(pagination.page);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la suppression';
      setToast({ message, type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const formatPrice = (value: number) =>
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);

  const pageNumbers = () => {
    const pages: (number | string)[] = [];
    const { page, totalPages } = pagination;
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const catBadge = (cat: string | null) => {
    if (!cat) return <span className="text-xs text-gray-300">&mdash;</span>;
    const colors = CATEGORIE_COLORS[cat] || 'bg-violet-50 text-violet-700';
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${colors}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
        {cat}
      </span>
    );
  };

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
            </span>
            Catalogue
          </h1>
          <p className="mt-1 text-sm text-gray-500 ml-[52px]">Gérez vos produits et services</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={() => fetchProduits(pagination.page)}
            title="Actualiser"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
            <span className="hidden xl:inline">Actualiser</span>
          </button>
          <button
            onClick={() => router.push('/dashboard/catalogue/import')}
            title="Importer"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm transition cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
            <span className="hidden xl:inline">Importer</span>
          </button>
          <button
            onClick={() => router.push('/dashboard/catalogue/nouveau')}
            title="Nouveau produit/service"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 xl:px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-700 hover:to-indigo-700 transition-all cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            <span className="hidden xl:inline">Nouveau produit/service</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
          <div className="flex-1 relative w-full lg:max-w-md">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            <input
              type="text"
              placeholder="Rechercher (référence, désignation, description...)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-10 pr-4 text-sm placeholder-gray-400 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none transition"
            />
          </div>

          <div className="relative">
            <select
              value={categorieFilter}
              onChange={e => setCategorieFilter(e.target.value)}
              className="appearance-none rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-4 pr-10 text-sm font-medium text-gray-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none transition cursor-pointer"
            >
              <option value="">Toutes les catégories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
          </div>

          <div className="relative">
            <select
              value={fournisseurFilter}
              onChange={e => setFournisseurFilter(e.target.value)}
              className="appearance-none rounded-xl bg-gray-50 border border-gray-200 py-2.5 pl-4 pr-10 text-sm font-medium text-gray-700 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none transition cursor-pointer"
            >
              <option value="">Tous les fournisseurs</option>
              {fournisseurs.map(f => (
                <option key={f.id} value={f.id}>{f.nom}</option>
              ))}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
          </div>

          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {([
              { label: 'Tous', value: '' as const },
              { label: 'Actifs', value: 'true' as const },
              { label: 'Inactifs', value: 'false' as const },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setActifFilter(opt.value)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  actifFilter === opt.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {(search || categorieFilter || actifFilter || fournisseurFilter) && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400 font-medium">Filtres actifs :</span>
            {search && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                &quot;{search}&quot;
                <button onClick={() => setSearch('')} className="hover:text-blue-900 cursor-pointer">&times;</button>
              </span>
            )}
            {categorieFilter && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                {categorieFilter}
                <button onClick={() => setCategorieFilter('')} className="hover:text-violet-900 cursor-pointer">&times;</button>
              </span>
            )}
            {fournisseurFilter && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                {fournisseurs.find(f => String(f.id) === fournisseurFilter)?.nom || 'Fournisseur'}
                <button onClick={() => setFournisseurFilter('')} className="hover:text-green-900 cursor-pointer">&times;</button>
              </span>
            )}
            {actifFilter && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                {actifFilter === 'true' ? 'Actifs' : 'Inactifs'}
                <button onClick={() => setActifFilter('')} className="hover:text-blue-900 cursor-pointer">&times;</button>
              </span>
            )}
            <button
              onClick={() => { setSearch(''); setCategorieFilter(''); setActifFilter(''); setFournisseurFilter(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 font-medium ml-1 cursor-pointer"
            >
              Tout effacer
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">
          <span className="font-semibold text-gray-700">{pagination.total}</span> produit{pagination.total > 1 ? 's' : ''}/service{pagination.total > 1 ? 's' : ''}
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80">
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Référence</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Désignation</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Catégorie</th>
                <th className="px-4 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Fournisseur</th>
                <th className="px-4 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Prix HT</th>
                <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">TVA</th>
                <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Unité</th>
                <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Actif</th>
                <th className="px-4 py-3.5 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={9} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
                    <p className="text-sm text-gray-400">Chargement du catalogue...</p>
                  </div>
                </td></tr>
              ) : produits.length === 0 ? (
                <tr><td colSpan={9} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <svg className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-500">Aucun produit ou service trouvé</p>
                      <p className="text-xs text-gray-400 mt-0.5">Modifiez vos filtres ou ajoutez un nouvel élément</p>
                    </div>
                    <button
                      onClick={() => router.push('/dashboard/catalogue/nouveau')}
                      className="mt-2 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition cursor-pointer"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                      Ajouter un produit/service
                    </button>
                  </div>
                </td></tr>
              ) : produits.map(produit => (
                <tr
                  key={produit.id}
                  onClick={() => router.push(`/dashboard/catalogue/${produit.id}`)}
                  className="group hover:bg-blue-50/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-bold text-gray-400 font-mono">{produit.reference}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">{produit.designation}</p>
                      {produit.description && (
                        <p className="text-[11px] text-gray-400 truncate max-w-[250px]">{produit.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">{catBadge(produit.categorie)}</td>
                  <td className="px-4 py-3.5">
                    {produit.fournisseur_nom ? (
                      <span className="text-sm text-gray-700">{produit.fournisseur_nom}</span>
                    ) : (
                      <span className="text-xs text-gray-300">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-sm font-semibold text-gray-900">{formatPrice(produit.prix_unitaire_ht)}</span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-xs font-medium text-gray-500">{produit.taux_tva}%</span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-xs font-medium text-gray-500 capitalize">{produit.unite}</span>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    {produit.actif ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Actif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                        Inactif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/dashboard/catalogue/${produit.id}`); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition cursor-pointer"
                        title="Modifier"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" /></svg>
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirmId(produit.id); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                        title="Désactiver"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
            <p className="text-sm text-gray-500">
              Affichage de <span className="font-medium text-gray-700">{(pagination.page - 1) * pagination.limit + 1}</span> à{' '}
              <span className="font-medium text-gray-700">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> sur{' '}
              <span className="font-medium text-gray-700">{pagination.total}</span>
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={pagination.page <= 1}
                onClick={() => fetchProduits(pagination.page - 1)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
              </button>
              {pageNumbers().map((p, i) =>
                typeof p === 'string' ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-gray-400 text-sm">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => fetchProduits(p)}
                    className={`h-8 w-8 rounded-lg text-sm font-medium transition cursor-pointer ${
                      p === pagination.page
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchProduits(pagination.page + 1)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation */}
      {deleteConfirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-11 w-11 rounded-xl bg-red-50 flex items-center justify-center">
                <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Confirmer la désactivation</h3>
                <p className="text-xs text-gray-400">Le produit sera marqué comme inactif</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Êtes-vous sûr de vouloir désactiver ce produit/service ? Il ne sera plus visible dans le catalogue actif.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 shadow-lg shadow-red-500/25 transition disabled:opacity-50 cursor-pointer"
              >
                {deleting ? (
                  <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Désactivation...</>
                ) : 'Désactiver'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
