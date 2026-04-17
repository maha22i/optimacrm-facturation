'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type {
  ApiResponse, ImportParseResult, ImportValidationResult, ImportExecuteResult,
  ImportMapping, ImportFieldGroup, ImportSavedMapping, ChampConfig, SectionInfo,
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ImportCataloguePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Step 1 — Upload
  const [uploading, setUploading] = useState(false);
  const [parseResult, setParseResult] = useState<ImportParseResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');

  // Step 2 — Mapping
  const [userMappings, setUserMappings] = useState<Record<string, string | null>>({});
  const [options, setOptions] = useState({
    skip_empty_reference: true,
    create_missing_fournisseurs: true,
    create_missing_marques: true,
    create_missing_familles: true,
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
  const [validationResult, setValidationResult] = useState<ImportValidationResult | null>(null);
  const [validationFilter, setValidationFilter] = useState<'all' | 'valid' | 'error' | 'skipped'>('all');

  // Step 4 — Résultat
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<ImportExecuteResult | null>(null);

  // Load saved mappings + sections
  useEffect(() => {
    api.get<ApiResponse<ImportSavedMapping[]>>('/import/catalogue/mappings')
      .then(res => setSavedMappings(res.data || []))
      .catch(() => {});
    api.get<ApiResponse<SectionInfo[]>>('/champs-config/sections?entite=CATALOGUE')
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
      const res = await api.upload<ApiResponse<ImportParseResult>>('/import/catalogue/parse', formData);
      setParseResult(res.data);

      // Initialize mappings from auto-mapping
      const initial: Record<string, string | null> = {};
      for (const m of res.data.mappings) {
        initial[m.source_header] = m.suggested_field;
      }
      setUserMappings(initial);
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
      const res = await api.post<ApiResponse<ImportSavedMapping>>('/import/catalogue/mappings', {
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
      await api.delete(`/import/catalogue/mappings/${id}`);
      setSavedMappings(prev => prev.filter(m => m.id !== id));
    } catch {}
  };

  // ─── Custom Field Creation helpers ──────────────────────────────────────────

  const refreshCustomFields = useCallback(async () => {
    try {
      const res = await api.get<ApiResponse<ChampConfig[]>>('/champs-config?entite=CATALOGUE&actif=true');
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

      const secRes = await api.get<ApiResponse<SectionInfo[]>>('/champs-config/sections?entite=CATALOGUE');
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
        .filter(h => !userMappings[h])
        .map(h => ({ header: h, values: getColumnValues(h) }))
    : [];

  // ─── STEP 3: Validation ───────────────────────────────────────────────────

  const handleValidate = useCallback(async () => {
    if (!parseResult) return;
    setValidating(true);
    try {
      const res = await api.post<ApiResponse<ImportValidationResult>>('/import/catalogue/validate', {
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
      const res = await api.post<ApiResponse<ImportExecuteResult>>('/import/catalogue/execute', {
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
    if (conf >= 0.8) return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Auto {Math.round(conf * 100)}%</span>;
    if (conf >= 0.6) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Suggestion {Math.round(conf * 100)}%</span>;
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">Manuel</span>;
  };

  const previewValues = (header: string) => {
    if (!parseResult) return '';
    return parseResult.preview.map(row => String(row[header] ?? '').substring(0, 30)).filter(Boolean).join(', ');
  };

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
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
            </span>
            Import du catalogue produits
          </h1>
          <p className="mt-1 text-sm text-gray-500 ml-[52px]">Importez vos produits depuis un fichier Excel ou CSV</p>
        </div>
        <button onClick={() => router.push('/dashboard/catalogue')} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm transition cursor-pointer">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>
          Retour au catalogue
        </button>
      </div>

      {/* Stepper */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className={`flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold transition-all ${
                i < step ? 'bg-emerald-500 text-white' :
                i === step ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' :
                'bg-gray-100 text-gray-400'
              }`}>
                {i < step ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                ) : s.icon}
              </div>
              <span className={`text-sm font-medium hidden sm:inline ${i === step ? 'text-blue-600' : i < step ? 'text-emerald-600' : 'text-gray-400'}`}>{s.label}</span>
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
              dragOver ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50/50'
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
                <div className="h-12 w-12 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-medium text-gray-600">Analyse du fichier <span className="font-bold">{fileName}</span>...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center">
                  <svg className="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-700">Glissez-déposez votre fichier ici</p>
                  <p className="text-sm text-gray-400 mt-1">ou cliquez pour parcourir</p>
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
                  <div key={m.id} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5">
                    <button onClick={() => handleLoadMapping(m)} className="text-xs font-semibold text-blue-700 hover:text-blue-900 cursor-pointer">{m.name}</button>
                    <button onClick={() => handleDeleteMapping(m.id)} className="text-blue-400 hover:text-red-500 cursor-pointer">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File info */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{fileName}</p>
                <p className="text-xs text-gray-400">{parseResult.total_rows} lignes de données &middot; {parseResult.headers.length} colonnes</p>
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
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
                  {parseResult.headers.map(header => {
                    const conf = getConfidence(header);
                    const currentField = userMappings[header];
                    return (
                      <tr key={header} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium text-gray-800 whitespace-pre-line">{header}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <svg className="h-4 w-4 text-gray-300 mx-auto" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
                        </td>
                        <td className="px-4 py-3">
                          <MappingSelect
                            value={currentField}
                            onChange={val => setUserMappings(prev => ({ ...prev, [header]: val }))}
                            standardGroups={parseResult.available_fields.standard}
                            customGroups={parseResult.available_fields.custom}
                            usedFields={Object.entries(userMappings).filter(([h]) => h !== header).map(([, v]) => v).filter(Boolean) as string[]}
                            onCreateField={() => openCreateFieldForHeader(header)}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">{confidenceBadge(conf)}</td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-gray-400 truncate max-w-[200px]">{previewValues(header)}</p>
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
                { key: 'create_missing_fournisseurs' as const, label: 'Créer automatiquement les fournisseurs inexistants' },
                { key: 'create_missing_marques' as const, label: 'Créer automatiquement les marques inexistantes' },
                { key: 'create_missing_familles' as const, label: 'Créer automatiquement les familles inexistantes' },
                { key: 'update_existing' as const, label: 'Mettre à jour les produits existants (même référence)' },
                { key: 'skip_empty_reference' as const, label: 'Ignorer les lignes sans référence' },
              ].map(opt => (
                <label key={opt.key} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={options[opt.key]}
                    onChange={e => setOptions(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
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
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 outline-none"
                  onKeyDown={e => e.key === 'Enter' && handleSaveMapping()}
                />
                <button onClick={handleSaveMapping} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 cursor-pointer">Sauvegarder</button>
              </div>
            )}
            <button
              onClick={handleValidate}
              disabled={validating}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 cursor-pointer"
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Valides', value: validationResult.valid, color: 'emerald', icon: '✅' },
              { label: 'Erreurs', value: validationResult.errors, color: 'red', icon: '⚠️' },
              { label: 'Doublons', value: validationResult.duplicates, color: 'amber', icon: '🔄' },
              { label: 'Ignorées', value: validationResult.skipped, color: 'gray', icon: '⏭️' },
              { label: 'Nvx fournisseurs', value: validationResult.new_fournisseurs.length, color: 'blue', icon: '🆕' },
              { label: 'Nvx marques', value: validationResult.new_marques.length, color: 'violet', icon: '🆕' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{kpi.label}</p>
                <p className={`text-2xl font-bold mt-1 text-${kpi.color}-600`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Alerts for new entities */}
          {(validationResult.new_fournisseurs.length > 0 || validationResult.new_marques.length > 0 || validationResult.new_familles.length > 0) && (
            <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
              <div className="flex items-start gap-3">
                <svg className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>
                <div className="text-sm text-blue-800">
                  <p className="font-semibold mb-1">Les entités suivantes seront créées automatiquement :</p>
                  {validationResult.new_fournisseurs.length > 0 && (
                    <p>Fournisseurs : <span className="font-medium">{validationResult.new_fournisseurs.join(', ')}</span></p>
                  )}
                  {validationResult.new_marques.length > 0 && (
                    <p>Marques : <span className="font-medium">{validationResult.new_marques.join(', ')}</span></p>
                  )}
                  {validationResult.new_familles.length > 0 && (
                    <p>Familles : <span className="font-medium">{validationResult.new_familles.join(', ')}</span></p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-1 p-3 border-b border-gray-100">
              {(['all', 'valid', 'error', 'skipped'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setValidationFilter(f)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    validationFilter === f ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
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
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase">Référence</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase">Désignation</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold text-gray-500 uppercase">Erreurs</th>
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
                      <td className="px-3 py-2 text-xs font-mono text-gray-700">{String(row.data.reference ?? '-')}</td>
                      <td className="px-3 py-2 text-xs text-gray-600 max-w-[250px] truncate">{String(row.data.designation ?? '-')}</td>
                      <td className="px-3 py-2">
                        {row.errors.length > 0 && (
                          <div className="space-y-0.5">
                            {row.errors.map((err, i) => (
                              <p key={i} className="text-[11px] text-red-600">{err}</p>
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
                <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg> Importer {validationResult.valid} produits</>
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
            <p className="text-sm text-gray-500">{executeResult.imported} produits importés avec succès</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{executeResult.imported}</p>
              <p className="text-xs text-gray-500 mt-1">Importés</p>
            </div>
            {executeResult.updated > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{executeResult.updated}</p>
                <p className="text-xs text-gray-500 mt-1">Mis à jour</p>
              </div>
            )}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{executeResult.errors}</p>
              <p className="text-xs text-gray-500 mt-1">Erreurs</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl font-bold text-gray-600">{executeResult.skipped}</p>
              <p className="text-xs text-gray-500 mt-1">Ignorés</p>
            </div>
          </div>

          {/* Created entities */}
          {(executeResult.new_fournisseurs_created > 0 || executeResult.new_marques_created > 0 || executeResult.new_familles_created > 0) && (
            <div className="bg-blue-50 rounded-xl border border-blue-100 p-4">
              <p className="text-sm font-semibold text-blue-800 mb-1">Entités créées automatiquement :</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {executeResult.new_fournisseurs_created > 0 && (
                  <span className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">{executeResult.new_fournisseurs_created} fournisseur(s)</span>
                )}
                {executeResult.new_marques_created > 0 && (
                  <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-800">{executeResult.new_marques_created} marque(s)</span>
                )}
                {executeResult.new_familles_created > 0 && (
                  <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">{executeResult.new_familles_created} famille(s)</span>
                )}
              </div>
            </div>
          )}

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
              onClick={() => router.push('/dashboard/catalogue')}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
              Voir le catalogue
            </button>
            <button
              onClick={() => { setStep(0); setParseResult(null); setValidationResult(null); setExecuteResult(null); setFileName(''); }}
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
        entity="CATALOGUE"
        columnName={createFieldHeader}
        columnValues={getColumnValues(createFieldHeader)}
        existingSections={sections}
        onCreated={(field) => handleFieldCreated(field, createFieldHeader)}
      />

      <CreateFieldsBulkModal
        open={createBulkOpen}
        onClose={() => setCreateBulkOpen(false)}
        entity="CATALOGUE"
        unmappedColumns={unmappedColumns}
        existingSections={sections}
        onCreated={handleBulkFieldsCreated}
      />
    </div>
  );
}

