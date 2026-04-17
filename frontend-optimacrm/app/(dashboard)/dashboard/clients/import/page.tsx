'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type {
  ApiResponse, ImportParseResult, ImportClientValidationResult, ImportClientExecuteResult,
  ImportMapping, ImportFieldGroup, ImportSavedMapping, ChampConfig, SectionInfo,
  ImportClientMapping,
} from '@/lib/types';
import MappingSelect from '@/components/import/MappingSelect';
import CreateFieldModal from '@/components/import/CreateFieldModal';
import CreateFieldsBulkModal from '@/components/import/CreateFieldsBulkModal';
import type { UnmappedColumn } from '@/components/import/CreateFieldsBulkModal';

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED UI
// ═══════════════════════════════════════════════════════════════════════════════

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-medium shadow-xl ${
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
    }`}>
      <span className="h-5 w-5 shrink-0">
        {type === 'success'
          ? <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          : <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
        }
      </span>
      {message}
      <button onClick={onClose} className="ml-2 hover:opacity-70 cursor-pointer"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button>
    </div>
  );
}

const STEPS = [
  { label: 'Upload', icon: '1' },
  { label: 'Mapping', icon: '2' },
  { label: 'Validation', icon: '3' },
  { label: 'Résultat', icon: '4' },
];

const CLIENT_ENTITY = 'CLIENT';

const CLIENT_GROUP_ICONS: Record<string, string> = {
  'Identification': '🏢',
  'Coordonnées': '📞',
  'Adresse': '📍',
  'Contact principal': '👤',
  'Contact secondaire': '👥',
  'Paiement / Banque': '💳',
  'Commercial / CRM': '📊',
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ImportClientsPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Step 1 — Upload
  const [uploading, setUploading] = useState(false);
  const [parseResult, setParseResult] = useState<ImportParseResult | null>(null);
  const [autoIgnoredHeaders, setAutoIgnoredHeaders] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');

  // Step 2 — Mapping
  const [userMappings, setUserMappings] = useState<Record<string, string | null>>({});
  const [options, setOptions] = useState({
    skip_empty_code: true,
    update_existing: false,
  });
  const [savedMappings, setSavedMappings] = useState<ImportSavedMapping[]>([]);
  const [saveMappingName, setSaveMappingName] = useState('');
  const [showSaveMapping, setShowSaveMapping] = useState(false);

  // Custom field creation modals
  const [sections, setSections] = useState<SectionInfo[]>([]);
  const [createFieldOpen, setCreateFieldOpen] = useState(false);
  const [createFieldHeader, setCreateFieldHeader] = useState('');
  const [createBulkOpen, setCreateBulkOpen] = useState(false);

  // Step 3 — Validation
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ImportClientValidationResult | null>(null);
  const [validationFilter, setValidationFilter] = useState<'all' | 'valid' | 'error' | 'skipped'>('all');

  // Step 4 — Résultat
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<ImportClientExecuteResult | null>(null);

  // Load saved mappings + sections
  useEffect(() => {
    api.get<ApiResponse<ImportSavedMapping[]>>('/import/clients/mappings')
      .then(res => setSavedMappings(res.data || []))
      .catch(() => {});
    api.get<ApiResponse<SectionInfo[]>>(`/champs-config/sections?entite=${CLIENT_ENTITY}`)
      .then(res => setSections(res.data || []))
      .catch(() => {});
  }, []);

  // ─── STEP 1: Upload ───────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      setToast({ message: 'Format non supporté. Utilisez CSV, XLSX ou XLS.', type: 'error' });
      return;
    }

    setUploading(true);
    setFileName(file.name);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.upload<ApiResponse<ImportParseResult>>('/import/clients/parse', formData);
      setParseResult(res.data);

      const initial: Record<string, string | null> = {};
      const ignored = new Set<string>();
      for (const m of (res.data.mappings as ImportClientMapping[])) {
        initial[m.source_header] = m.suggested_field;
        if (m.auto_ignored) ignored.add(m.source_header);
      }
      setUserMappings(initial);
      setAutoIgnoredHeaders(ignored);
      setStep(1);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors du parsing', type: 'error' });
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ─── STEP 2: Mapping helpers ──────────────────────────────────────────────

  const getOriginalMapping = (header: string): ImportMapping | undefined => {
    return parseResult?.mappings.find(m => m.source_header === header);
  };

  const getConfidence = (header: string): number => {
    if (autoIgnoredHeaders.has(header) && !userMappings[header]) return -1;
    const field = userMappings[header];
    const original = getOriginalMapping(header);
    if (!field) return 0;
    if (original?.suggested_field === field) return original.confidence;
    return 1.0;
  };

  const handleLoadMapping = (mapping: ImportSavedMapping) => {
    setUserMappings(mapping.mapping);
    setToast({ message: `Mapping "${mapping.name}" chargé`, type: 'success' });
  };

  const handleSaveMapping = async () => {
    if (!saveMappingName.trim()) return;
    try {
      const res = await api.post<ApiResponse<ImportSavedMapping>>('/import/clients/mappings', {
        name: saveMappingName.trim(),
        mapping: userMappings,
      });
      setSavedMappings(prev => {
        const filtered = prev.filter(m => m.id !== res.data.id);
        return [res.data, ...filtered];
      });
      setShowSaveMapping(false);
      setSaveMappingName('');
      setToast({ message: 'Mapping sauvegardé', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur', type: 'error' });
    }
  };

  const handleDeleteMapping = async (id: number) => {
    try {
      await api.delete(`/import/clients/mappings/${id}`);
      setSavedMappings(prev => prev.filter(m => m.id !== id));
    } catch {}
  };

  // ─── Custom Field Creation helpers ──────────────────────────────────────────

  const refreshCustomFields = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<ChampConfig[]>>(`/champs-config?entite=${CLIENT_ENTITY}&actif=true`);
      const configs = res.data || [];

      const groupMap: Record<string, ImportFieldGroup> = {};
      for (const c of configs) {
        if (!groupMap[c.section]) groupMap[c.section] = { group: c.section, fields: [] };
        groupMap[c.section].fields.push({
          key: `custom_${c.cle}`,
          label: c.label,
          required: c.obligatoire,
          type: c.type,
        });
      }

      if (parseResult) {
        parseResult.available_fields.custom = Object.values(groupMap);
      }

      const secRes = await api.get<ApiResponse<SectionInfo[]>>(`/champs-config/sections?entite=${CLIENT_ENTITY}`);
      setSections(secRes.data || []);
    } catch { /* keep current state */ }
  }, [parseResult]);

  const handleFieldCreated = useCallback(async (field: ChampConfig, header?: string) => {
    await refreshCustomFields();
    const fieldKey = `custom_${field.cle}`;
    if (header) {
      setUserMappings(prev => ({ ...prev, [header]: fieldKey }));
    }
    setToast({ message: `Champ "${field.label}" créé et mappé avec succès`, type: 'success' });
  }, [refreshCustomFields]);

  const handleBulkFieldsCreated = useCallback(async (_fields: ChampConfig[], headerToSlugMap: Record<string, string>) => {
    await refreshCustomFields();
    setUserMappings(prev => {
      const updated = { ...prev };
      for (const [header, key] of Object.entries(headerToSlugMap)) {
        updated[header] = key;
      }
      return updated;
    });
    const count = Object.keys(headerToSlugMap).length;
    setToast({ message: `${count} champ${count > 1 ? 's' : ''} créé${count > 1 ? 's' : ''} et mappé${count > 1 ? 's' : ''} avec succès`, type: 'success' });
  }, [refreshCustomFields]);

  const openCreateFieldForHeader = useCallback((header: string) => {
    setCreateFieldHeader(header);
    setCreateFieldOpen(true);
  }, []);

  const getColumnValues = useCallback((header: string): unknown[] => {
    if (!parseResult) return [];
    return parseResult.preview.map(row => row[header]).filter(v => v !== undefined);
  }, [parseResult]);

  const unmappedColumns: UnmappedColumn[] = parseResult
    ? parseResult.headers
        .filter(h => !userMappings[h] && !autoIgnoredHeaders.has(h))
        .map(h => ({ header: h, values: getColumnValues(h) }))
    : [];

  // ─── STEP 3: Validation ───────────────────────────────────────────────────

  const handleValidate = useCallback(async () => {
    if (!parseResult) return;
    setValidating(true);
    try {
      const res = await api.post<ApiResponse<ImportClientValidationResult>>('/import/clients/validate', {
        file_id: parseResult.file_id,
        mappings: userMappings,
        options,
      });
      setValidationResult(res.data);
      setStep(2);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur de validation', type: 'error' });
    } finally {
      setValidating(false);
    }
  }, [parseResult, userMappings, options]);

  // ─── STEP 4: Execute ─────────────────────────────────────────────────────

  const handleExecute = useCallback(async () => {
    if (!parseResult) return;
    setExecuting(true);
    try {
      const res = await api.post<ApiResponse<ImportClientExecuteResult>>('/import/clients/execute', {
        file_id: parseResult.file_id,
        mappings: userMappings,
        options,
      });
      setExecuteResult(res.data);
      setStep(3);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Erreur lors de l'import", type: 'error' });
    } finally {
      setExecuting(false);
    }
  }, [parseResult, userMappings, options]);

  // ─── RENDER HELPERS ───────────────────────────────────────────────────────

  const confidenceBadge = (conf: number) => {
    if (conf === -1) return <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-400">Auto-ignoré</span>;
    if (conf >= 0.8) return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Auto {Math.round(conf * 100)}%</span>;
    if (conf >= 0.6) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Suggestion {Math.round(conf * 100)}%</span>;
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">Manuel</span>;
  };

  const previewValues = (header: string) => {
    if (!parseResult) return '';
    return parseResult.preview.map(row => String(row[header] ?? '').substring(0, 30)).filter(Boolean).join(', ');
  };

  const mappedCount = Object.values(userMappings).filter(Boolean).length;
  const totalHeaders = parseResult?.headers.length || 0;
  const ignoredCount = autoIgnoredHeaders.size;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
            </span>
            Import des clients
          </h1>
          <p className="mt-1 text-sm text-gray-500 ml-[52px]">Importez vos clients depuis un fichier Excel ou CSV (ex: Capasoft)</p>
        </div>
        <button onClick={() => router.push('/dashboard/clients')} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm transition cursor-pointer">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
          Retour aux clients
        </button>
      </div>

      {/* Stepper */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold transition-all ${
                i < step ? 'bg-emerald-500 text-white' :
                i === step ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/30' :
                'bg-gray-100 text-gray-400'
              }`}>
                {i < step ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                ) : s.icon}
              </div>
              <span className={`text-sm font-medium hidden sm:inline ${i === step ? 'text-violet-600' : i < step ? 'text-emerald-600' : 'text-gray-400'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className={`w-12 sm:w-20 h-0.5 mx-2 ${i < step ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ STEP 1: Upload ═══ */}
      {step === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <div
            className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
              dragOver ? 'border-violet-400 bg-violet-50/50' : 'border-gray-200 hover:border-violet-300 hover:bg-gray-50/50'
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 border-[3px] border-violet-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-medium text-gray-600">Analyse du fichier <span className="font-bold">{fileName}</span>...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 flex items-center justify-center">
                  <svg className="h-8 w-8 text-violet-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-700">Glissez-déposez votre fichier ici</p>
                  <p className="text-sm text-gray-400 mt-1">ou cliquez pour parcourir &mdash; Fichier Capasoft (listeclient.XLS) ou autre</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">CSV</span>
                  <span className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">XLSX</span>
                  <span className="inline-flex items-center rounded-lg bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">XLS</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ STEP 2: Mapping ═══ */}
      {step === 1 && parseResult && (
        <div className="space-y-4">
          {/* Saved mappings bar */}
          {savedMappings.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium text-gray-500">Mappings sauvegardés :</span>
                {savedMappings.map(m => (
                  <div key={m.id} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-1.5">
                    <button onClick={() => handleLoadMapping(m)} className="text-xs font-semibold text-violet-700 hover:text-violet-900 cursor-pointer">{m.name}</button>
                    <button onClick={() => handleDeleteMapping(m.id)} className="text-violet-400 hover:text-red-500 cursor-pointer">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File info + mapping stats */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{fileName}</p>
                  <p className="text-xs text-gray-400">{parseResult.total_rows} clients &middot; {totalHeaders} colonnes</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{mappedCount} mappées</span>
                {ignoredCount > 0 && (
                  <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-[11px] font-bold text-gray-400">{ignoredCount} auto-ignorées</span>
                )}
                {unmappedColumns.length > 0 && (
                  <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">{unmappedColumns.length} non mappées</span>
                )}
              </div>
            </div>
          </div>

          {/* Unmapped columns banner */}
          {unmappedColumns.length > 0 && (
            <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                <span className="text-sm font-medium text-amber-800">
                  {unmappedColumns.length} colonne{unmappedColumns.length > 1 ? 's' : ''} non mappée{unmappedColumns.length > 1 ? 's' : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setCreateBulkOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 shadow-sm transition cursor-pointer whitespace-nowrap"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Créer les champs manquants automatiquement
              </button>
            </div>
          )}

          {/* Mapping table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80">
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Colonne du fichier</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider w-8"></th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Champ OptimaCRM</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">Confiance</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Aperçu des données</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {parseResult.headers.map((header, headerIdx) => {
                    const conf = getConfidence(header);
                    const currentField = userMappings[header];
                    const isAutoIgnored = autoIgnoredHeaders.has(header) && !currentField;
                    return (
                      <tr key={`${headerIdx}-${header}`} className={`transition-colors ${isAutoIgnored ? 'bg-gray-50/50' : 'hover:bg-violet-50/30'}`} style={{ position: 'relative', zIndex: totalHeaders - headerIdx }}>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-medium whitespace-pre-line ${isAutoIgnored ? 'text-gray-300' : 'text-gray-800'}`}>{header || <span className="italic text-gray-300">(vide)</span>}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <svg className={`h-4 w-4 mx-auto ${isAutoIgnored ? 'text-gray-200' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
                        </td>
                        <td className="px-4 py-3">
                          <MappingSelect
                            value={currentField}
                            onChange={val => setUserMappings(prev => ({ ...prev, [header]: val }))}
                            standardGroups={parseResult.available_fields.standard}
                            customGroups={parseResult.available_fields.custom}
                            usedFields={Object.entries(userMappings).filter(([h]) => h !== header).map(([, v]) => v).filter(Boolean) as string[]}
                            onCreateField={() => openCreateFieldForHeader(header)}
                            groupIcons={CLIENT_GROUP_ICONS}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">{confidenceBadge(conf)}</td>
                        <td className="px-4 py-3">
                          <p className={`text-xs truncate max-w-[200px] ${isAutoIgnored ? 'text-gray-300' : 'text-gray-400'}`}>{previewValues(header)}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Options */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3">Options d&apos;import</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'skip_empty_code' as const, label: 'Ignorer les lignes sans code client' },
                { key: 'update_existing' as const, label: 'Mettre à jour les clients existants (même code)' },
              ].map(opt => (
                <label key={opt.key} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={options[opt.key]}
                    onChange={e => setOptions(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                  />
                  <span className="text-sm text-gray-600 group-hover:text-gray-800">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setStep(0)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm transition cursor-pointer">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
                Retour
              </button>
              <button onClick={() => setShowSaveMapping(!showSaveMapping)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm transition cursor-pointer">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>
                Sauvegarder ce mapping
              </button>
            </div>
            {showSaveMapping && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={saveMappingName}
                  onChange={e => setSaveMappingName(e.target.value)}
                  placeholder="Nom du mapping..."
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 outline-none"
                  onKeyDown={e => e.key === 'Enter' && handleSaveMapping()}
                />
                <button onClick={handleSaveMapping} className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 cursor-pointer">Sauvegarder</button>
              </div>
            )}
            <button
              onClick={handleValidate}
              disabled={validating}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:from-violet-700 hover:to-indigo-700 transition-all disabled:opacity-50 cursor-pointer"
            >
              {validating ? (
                <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Validation...</>
              ) : (
                <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg> Valider le mapping</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: Validation ═══ */}
      {step === 2 && validationResult && (
        <div className="space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: 'Total', value: validationResult.total, color: 'blue' },
              { label: 'Valides', value: validationResult.valid, color: 'emerald' },
              { label: 'Erreurs', value: validationResult.errors, color: 'red' },
              { label: 'Doublons', value: validationResult.duplicates, color: 'amber' },
              { label: 'Ignorées', value: validationResult.skipped, color: 'gray' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{kpi.label}</p>
                <p className={`text-2xl font-bold mt-1 text-${kpi.color}-600`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-1 p-3 border-b border-gray-100">
              {(['all', 'valid', 'error', 'skipped'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setValidationFilter(f)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    validationFilter === f ? 'bg-violet-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {{ all: 'Tous', valid: 'Valides', error: 'Erreurs', skipped: 'Ignorées' }[f]} (
                  {{ all: validationResult.rows.length, valid: validationResult.valid, error: validationResult.errors, skipped: validationResult.skipped }[f]})
                </button>
              ))}
            </div>

            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-50/95 backdrop-blur">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase w-16">Ligne</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold text-gray-500 uppercase w-20">Statut</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase">Code client</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase">Raison sociale</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase">Erreurs / Avertissements</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {validationResult.rows
                    .filter(r => validationFilter === 'all' || r.status === validationFilter)
                    .slice(0, 200)
                    .map(row => (
                    <tr key={row.row_number} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 text-xs text-gray-400 font-mono">{row.row_number}</td>
                      <td className="px-3 py-2 text-center">
                        {row.status === 'valid' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Valide</span>}
                        {row.status === 'error' && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">Erreur</span>}
                        {row.status === 'skipped' && <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">Ignorée</span>}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-gray-700">{String(row.data.code_client ?? '-')}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 max-w-[250px] truncate">{String(row.data.raison_sociale ?? '-')}</td>
                      <td className="px-3 py-2">
                        {row.errors.length > 0 && (
                          <div className="space-y-0.5">
                            {row.errors.map((err, i) => (
                              <p key={i} className="text-[11px] text-red-600">{err}</p>
                            ))}
                          </div>
                        )}
                        {row.warnings && row.warnings.length > 0 && (
                          <div className="space-y-0.5">
                            {row.warnings.map((w, i) => (
                              <p key={i} className="text-[11px] text-amber-600">{w}</p>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button onClick={() => setStep(1)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm transition cursor-pointer">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
              Modifier le mapping
            </button>
            <button
              onClick={handleExecute}
              disabled={executing || validationResult.valid === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:from-emerald-700 hover:to-green-700 transition-all disabled:opacity-50 cursor-pointer"
            >
              {executing ? (
                <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Import en cours...</>
              ) : (
                <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg> Importer {validationResult.valid} clients</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 4: Résultat ═══ */}
      {step === 3 && executeResult && (
        <div className="space-y-4">
          {/* Success header */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <div className="h-16 w-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Import terminé !</h2>
            <p className="text-sm text-gray-500">{executeResult.imported} clients importés avec succès</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{executeResult.imported}</p>
              <p className="text-xs text-gray-500 mt-1">Clients importés</p>
            </div>
            {executeResult.updated > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{executeResult.updated}</p>
                <p className="text-xs text-gray-500 mt-1">Mis à jour</p>
              </div>
            )}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-violet-600">{executeResult.adresses_created}</p>
              <p className="text-xs text-gray-500 mt-1">Adresses</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-indigo-600">{executeResult.contacts_created}</p>
              <p className="text-xs text-gray-500 mt-1">Contacts</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{executeResult.errors}</p>
              <p className="text-xs text-gray-500 mt-1">Erreurs</p>
            </div>
          </div>

          {/* Error details */}
          {executeResult.error_details.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800">Détail des erreurs ({executeResult.error_details.length})</h3>
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
                    {executeResult.error_details.map((err, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 text-xs font-mono text-gray-500">{err.row_number}</td>
                        <td className="px-4 py-2 text-xs text-red-600">{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => router.push('/dashboard/clients')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" /></svg>
              Voir les clients
            </button>
            <button
              onClick={() => { setStep(0); setParseResult(null); setValidationResult(null); setExecuteResult(null); setFileName(''); setAutoIgnoredHeaders(new Set()); }}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm transition cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
              Importer un autre fichier
            </button>
          </div>
        </div>
      )}

      {/* ═══ Modals ═══ */}
      <CreateFieldModal
        open={createFieldOpen}
        onClose={() => setCreateFieldOpen(false)}
        entity={CLIENT_ENTITY}
        columnName={createFieldHeader}
        columnValues={getColumnValues(createFieldHeader)}
        existingSections={sections}
        onCreated={(field) => handleFieldCreated(field, createFieldHeader)}
      />

      <CreateFieldsBulkModal
        open={createBulkOpen}
        onClose={() => setCreateBulkOpen(false)}
        entity={CLIENT_ENTITY}
        unmappedColumns={unmappedColumns}
        existingSections={sections}
        onCreated={handleBulkFieldsCreated}
      />
    </div>
  );
}
