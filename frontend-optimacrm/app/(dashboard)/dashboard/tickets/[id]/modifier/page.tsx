'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import Link from 'next/link';
import type {
  TicketDetail,
  TicketCategorie,
  ApiResponse,
  PaginatedResponse,
  ParcMachine,
  PrioriteTicket,
} from '@/lib/types';

const PRIORITES: { value: PrioriteTicket; label: string }[] = [
  { value: 'basse', label: 'Basse' },
  { value: 'normale', label: 'Normale' },
  { value: 'haute', label: 'Haute' },
  { value: 'urgente', label: 'Urgente' },
];

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function ModifierTicketPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [categories, setCategories] = useState<TicketCategorie[]>([]);
  const [machines, setMachines] = useState<ParcMachine[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(false);

  const [sujet, setSujet] = useState('');
  const [description, setDescription] = useState('');
  const [categorieId, setCategorieId] = useState<number | ''>('');
  const [priorite, setPriorite] = useState<PrioriteTicket>('normale');
  const [machineId, setMachineId] = useState<number | ''>('');
  const [existingFiles, setExistingFiles] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [ticketRes, categoriesRes] = await Promise.all([
          api.get<ApiResponse<TicketDetail>>(`/tickets/${ticketId}`),
          api.get<ApiResponse<TicketCategorie[]>>('/tickets/categories'),
        ]);

        const t = ticketRes.data;
        setTicket(t);
        setSujet(t.sujet);
        setDescription(t.description || '');
        setCategorieId(t.categorie_id || '');
        setPriorite(t.priorite);
        setMachineId(t.machine_id || '');
        setExistingFiles(t.pieces_jointes || []);
        setCategories(categoriesRes.data.filter(c => c.actif));

        if (t.client_id) {
          setMachinesLoading(true);
          try {
            const machinesRes = await api.get<PaginatedResponse<ParcMachine>>(
              `/parc-machines?client_id=${t.client_id}&limit=200`
            );
            setMachines(machinesRes.data);
          } catch {
            setMachines([]);
          } finally {
            setMachinesLoading(false);
          }
        }
      } catch {
        showToast('Erreur lors du chargement du ticket', 'error');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [ticketId, showToast]);

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  }, []);

  const addFiles = (files: File[]) => {
    const valid: File[] = [];
    for (const f of files) {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        showToast(`Format non supporté : ${f.name}`, 'error');
        continue;
      }
      if (f.size > MAX_FILE_SIZE) {
        showToast(`Fichier trop volumineux : ${f.name} (max 5 Mo)`, 'error');
        continue;
      }
      valid.push(f);
    }
    setNewFiles(prev => [...prev, ...valid]);
  };

  const removeExistingFile = (index: number) => {
    setExistingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeNewFile = (index: number) => {
    setNewFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileName = (url: string): string => {
    try {
      return decodeURIComponent(url.split('/').pop() || url);
    } catch {
      return url.split('/').pop() || url;
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!sujet.trim()) errs.sujet = 'Le sujet est requis';
    if (!categorieId) errs.categorie = 'La catégorie est requise';
    if (!priorite) errs.priorite = 'La priorité est requise';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await api.put(`/tickets/${ticketId}`, {
        sujet: sujet.trim(),
        description: description.trim() || null,
        categorie_id: categorieId || null,
        priorite,
        machine_id: machineId || null,
        pieces_jointes: existingFiles,
      });
      showToast('Ticket mis à jour', 'success');
      setTimeout(() => router.push(`/dashboard/tickets/${ticketId}`), 400);
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Erreur lors de la mise à jour du ticket',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-[3px] border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 text-sm">Ticket introuvable</p>
        <Link
          href="/dashboard/tickets"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 transition"
        >
          ← Retour aux tickets
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/dashboard/tickets/${ticketId}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition mb-3"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Retour au ticket
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
            </svg>
          </span>
          Modifier le ticket
        </h1>
        <p className="mt-1 text-sm text-gray-500 ml-[52px]">{ticket.numero}</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="space-y-5">
            {/* Sujet */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Sujet <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={sujet}
                onChange={e => { setSujet(e.target.value); setErrors(prev => ({ ...prev, sujet: '' })); }}
                placeholder="Décrivez brièvement le problème..."
                className={`w-full rounded-xl border px-4 py-2.5 text-sm text-gray-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none transition ${errors.sujet ? 'border-red-300' : 'border-gray-200'}`}
              />
              {errors.sujet && <p className="mt-1 text-xs text-red-500">{errors.sujet}</p>}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Détaillez le problème, les étapes pour le reproduire..."
                style={{ height: 150 }}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none transition resize-none"
              />
            </div>

            {/* Client (read-only) */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Client</label>
              <input
                type="text"
                value={ticket.client_nom || `Client #${ticket.client_id}`}
                readOnly
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-800 outline-none bg-gray-50 cursor-not-allowed opacity-75"
              />
              <p className="mt-1 text-xs text-gray-400">Le client ne peut pas être modifié après la création</p>
            </div>

            {/* Machine */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Machine</label>
              <div className="relative">
                <select
                  value={machineId}
                  onChange={e => setMachineId(e.target.value ? Number(e.target.value) : '')}
                  disabled={machinesLoading}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none transition appearance-none pr-10"
                >
                  <option value="">— Aucune machine —</option>
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.numero_serie} — {m.designation}{m.marque ? ` (${m.marque})` : ''}
                    </option>
                  ))}
                </select>
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
              {machinesLoading && (
                <p className="mt-1 text-xs text-gray-400">Chargement des machines...</p>
              )}
              {!machinesLoading && machines.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">Aucune machine pour ce client</p>
              )}
            </div>

            {/* Catégorie & Priorité */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Catégorie <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={categorieId}
                    onChange={e => { setCategorieId(e.target.value ? Number(e.target.value) : ''); setErrors(prev => ({ ...prev, categorie: '' })); }}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm text-gray-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none transition appearance-none pr-10 ${errors.categorie ? 'border-red-300' : 'border-gray-200'}`}
                  >
                    <option value="">— Sélectionner —</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.nom}</option>
                    ))}
                  </select>
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
                {errors.categorie && <p className="mt-1 text-xs text-red-500">{errors.categorie}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Priorité <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={priorite}
                    onChange={e => { setPriorite(e.target.value as PrioriteTicket); setErrors(prev => ({ ...prev, priorite: '' })); }}
                    className={`w-full rounded-xl border px-4 py-2.5 text-sm text-gray-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none transition appearance-none pr-10 ${errors.priorite ? 'border-red-300' : 'border-gray-200'}`}
                  >
                    {PRIORITES.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
                {errors.priorite && <p className="mt-1 text-xs text-red-500">{errors.priorite}</p>}
              </div>
            </div>

            {/* Pièces jointes */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Pièces jointes</label>
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-300 transition-colors cursor-pointer"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <svg className="mx-auto h-10 w-10 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-gray-500">
                  Glissez-déposez vos fichiers ici ou <span className="text-blue-600 font-medium">parcourir</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">Formats : JPG, PNG, PDF. Max 5 Mo par fichier.</p>
              </div>

              {/* Existing attachments */}
              {existingFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {existingFiles.map((url, i) => {
                    const name = getFileName(url);
                    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
                    return (
                      <div key={`existing-${i}`} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 border border-gray-100">
                        {isImage ? (
                          <img src={url} alt={name} className="h-10 w-10 rounded object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-red-50 flex items-center justify-center">
                            <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 font-medium truncate">{name}</p>
                          <p className="text-xs text-gray-400">Fichier existant</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeExistingFile(i); }}
                          className="h-7 w-7 rounded-lg bg-gray-200 hover:bg-red-100 flex items-center justify-center transition cursor-pointer"
                        >
                          <svg className="h-4 w-4 text-gray-500 hover:text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* New files */}
              {newFiles.length > 0 && (
                <div className={`${existingFiles.length > 0 ? 'mt-2' : 'mt-3'} space-y-2`}>
                  {newFiles.map((f, i) => {
                    const isImage = f.type.startsWith('image/');
                    return (
                      <div key={`new-${i}`} className="flex items-center gap-3 rounded-lg bg-blue-50 px-3 py-2 border border-blue-100">
                        {isImage ? (
                          <img
                            src={URL.createObjectURL(f)}
                            alt={f.name}
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-red-50 flex items-center justify-center">
                            <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 font-medium truncate">{f.name}</p>
                          <p className="text-xs text-gray-400">{(f.size / 1024).toFixed(0)} Ko — Nouveau</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeNewFile(i); }}
                          className="h-7 w-7 rounded-lg bg-gray-200 hover:bg-red-100 flex items-center justify-center transition cursor-pointer"
                        >
                          <svg className="h-4 w-4 text-gray-500 hover:text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={() => router.push(`/dashboard/tickets/${ticketId}`)}
              className="bg-gray-100 text-gray-600 hover:bg-gray-200 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl font-semibold text-sm shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Enregistrer les modifications
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-lg ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
