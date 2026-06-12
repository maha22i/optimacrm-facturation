'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { TicketCategorie, PrioriteTicket, ApiResponse, PaginatedResponse, User, Client, ParcMachine } from '@/lib/types';

interface TicketCreateResponse {
  id: number;
  numero: string;
}

const PRIORITES: { value: PrioriteTicket; label: string }[] = [
  { value: 'basse', label: 'Basse' },
  { value: 'normale', label: 'Normale' },
  { value: 'haute', label: 'Haute' },
  { value: 'urgente', label: 'Urgente' },
];

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo

export default function NouveauTicketPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialClientId = searchParams.get('client_id');

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Data
  const [clients, setClients] = useState<Client[]>([]);
  const [machines, setMachines] = useState<ParcMachine[]>([]);
  const [categories, setCategories] = useState<TicketCategorie[]>([]);
  const [techniciens, setTechniciens] = useState<User[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(false);

  // Form
  const [sujet, setSujet] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState<number | ''>(initialClientId ? parseInt(initialClientId) : '');
  const [machineId, setMachineId] = useState<number | ''>('');
  const [categorieId, setCategorieId] = useState<number | ''>('');
  const [priorite, setPriorite] = useState<PrioriteTicket>('normale');
  const [technicienId, setTechnicienId] = useState<string>('');
  const [fichiers, setFichiers] = useState<File[]>([]);

  // Client search
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientSearchRef = useRef<HTMLDivElement>(null);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [clientsRes, categoriesRes, usersRes] = await Promise.all([
          api.get<PaginatedResponse<Client>>('/clients?limit=500'),
          api.get<ApiResponse<TicketCategorie[]>>('/tickets/categories'),
          api.get<PaginatedResponse<User>>('/auth/users'),
        ]);
        setClients(clientsRes.data);
        setCategories(categoriesRes.data.filter(c => c.actif));
        setTechniciens(usersRes.data);
      } catch {
        showToast('Erreur lors du chargement des données', 'error');
      }
    };
    loadData();
  }, [showToast]);

  // Load machines when client changes
  useEffect(() => {
    if (!clientId) {
      setMachines([]);
      setMachineId('');
      return;
    }
    const loadMachines = async () => {
      setMachinesLoading(true);
      try {
        const res = await api.get<PaginatedResponse<ParcMachine>>(`/parc-machines?client_id=${clientId}&limit=200`);
        setMachines(res.data);
      } catch {
        setMachines([]);
      } finally {
        setMachinesLoading(false);
      }
    };
    loadMachines();
    setMachineId('');
  }, [clientId]);

  // Auto-fill technician when category changes
  useEffect(() => {
    if (!categorieId) return;
    const cat = categories.find(c => c.id === categorieId);
    if (cat?.technicien_defaut_id) {
      setTechnicienId(cat.technicien_defaut_id);
    }
  }, [categorieId, categories]);

  // Close client dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (clientSearchRef.current && !clientSearchRef.current.contains(e.target as Node)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filteredClients = clients.filter(c =>
    c.raison_sociale.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const selectedClient = clients.find(c => c.id === clientId);

  // File handling
  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  }, []);

  const addFiles = (newFiles: File[]) => {
    const valid: File[] = [];
    for (const f of newFiles) {
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
    setFichiers(prev => [...prev, ...valid]);
  };

  const removeFile = (index: number) => {
    setFichiers(prev => prev.filter((_, i) => i !== index));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!sujet.trim()) errs.sujet = 'Le sujet est requis';
    if (!clientId) errs.client = 'Le client est requis';
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
      const res = await api.post<ApiResponse<TicketCreateResponse>>('/tickets', {
        sujet: sujet.trim(),
        description: description.trim() || null,
        client_id: clientId,
        machine_id: machineId || null,
        categorie_id: categorieId,
        priorite,
        technicien_id: technicienId || null,
        pieces_jointes: [],
      });
      showToast('Ticket créé avec succès', 'success');
      setTimeout(() => router.push(`/dashboard/tickets/${res.data.id}`), 400);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Erreur lors de la création du ticket', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/dashboard/tickets')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition mb-3 cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Retour aux tickets
        </button>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z" />
            </svg>
          </span>
          Nouveau ticket
        </h1>
        <p className="mt-1 text-sm text-gray-500 ml-[52px]">Créer un ticket de support</p>
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

            {/* Client (searchable) */}
            <div ref={clientSearchRef} className="relative">
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Client <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={clientDropdownOpen ? clientSearch : (selectedClient?.raison_sociale || clientSearch)}
                  onChange={e => {
                    setClientSearch(e.target.value);
                    setClientDropdownOpen(true);
                    if (clientId) {
                      setClientId('');
                      setErrors(prev => ({ ...prev, client: '' }));
                    }
                  }}
                  onFocus={() => setClientDropdownOpen(true)}
                  placeholder="Rechercher un client..."
                  className={`w-full rounded-xl border px-4 py-2.5 text-sm text-gray-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none transition pr-10 ${errors.client ? 'border-red-300' : 'border-gray-200'}`}
                />
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>
              {errors.client && <p className="mt-1 text-xs text-red-500">{errors.client}</p>}
              {clientDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                  {filteredClients.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-400">Aucun client trouvé</div>
                  ) : (
                    filteredClients.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setClientId(c.id);
                          setClientSearch(c.raison_sociale);
                          setClientDropdownOpen(false);
                          setErrors(prev => ({ ...prev, client: '' }));
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition cursor-pointer ${clientId === c.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
                      >
                        <span className="font-medium">{c.raison_sociale}</span>
                        <span className="ml-2 text-xs text-gray-400">{c.numero_client}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Machine */}
            {clientId && (
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
            )}

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

            {/* Technicien */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Technicien</label>
              <div className="relative">
                <select
                  value={technicienId}
                  onChange={e => setTechnicienId(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-800 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10 outline-none transition appearance-none pr-10"
                >
                  <option value="">— Non assigné —</option>
                  {techniciens.map(t => (
                    <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                  ))}
                </select>
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
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

              {fichiers.length > 0 && (
                <div className="mt-3 space-y-2">
                  {fichiers.map((f, i) => {
                    const isImage = f.type.startsWith('image/');
                    return (
                      <div key={i} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2 border border-gray-100">
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
                          <p className="text-xs text-gray-400">{(f.size / 1024).toFixed(0)} Ko</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeFile(i); }}
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
              onClick={() => router.push('/dashboard/tickets')}
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
                  Création...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Créer le ticket
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
