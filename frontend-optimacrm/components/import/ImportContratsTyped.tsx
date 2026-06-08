'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/lib/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface PreviewApercu {
  code_client: string;
  client: string;
  numero_contrat: string;
  statut: string;
  rubriques: number;
  montant_abonnement: number;
  ftc: number;
}

interface ImportPreview {
  total_lignes: number;
  contrats_a_creer: number;
  clients_matches: number;
  clients_manquants: { code: string; numero_contrat: string }[];
  exclus_incoherence: { code_client: string; numero_contrat: string }[];
  doublons: { numero_contrat: string; client: string }[];
  lignes_abonnement: number;
  lignes_ftc: number;
  statuts: Record<string, number>;
  apercu: PreviewApercu[];
  format?: string;
  type_contrat?: string;
}

interface ImportResult {
  contrats_crees: number;
  lignes_abonnement_creees: number;
  lignes_logiciels_creees?: number;
  lignes_ftc_creees: number;
  exclus_incoherence: number;
  client_manquant: number;
  doublons_ignores: number;
  erreurs: { ligne: number; message: string }[];
  format?: string;
  type_contrat?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Config par type
// ═══════════════════════════════════════════════════════════════════════════════

interface TypeConfig {
  type: string;
  title: string;
  subtitle: string;
  fileName: string;
  color: string;
  gradientFrom: string;
  gradientTo: string;
  shadowColor: string;
  icon: React.ReactNode;
  infoItems: string[];
  supportsLogiciels?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function formatMoney(n: number | null | undefined) {
  if (n == null || isNaN(n)) return '0,00 €';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

const STEPS = [
  { label: 'Upload', num: '1' },
  { label: 'Prévisualisation', num: '2' },
  { label: 'Résultat', num: '3' },
];

const STATUT_COLORS: Record<string, string> = {
  'Actif': 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  'Suspendu': 'bg-amber-50 text-amber-700 ring-amber-600/20',
  'Résilié': 'bg-red-50 text-red-700 ring-red-600/20',
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ImportContratsTyped({ config }: { config: TypeConfig }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Step 1
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileRef, setFileRef] = useState<File | null>(null);
  const logicielsInputRef = useRef<HTMLInputElement>(null);
  const [logicielsFile, setLogicielsFile] = useState<File | null>(null);

  // Step 2
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  // Step 3
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // ─── STEP 1: Upload & Preview ──────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls'].includes(ext || '')) {
      setToast({ message: 'Format non supporté. Utilisez un fichier Excel (.xlsx ou .xls).', type: 'error' });
      return;
    }

    setUploading(true);
    setFileName(file.name);
    setFileRef(file);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.upload<ApiResponse<ImportPreview>>(`/contrats/import/${config.type}/preview`, formData);
      setPreview(res.data);
      setStep(1);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors de l\'analyse du fichier', type: 'error' });
    } finally {
      setUploading(false);
    }
  }, [config.type]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ─── STEP 2 → 3: Execute Import ──────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!fileRef) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', fileRef);
      if (logicielsFile) {
        formData.append('logiciels', logicielsFile);
      }
      const res = await api.upload<ApiResponse<ImportResult>>(`/contrats/import/${config.type}/execute`, formData);
      setResult(res.data);
      setStep(2);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors de l\'import', type: 'error' });
    } finally {
      setImporting(false);
    }
  }, [fileRef, logicielsFile, config.type]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-medium shadow-xl ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          <span className="h-5 w-5 shrink-0">
            {toast.type === 'success'
              ? <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              : <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
            }
          </span>
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-70 cursor-pointer">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-4">
          <div className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${config.gradientFrom} ${config.gradientTo} flex items-center justify-center shadow-lg ${config.shadowColor} shrink-0`}>
            {config.icon}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{config.title}</h1>
            <p className="mt-0.5 text-sm text-gray-500">{config.subtitle}</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/dashboard/contrats')}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm transition cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
          Retour aux contrats
        </button>
      </div>

      {/* Stepper */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between max-w-xl mx-auto">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold transition-all ${
                i < step ? 'bg-emerald-500 text-white' :
                i === step ? `${config.color === 'green' ? 'bg-green-600 shadow-green-500/30' : 'bg-blue-600 shadow-blue-500/30'} text-white shadow-lg` :
                'bg-gray-100 text-gray-400'
              }`}>
                {i < step ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                ) : s.num}
              </div>
              <span className={`text-sm font-medium hidden sm:inline ${i === step ? (config.color === 'green' ? 'text-green-600' : 'text-blue-600') : i < step ? 'text-emerald-600' : 'text-gray-400'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className={`w-16 sm:w-24 h-0.5 mx-2 ${i < step ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ STEP 1: Upload ═══ */}
      {step === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <div
            className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
              dragOver
                ? (config.color === 'green' ? 'border-green-400 bg-green-50/50' : 'border-blue-400 bg-blue-50/50')
                : (config.color === 'green' ? 'border-gray-200 hover:border-green-300 hover:bg-gray-50/50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50/50')
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-4">
                <div className={`h-12 w-12 border-[3px] ${config.color === 'green' ? 'border-green-600' : 'border-blue-600'} border-t-transparent rounded-full animate-spin`} />
                <div>
                  <p className="text-sm font-medium text-gray-600">Analyse du fichier <span className="font-bold">{fileName}</span>...</p>
                  <p className="text-xs text-gray-400 mt-1">Vérification des clients, détection des doublons...</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className={`h-16 w-16 rounded-2xl ${config.color === 'green' ? 'bg-gradient-to-br from-green-50 to-emerald-50' : 'bg-gradient-to-br from-blue-50 to-indigo-50'} flex items-center justify-center`}>
                  <svg className={`h-8 w-8 ${config.color === 'green' ? 'text-green-500' : 'text-blue-500'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-700">Glissez-déposez votre fichier ici</p>
                  <p className="text-sm text-gray-400 mt-1">ou cliquez pour parcourir — fichier <span className="font-medium text-gray-500">{config.fileName}</span></p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-lg bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">XLSX</span>
                  <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">XLS</span>
                </div>
              </div>
            )}
          </div>

          {/* Fichier logiciels (Informatique uniquement) */}
          {config.supportsLogiciels && (
            <div className="mt-6">
              <div
                className={`relative border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
                  logicielsFile ? 'border-emerald-300 bg-emerald-50/30' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50/50'
                }`}
                onClick={() => logicielsInputRef.current?.click()}
              >
                <input
                  ref={logicielsInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setLogicielsFile(f); }}
                />
                {logicielsFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    <span className="text-sm font-medium text-emerald-700">{logicielsFile.name}</span>
                    <button onClick={(e) => { e.stopPropagation(); setLogicielsFile(null); }} className="text-gray-400 hover:text-red-500 cursor-pointer">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-medium text-gray-600">(Optionnel) Fichier <span className="font-semibold">Logiciels_INFORMATIQUE.xlsx</span></p>
                    <p className="text-xs text-gray-400">Licences et logiciels rattachés aux contrats</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Info box */}
          <div className={`mt-6 rounded-xl p-4 ${config.color === 'green' ? 'bg-green-50/50 border border-green-100' : 'bg-blue-50/50 border border-blue-100'}`}>
            <div className="flex gap-3">
              <svg className={`h-5 w-5 shrink-0 mt-0.5 ${config.color === 'green' ? 'text-green-500' : 'text-blue-500'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
              <div className={`text-sm ${config.color === 'green' ? 'text-green-800' : 'text-blue-800'}`}>
                <p className="font-semibold mb-1">Informations sur l&apos;import</p>
                <ul className={`list-disc list-inside text-xs space-y-0.5 ${config.color === 'green' ? 'text-green-700' : 'text-blue-700'}`}>
                  {config.infoItems.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 2: Preview ═══ */}
      {step === 1 && preview && (
        <div className="space-y-4">
          {/* Format détecté */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <svg className="h-5 w-5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            </svg>
            <div className="text-sm text-gray-700">
              <span className="font-medium">Format détecté :</span>{' '}
              <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">
                {preview.format === 'informatique' ? 'Informatique (une ligne par contrat)' :
                 preview.format === 'ligne_par_rubrique' ? 'Ligne par rubrique (avec montants)' :
                 'Flags 0/1 (sans montants détaillés)'}
              </span>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Lignes fichier" value={preview.total_lignes} color="gray" />
            <KpiCard label="Contrats à créer" value={preview.contrats_a_creer} color="emerald" />
            <KpiCard label="Clients matchés" value={preview.clients_matches} color="blue" />
            <KpiCard label="Lignes abonnement" value={preview.lignes_abonnement} color="violet" />
            <KpiCard label="Lignes FTC" value={preview.lignes_ftc} color="amber" />
            <KpiCard label="Doublons ignorés" value={preview.doublons.length} color="orange" />
          </div>

          {/* Statuts */}
          {Object.keys(preview.statuts).length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-sm font-bold text-gray-800 mb-3">Répartition par statut</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(preview.statuts).map(([statut, count]) => (
                  <span key={statut} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUT_COLORS[statut] || 'bg-gray-50 text-gray-700 ring-gray-500/20'}`}>
                    {statut} <span className="font-bold">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Exclusions */}
          {preview.exclus_incoherence.length > 0 && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                <div className="text-sm text-amber-800">
                  <p className="font-semibold mb-1">{preview.exclus_incoherence.length} contrat{preview.exclus_incoherence.length > 1 ? 's' : ''} exclu{preview.exclus_incoherence.length > 1 ? 's' : ''} (incohérence client)</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {preview.exclus_incoherence.map(e => (
                      <span key={e.code_client} className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-mono font-medium">{e.code_client}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Clients manquants */}
          {preview.clients_manquants.length > 0 && (
            <div className="bg-red-50 rounded-xl border border-red-100 p-4">
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                <div className="text-sm text-red-800">
                  <p className="font-semibold mb-1">{preview.clients_manquants.length} client{preview.clients_manquants.length > 1 ? 's' : ''} introuvable{preview.clients_manquants.length > 1 ? 's' : ''} en base</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {preview.clients_manquants.map(c => (
                      <span key={c.code} className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-mono font-medium">{c.code}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Doublons */}
          {preview.doublons.length > 0 && (
            <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" /></svg>
                <div className="text-sm text-orange-800">
                  <p className="font-semibold mb-1">{preview.doublons.length} doublon{preview.doublons.length > 1 ? 's' : ''} ignoré{preview.doublons.length > 1 ? 's' : ''}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {preview.doublons.slice(0, 20).map(d => (
                      <span key={d.numero_contrat} className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-mono font-medium">{d.numero_contrat} ({d.client})</span>
                    ))}
                    {preview.doublons.length > 20 && <span className="text-xs text-orange-600">... et {preview.doublons.length - 20} autres</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Aperçu table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800">Aperçu des contrats à importer</h3>
              <span className="text-xs text-gray-400">{Math.min(10, preview.apercu.length)} premiers sur {preview.contrats_a_creer}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Code client</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Client</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">N° Contrat</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Statut</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Rubriques</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Montant abon.</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">FTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {preview.apercu.map((row, i) => (
                    <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-2.5 text-xs font-mono text-gray-600">{row.code_client}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-800 font-medium truncate max-w-[200px]">{row.client}</td>
                      <td className="px-4 py-2.5 text-sm font-semibold text-gray-900">{row.numero_contrat}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUT_COLORS[row.statut] || 'bg-gray-50 text-gray-700 ring-gray-500/20'}`}>
                          {row.statut}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-sm text-gray-600">{row.rubriques}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-700">{formatMoney(row.montant_abonnement)}</td>
                      <td className="px-4 py-2.5 text-right text-sm text-gray-600">{row.ftc > 0 ? formatMoney(row.ftc) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Logiciels upload (étape 2, si pas encore fourni) */}
          {config.supportsLogiciels && !logicielsFile && (
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <svg className="h-5 w-5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>
                  <span className="text-sm text-blue-800">(Optionnel) Ajouter le fichier <strong>Logiciels_INFORMATIQUE.xlsx</strong> pour importer les licences</span>
                </div>
                <button
                  onClick={() => logicielsInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm transition cursor-pointer whitespace-nowrap"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Ajouter
                </button>
                <input
                  ref={logicielsInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setLogicielsFile(f); }}
                />
              </div>
            </div>
          )}

          {config.supportsLogiciels && logicielsFile && (
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                <span className="text-sm font-medium text-emerald-700">Fichier logiciels : {logicielsFile.name}</span>
                <button onClick={() => setLogicielsFile(null)} className="text-emerald-400 hover:text-red-500 ml-auto cursor-pointer">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setStep(0); setPreview(null); setFileRef(null); setFileName(''); setLogicielsFile(null); }}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm transition cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
              Choisir un autre fichier
            </button>
            <button
              onClick={handleImport}
              disabled={importing || preview.contrats_a_creer === 0}
              className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${config.gradientFrom} ${config.gradientTo} px-6 py-2.5 text-sm font-semibold text-white shadow-lg ${config.shadowColor} hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer`}
            >
              {importing ? (
                <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Import en cours...</>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                  Importer {preview.contrats_a_creer} contrats
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: Résultat ═══ */}
      {step === 2 && result && (
        <div className="space-y-4">
          {/* Success banner */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Import terminé avec succès !</h2>
            <p className="text-sm text-gray-500">
              {result.contrats_crees} contrats {config.type.toLowerCase()} créés avec {result.lignes_abonnement_creees} lignes d&apos;abonnement
              {(result.lignes_logiciels_creees ?? 0) > 0 && `, ${result.lignes_logiciels_creees} lignes logiciels`}
              {result.lignes_ftc_creees > 0 && ` et ${result.lignes_ftc_creees} lignes FTC`}
            </p>
          </div>

          {/* Result KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <ResultCard label="Contrats créés" value={result.contrats_crees} color="emerald" />
            <ResultCard label="Lignes abonnement" value={result.lignes_abonnement_creees} color="blue" />
            {config.supportsLogiciels && <ResultCard label="Lignes logiciels" value={result.lignes_logiciels_creees || 0} color="violet" />}
            <ResultCard label="Lignes FTC" value={result.lignes_ftc_creees} color="amber" />
            <ResultCard label="Clients manquants" value={result.client_manquant} color="red" />
            <ResultCard label="Doublons ignorés" value={result.doublons_ignores} color="orange" />
          </div>

          {/* Erreurs */}
          {result.erreurs.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Détail des erreurs ({result.erreurs.length})</h3>
              </div>
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase w-20">Ligne</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase">Erreur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result.erreurs.map((err, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 text-xs font-mono text-gray-500">{err.ligne}</td>
                        <td className="px-4 py-2 text-xs text-red-600">{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => router.push('/dashboard/contrats')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
              Voir les contrats
            </button>
            <button
              onClick={() => { setStep(0); setPreview(null); setResult(null); setFileRef(null); setFileName(''); setLogicielsFile(null); }}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm transition cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
              Importer un autre fichier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    gray: 'text-gray-700',
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
    violet: 'text-violet-600',
    amber: 'text-amber-600',
    orange: 'text-orange-600',
    red: 'text-red-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colorMap[color] || 'text-gray-700'}`}>{value}</p>
    </div>
  );
}

function ResultCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600',
    blue: 'text-blue-600',
    violet: 'text-violet-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
      <p className={`text-2xl font-bold ${colorMap[color] || 'text-gray-700'}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}
