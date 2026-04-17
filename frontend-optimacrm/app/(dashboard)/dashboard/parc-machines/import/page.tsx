'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { ApiResponse, ImportParseResult, ImportParcValidationResult, ImportParcExecuteResult, ImportSavedMapping } from '@/lib/types';
import MappingSelect from '@/components/import/MappingSelect';

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'warning'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [onClose]);
  const colors = { success: 'bg-emerald-600 text-white', error: 'bg-red-600 text-white', warning: 'bg-amber-500 text-white' };
  return (
    <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-medium shadow-xl ${colors[type]}`}>
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

export default function ImportMachinesPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const [uploading, setUploading] = useState(false);
  const [parseResult, setParseResult] = useState<ImportParseResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');

  const [userMappings, setUserMappings] = useState<Record<string, string | null>>({});
  const [savedMappings, setSavedMappings] = useState<ImportSavedMapping[]>([]);
  const [saveMappingName, setSaveMappingName] = useState('');
  const [showSaveMapping, setShowSaveMapping] = useState(false);
  const [options, setOptions] = useState({ skip_duplicates: true, update_existing: false });

  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ImportParcValidationResult | null>(null);
  const [validationFilter, setValidationFilter] = useState<'all' | 'valid' | 'error'>('all');

  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<ImportParcExecuteResult | null>(null);

  useEffect(() => {
    api.get<ApiResponse<ImportSavedMapping[]>>('/import/parc/mappings?entity=PARC_MACHINES')
      .then(res => setSavedMappings(res.data || []))
      .catch(() => {});
  }, []);

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
      const res = await api.upload<ApiResponse<ImportParseResult>>('/import/parc/machines/parse', formData);
      setParseResult(res.data);
      const initial: Record<string, string | null> = {};
      for (const m of res.data.mappings) initial[m.source_header] = m.suggested_field;
      setUserMappings(initial);
      setStep(1);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors du parsing', type: 'error' });
    } finally { setUploading(false); }
  }, []);

  const handleValidate = async () => {
    if (!parseResult) return;
    setValidating(true);
    try {
      const mappingPayload: Record<string, string> = {};
      for (const [src, target] of Object.entries(userMappings)) {
        if (target) mappingPayload[src] = target;
      }
      const res = await api.post<ApiResponse<ImportParcValidationResult>>('/import/parc/machines/validate', { file_id: parseResult.file_id, mappings: mappingPayload, options });
      setValidationResult(res.data);
      setStep(2);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur de validation', type: 'error' });
    } finally { setValidating(false); }
  };

  const handleExecute = async () => {
    if (!parseResult) return;
    setExecuting(true);
    try {
      const mappingPayload: Record<string, string> = {};
      for (const [src, target] of Object.entries(userMappings)) {
        if (target) mappingPayload[src] = target;
      }
      const res = await api.post<ApiResponse<ImportParcExecuteResult>>('/import/parc/machines/execute', { file_id: parseResult.file_id, mappings: mappingPayload, options });
      setExecuteResult(res.data);
      setStep(3);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors de l\'import', type: 'error' });
    } finally { setExecuting(false); }
  };

  const handleSaveMapping = async () => {
    if (!saveMappingName.trim()) return;
    try {
      await api.post('/import/parc/mappings', { name: saveMappingName, mapping: userMappings, entity_type: 'PARC_MACHINES' });
      setToast({ message: 'Mapping sauvegardé', type: 'success' });
      setShowSaveMapping(false);
      setSaveMappingName('');
    } catch { /* */ }
  };

  const usedTargets = new Set(Object.values(userMappings).filter(Boolean));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/dashboard/parc-machines')} className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
          <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Importer des machines</h1>
          <p className="text-sm text-gray-500">Importez votre parc machine depuis un fichier CSV ou Excel</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${i <= step ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{s.icon}</div>
              <span className={`text-sm font-medium ${i <= step ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className={`w-16 h-0.5 mx-2 ${i < step ? 'bg-blue-600' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 0: Upload */}
      {step === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
                <p className="text-sm text-gray-500">Analyse de {fileName}...</p>
              </div>
            ) : (
              <>
                <svg className="h-12 w-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                <p className="text-lg font-semibold text-gray-700 mb-2">Glissez votre fichier ici</p>
                <p className="text-sm text-gray-400 mb-4">CSV, XLSX ou XLS (max 20 Mo)</p>
                <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 cursor-pointer">Parcourir</button>
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </>
            )}
          </div>
        </div>
      )}

      {/* Step 1: Mapping */}
      {step === 1 && parseResult && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Mapping des colonnes</h2>
                <p className="text-sm text-gray-500">{parseResult.total_rows} lignes détectées dans {fileName}</p>
              </div>
              <div className="flex gap-2">
                {savedMappings.length > 0 && (
                  <select onChange={e => { const m = savedMappings.find(s => String(s.id) === e.target.value); if (m) setUserMappings(typeof m.mapping === 'string' ? JSON.parse(m.mapping) : m.mapping); }}
                    className="rounded-lg border border-gray-200 py-2 px-3 text-sm cursor-pointer">
                    <option value="">Charger un mapping</option>
                    {savedMappings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
                <button onClick={() => setShowSaveMapping(!showSaveMapping)} className="text-sm text-blue-600 hover:underline cursor-pointer">Sauvegarder</button>
              </div>
            </div>

            {showSaveMapping && (
              <div className="flex gap-2 mb-4">
                <input type="text" value={saveMappingName} onChange={e => setSaveMappingName(e.target.value)} placeholder="Nom du mapping"
                  className="flex-1 rounded-lg border border-gray-200 py-2 px-3 text-sm" />
                <button onClick={handleSaveMapping} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer">Sauvegarder</button>
              </div>
            )}

            <div className="space-y-2">
              {parseResult.headers.map(header => (
                <div key={header} className="flex items-center gap-4 py-2 border-b border-gray-50">
                  <div className="w-1/3">
                    <p className="text-sm font-medium text-gray-900">{header}</p>
                    <p className="text-xs text-gray-400 truncate">{parseResult.preview[0]?.[header] || ''}</p>
                  </div>
                  <svg className="h-4 w-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
                  <div className="flex-1">
                    <MappingSelect
                      value={userMappings[header] || null}
                      onChange={(val) => setUserMappings(prev => ({ ...prev, [header]: val }))}
                      standardGroups={parseResult.available_fields.standard}
                      customGroups={[]}
                      usedFields={Array.from(usedTargets) as string[]}
                      onCreateField={() => {}}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Options d'import */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-800 mb-3">Gestion des doublons</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input type="checkbox" checked={options.skip_duplicates}
                  onChange={e => setOptions(prev => ({ ...prev, skip_duplicates: e.target.checked, update_existing: e.target.checked ? false : prev.update_existing }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                <span className="text-sm text-gray-600 group-hover:text-gray-800">Ignorer les machines déjà existantes (même n° série)</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input type="checkbox" checked={options.update_existing}
                  onChange={e => setOptions(prev => ({ ...prev, update_existing: e.target.checked, skip_duplicates: e.target.checked ? false : prev.skip_duplicates }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                <span className="text-sm text-gray-600 group-hover:text-gray-800">Mettre à jour les machines existantes (même n° série)</span>
              </label>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(0)} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">Retour</button>
            <button onClick={handleValidate} disabled={validating} className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
              {validating ? 'Validation...' : 'Valider'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Validation */}
      {step === 2 && validationResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-gray-900">{validationResult.total}</p><p className="text-sm text-gray-500">Total</p>
            </div>
            <div className="bg-white rounded-xl border border-emerald-100 p-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-emerald-600">{validationResult.valid}</p><p className="text-sm text-gray-500">Valides</p>
            </div>
            <div className="bg-white rounded-xl border border-red-100 p-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-red-600">{validationResult.errors}</p><p className="text-sm text-gray-500">Erreurs</p>
            </div>
            <div className="bg-white rounded-xl border border-amber-100 p-4 text-center shadow-sm">
              <p className="text-2xl font-bold text-amber-600">{validationResult.duplicates}</p><p className="text-sm text-gray-500">Doublons</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex gap-2">
              {(['all', 'valid', 'error'] as const).map(f => (
                <button key={f} onClick={() => setValidationFilter(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${validationFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {f === 'all' ? 'Tous' : f === 'valid' ? 'Valides' : 'Erreurs'}
                </button>
              ))}
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead><tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">Ligne</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">Statut</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">N° Série</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">Désignation</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">Détails</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {validationResult.rows
                    .filter(r => validationFilter === 'all' || r.status === validationFilter)
                    .slice(0, 100)
                    .map(r => (
                    <tr key={r.row_number} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-sm text-gray-500">{r.row_number}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${r.status === 'valid' ? 'bg-emerald-50 text-emerald-700' : r.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'}`}>{r.status === 'valid' ? 'Valide' : r.status === 'error' ? 'Erreur' : 'Ignoré'}</span>
                      </td>
                      <td className="px-4 py-2 text-sm font-mono text-gray-700">{(r.data.numero_serie as string) || '—'}</td>
                      <td className="px-4 py-2 text-sm text-gray-700 truncate max-w-[200px]">{(r.data.designation as string) || '—'}</td>
                      <td className="px-4 py-2">
                        {r.errors.map((e, i) => <p key={i} className="text-xs text-red-500">{e}</p>)}
                        {r.warnings.map((w, i) => <p key={i} className="text-xs text-amber-500">{w}</p>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">Retour</button>
            <button onClick={handleExecute} disabled={executing || validationResult.valid === 0}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
              {executing ? 'Import en cours...' : `Importer ${validationResult.valid} machine${validationResult.valid > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Résultat */}
      {step === 3 && executeResult && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <div className="h-16 w-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Import terminé</h2>
          <div className="flex justify-center gap-6 my-6">
            <div><p className="text-3xl font-bold text-emerald-600">{executeResult.imported}</p><p className="text-sm text-gray-500">Importées</p></div>
            <div><p className="text-3xl font-bold text-red-600">{executeResult.errors}</p><p className="text-sm text-gray-500">Erreurs</p></div>
            <div><p className="text-3xl font-bold text-gray-400">{executeResult.skipped}</p><p className="text-sm text-gray-500">Ignorées</p></div>
          </div>
          {executeResult.error_details.length > 0 && (
            <div className="mt-4 text-left max-h-48 overflow-y-auto bg-red-50 rounded-lg p-4">
              {executeResult.error_details.map((e, i) => (
                <p key={i} className="text-xs text-red-600">Ligne {e.row_number}: {e.error}</p>
              ))}
            </div>
          )}
          <button onClick={() => router.push('/dashboard/parc-machines')} className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer">
            Voir le parc machine
          </button>
        </div>
      )}
    </div>
  );
}
