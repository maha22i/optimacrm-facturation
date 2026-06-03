'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type {
  ApiResponse,
  ImportRelevesParseResult,
  ImportRelevesAnalyseResult,
  ImportRelevesExecuteResult,
  ReleveLigneAnalyse,
  ReleveLigneStatut,
} from '@/lib/types';

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function fmt(n: number): string {
  return n.toLocaleString('fr-FR');
}

function fmtEur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

const STATUT_CONFIG: Record<ReleveLigneStatut, { label: string; icon: string; bg: string; text: string; rowBg: string }> = {
  OK: { label: 'OK', icon: '✅', bg: 'bg-emerald-50', text: 'text-emerald-700', rowBg: '' },
  DEPASSEMENT: { label: 'Dépassement', icon: '⚠️', bg: 'bg-amber-50', text: 'text-amber-700', rowBg: 'bg-amber-50/40' },
  ANOMALIE: { label: 'Anomalie', icon: '🔴', bg: 'bg-red-50', text: 'text-red-700', rowBg: 'bg-red-50/40' },
  PREMIER_RELEVE: { label: '1er relevé', icon: 'ℹ️', bg: 'bg-blue-50', text: 'text-blue-700', rowBg: 'bg-blue-50/40' },
  AU_COMPTEUR: { label: 'Au compteur', icon: '💠', bg: 'bg-indigo-50', text: 'text-indigo-700', rowBg: 'bg-indigo-50/40' },
  SANS_CONTRAT: { label: 'Sans contrat', icon: '🟡', bg: 'bg-gray-50', text: 'text-gray-600', rowBg: 'bg-gray-50/40' },
  HORS_CONTRAT: { label: 'Hors contrat', icon: '🟢', bg: 'bg-gray-50', text: 'text-gray-500', rowBg: 'bg-gray-50/40' },
};

type FilterKey = 'all' | 'DEPASSEMENT' | 'ANOMALIE' | 'SANS_CONTRAT' | 'AU_COMPTEUR' | 'PREMIER_RELEVE';

const STEPS = [
  { label: 'Upload', icon: '1' },
  { label: 'Mapping', icon: '2' },
  { label: 'Analyse', icon: '3' },
  { label: 'Résultat', icon: '4' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function ImportRelevesPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Step 0 — Upload
  const [uploading, setUploading] = useState(false);
  const [parseResult, setParseResult] = useState<ImportRelevesParseResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [periodeDebut, setPeriodeDebut] = useState('');
  const [periodeFin, setPeriodeFin] = useState('');

  // Step 1 — Mapping
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Step 2 — Analyse
  const [analyzing, setAnalyzing] = useState(false);
  const [analyseResult, setAnalyseResult] = useState<ImportRelevesAnalyseResult | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selections, setSelections] = useState<Record<number, boolean>>({});
  const [sortCol, setSortCol] = useState<string>('montant_total_ht');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Step 3 — Résultat
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<ImportRelevesExecuteResult | null>(null);

  // Duplicate check
  const [duplicateImport, setDuplicateImport] = useState<{ numero_batch: string; date_import: string; user_nom: string; nb_releves_crees: number; id: number } | null>(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  // ─── Upload ──────────────────────────────────────────────────────────

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
      const res = await api.upload<ApiResponse<ImportRelevesParseResult>>('/releves-compteurs/import/parse', formData);
      setParseResult(res.data);
      const suggested = res.data.suggested_mapping || {};
      setMapping({
        numero_serie: suggested.numero_serie || '',
        compteur_nb: suggested.compteur_nb || '',
        compteur_couleur: suggested.compteur_couleur || '',
        date_releve: suggested.date_releve || '',
      });

      // Check for duplicate file
      if (res.data.file_hash) {
        try {
          const dupRes = await api.post<ApiResponse<{ duplicate: boolean; existing_import: Record<string, unknown> | null }>>('/imports-releves/check-duplicate', { hash: res.data.file_hash });
          if (dupRes.data.duplicate && dupRes.data.existing_import) {
            const ei = dupRes.data.existing_import;
            setDuplicateImport({
              numero_batch: String(ei.numero_batch),
              date_import: String(ei.date_import),
              user_nom: String(ei.user_nom || ''),
              nb_releves_crees: Number(ei.nb_releves_crees || 0),
              id: Number(ei.id),
            });
            setShowDuplicateWarning(true);
          }
        } catch { /* ignore check errors */ }
      }

      setStep(1);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors du parsing', type: 'error' });
    } finally { setUploading(false); }
  }, []);

  // ─── Mapping helpers ────────────────────────────────────────────────

  const mappingFields = [
    { key: 'numero_serie', label: 'Numéro de série', required: true },
    { key: 'compteur_nb', label: 'Compteur N/B', required: true },
    { key: 'compteur_couleur', label: 'Compteur Couleur', required: true },
    { key: 'date_releve', label: 'Date du relevé', required: false },
  ];

  const mappingComplete = mapping.numero_serie && mapping.compteur_nb && mapping.compteur_couleur;

  const previewRows = useMemo(() => {
    if (!parseResult) return [];
    return parseResult.preview.slice(0, 5).map(row => ({
      numero_serie: mapping.numero_serie ? row[mapping.numero_serie] || '' : '',
      compteur_nb: mapping.compteur_nb ? row[mapping.compteur_nb] || '' : '',
      compteur_couleur: mapping.compteur_couleur ? row[mapping.compteur_couleur] || '' : '',
      date_releve: mapping.date_releve ? row[mapping.date_releve] || '' : (periodeFin || 'Date du jour'),
    }));
  }, [parseResult, mapping, periodeFin]);

  // ─── Analyze ─────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!parseResult || !mappingComplete) return;
    setAnalyzing(true);
    try {
      const res = await api.post<ApiResponse<ImportRelevesAnalyseResult>>('/releves-compteurs/import/analyze', {
        file_id: parseResult.file_id,
        mapping,
        periode: { date_debut: periodeDebut || null, date_fin: periodeFin || null },
      });
      setAnalyseResult(res.data);
      const initialSel: Record<number, boolean> = {};
      for (const l of res.data.lignes) {
        initialSel[l.row_number] = l.statut !== 'ANOMALIE';
      }
      setSelections(initialSel);
      setStep(2);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors de l\'analyse', type: 'error' });
    } finally { setAnalyzing(false); }
  };

  // ─── Filtered + sorted lines ─────────────────────────────────────────

  const filteredLignes = useMemo(() => {
    if (!analyseResult) return [];
    let arr = analyseResult.lignes;
    if (filter !== 'all') {
      if (filter === 'DEPASSEMENT') arr = arr.filter(l => l.statut === 'DEPASSEMENT');
      else if (filter === 'ANOMALIE') arr = arr.filter(l => l.statut === 'ANOMALIE');
      else if (filter === 'SANS_CONTRAT') arr = arr.filter(l => l.statut === 'SANS_CONTRAT' || l.statut === 'HORS_CONTRAT');
      else if (filter === 'AU_COMPTEUR') arr = arr.filter(l => l.statut === 'AU_COMPTEUR');
      else if (filter === 'PREMIER_RELEVE') arr = arr.filter(l => l.statut === 'PREMIER_RELEVE');
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    arr = [...arr].sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[sortCol];
      const vb = (b as unknown as Record<string, unknown>)[sortCol];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va || '').localeCompare(String(vb || '')) * dir;
    });
    return arr;
  }, [analyseResult, filter, sortCol, sortDir]);

  const selectedCount = useMemo(() => {
    return Object.values(selections).filter(Boolean).length;
  }, [selections]);

  const toggleAll = useCallback((checked: boolean) => {
    if (!analyseResult) return;
    const newSel: Record<number, boolean> = {};
    for (const l of filteredLignes) {
      newSel[l.row_number] = checked;
    }
    setSelections(prev => ({ ...prev, ...newSel }));
  }, [analyseResult, filteredLignes]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  // ─── Execute ────────────────────────────────────────────────────────

  const handleExecute = async () => {
    if (!analyseResult || !parseResult) return;
    setExecuting(true);
    try {
      const lignesPayload = analyseResult.lignes.map(l => ({
        ...l,
        selected: selections[l.row_number] ?? false,
      }));
      const res = await api.post<ApiResponse<ImportRelevesExecuteResult>>('/releves-compteurs/import/execute', {
        file_id: parseResult.file_id,
        lignes: lignesPayload,
        periode: { date_debut: periodeDebut || null, date_fin: periodeFin || null },
        file_meta: {
          hash: parseResult.file_hash,
          name: fileName,
          size: parseResult.file_size,
        },
      });
      setExecuteResult(res.data);
      setStep(3);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Erreur lors de l\'import', type: 'error' });
    } finally { setExecuting(false); }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/dashboard/parc-machines')} className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
          <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Importer des relevés compteurs</h1>
          <p className="text-sm text-gray-500">Import intelligent avec détection automatique des dépassements</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                i < step ? 'bg-emerald-500 text-white' : i === step ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}>
                {i < step ? <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg> : s.icon}
              </div>
              <span className={`text-sm font-medium ${i <= step ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <div className={`w-12 lg:w-24 h-0.5 mx-2 transition-colors ${i < step ? 'bg-emerald-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Duplicate warning banner */}
      {showDuplicateWarning && duplicateImport && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
          <div className="flex-1">
            <p className="font-semibold text-amber-800 text-sm">Ce fichier a déjà été importé</p>
            <p className="text-sm text-amber-700 mt-1">
              Import <span className="font-mono font-semibold">{duplicateImport.numero_batch}</span> — le {new Date(duplicateImport.date_import).toLocaleDateString('fr-FR')} par {duplicateImport.user_nom} — {duplicateImport.nb_releves_crees} relevés créés
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => router.push(`/dashboard/parc-machines/imports/${duplicateImport.id}`)} className="text-xs font-medium text-amber-700 underline cursor-pointer">Voir cet import</button>
              <button onClick={() => setShowDuplicateWarning(false)} className="text-xs font-medium text-amber-700 underline cursor-pointer">Importer quand même</button>
              <button onClick={() => { setShowDuplicateWarning(false); setStep(0); setParseResult(null); }} className="text-xs font-medium text-gray-500 underline cursor-pointer">Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 0: UPLOAD ═══ */}
      {step === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-800">
            <p className="font-semibold mb-1">Import intelligent des relevés</p>
            <p>Le fichier doit contenir un <strong>numéro de série</strong> et les <strong>compteurs</strong> (Total mono / Total couleur). Le système retrouve automatiquement le client, la machine et le contrat, puis calcule les dépassements.</p>
            <ul className="mt-2 text-xs text-blue-700 space-y-1 list-disc list-inside">
              <li>Chaque import est tracé dans l&apos;historique avec un numéro unique (IMP-XXXX)</li>
              <li>Si vous importez deux fois le même fichier, vous serez prévenu</li>
              <li>Vous pouvez annuler un import tant qu&apos;aucune facture n&apos;a été générée</li>
            </ul>
            <button onClick={() => router.push('/dashboard/parc-machines/imports')} className="mt-2 text-xs font-medium text-blue-700 underline cursor-pointer">Voir l&apos;historique des imports</button>
          </div>

          {/* Période optionnelle */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date début période <span className="text-gray-400 font-normal">(optionnel)</span></label>
              <input type="date" value={periodeDebut} onChange={e => setPeriodeDebut(e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date fin période <span className="text-gray-400 font-normal">(optionnel)</span></label>
              <input type="date" value={periodeFin} onChange={e => setPeriodeFin(e.target.value)}
                className="w-full rounded-lg border border-gray-200 py-2 px-3 text-sm" />
            </div>
          </div>

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

      {/* ═══ STEP 1: MAPPING SIMPLIFIÉ ═══ */}
      {step === 1 && parseResult && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Mapping des colonnes</h2>
                <p className="text-sm text-gray-500">{parseResult.total_rows} lignes détectées dans <span className="font-medium">{fileName}</span></p>
              </div>
            </div>

            <div className="space-y-4">
              {mappingFields.map(field => {
                const currentVal = mapping[field.key] || '';
                const isMatched = !!currentVal;
                return (
                  <div key={field.key} className="flex items-center gap-4">
                    <div className="w-48 shrink-0">
                      <p className="text-sm font-medium text-gray-900">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </p>
                    </div>
                    <svg className="h-4 w-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
                    <select
                      value={currentVal}
                      onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                      className={`flex-1 rounded-lg border py-2.5 px-3 text-sm cursor-pointer ${isMatched ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200'}`}
                    >
                      <option value="">— Sélectionner une colonne —</option>
                      {parseResult.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    <div className="w-6 flex justify-center">
                      {isMatched && <span className="text-emerald-500 text-lg">✓</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Preview */}
            {previewRows.length > 0 && mappingComplete && (
              <div className="mt-6">
                <p className="text-sm font-medium text-gray-700 mb-2">Aperçu (5 premières lignes)</p>
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">N° Série</th>
                        <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">Compteur N/B</th>
                        <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">Compteur Couleur</th>
                        <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {previewRows.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2 font-mono text-gray-700">{row.numero_serie}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{row.compteur_nb}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{row.compteur_couleur}</td>
                          <td className="px-4 py-2 text-gray-500">{row.date_releve}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(0)} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">Retour</button>
            <button onClick={handleAnalyze} disabled={analyzing || !mappingComplete}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
              {analyzing ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  Analyse en cours...
                </span>
              ) : 'Analyser →'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 2: ANALYSE + TABLEAU RICHE ═══ */}
      {step === 2 && analyseResult && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <SummaryCard label="Machines traitées" value={analyseResult.summary.machines_trouvees} color="blue" />
            <SummaryCard label="Dépassements" value={analyseResult.summary.avec_depassement} color="amber" suffix="⚠️" />
            <SummaryCard label="Anomalies" value={analyseResult.summary.anomalies} color="red" suffix="🔴" />
            <SummaryCard label="Sans contrat" value={analyseResult.summary.sans_contrat + analyseResult.summary.hors_contrat} color="gray" suffix="🟡" />
            <SummaryCard label="Montant total HT" value={fmtEur(analyseResult.summary.montant_total_depassement_ht)} color="emerald" isText />
          </div>

          {/* Filter bar */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                {([
                  { key: 'all' as FilterKey, label: 'Tous', count: analyseResult.lignes.length },
                  { key: 'DEPASSEMENT' as FilterKey, label: 'Dépassements ⚠️', count: analyseResult.summary.avec_depassement },
                  { key: 'ANOMALIE' as FilterKey, label: 'Anomalies 🔴', count: analyseResult.summary.anomalies },
                  { key: 'AU_COMPTEUR' as FilterKey, label: 'Au compteur 💠', count: analyseResult.summary.au_compteur || 0 },
                  { key: 'SANS_CONTRAT' as FilterKey, label: 'Sans contrat', count: analyseResult.summary.sans_contrat + analyseResult.summary.hors_contrat },
                  { key: 'PREMIER_RELEVE' as FilterKey, label: '1er relevé', count: analyseResult.summary.premier_releve },
                ]).map(f => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors ${
                      filter === f.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>
                    {f.label} ({f.count})
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500">{selectedCount} sélectionné{selectedCount > 1 ? 's' : ''} sur {analyseResult.lignes.length}</p>
            </div>

            {/* Table */}
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50/95 backdrop-blur border-b border-gray-200">
                    <th className="px-3 py-2.5 w-10">
                      <input type="checkbox"
                        checked={filteredLignes.length > 0 && filteredLignes.every(l => selections[l.row_number])}
                        onChange={e => toggleAll(e.target.checked)}
                        className="rounded border-gray-300 cursor-pointer" />
                    </th>
                    <ThSort label="Statut" col="statut" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <ThSort label="Client" col="client_nom" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <ThSort label="Machine" col="machine_designation" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">N° Série</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">Ancien N/B</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">Nouveau N/B</th>
                    <ThSort label="Volume N/B" col="volume_nb" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" />
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">Forfait N/B</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">Dép. N/B</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">Ancien Coul</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">Nouveau Coul</th>
                    <ThSort label="Volume Coul" col="volume_couleur" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" />
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">Forfait Coul</th>
                    <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap">Dép. Coul</th>
                    <ThSort label="Montant HT" col="montant_total_ht" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredLignes.map(l => {
                    const cfg = STATUT_CONFIG[l.statut];
                    const isSelected = selections[l.row_number] ?? false;
                    return (
                      <tr key={l.row_number} className={`${cfg.rowBg} hover:bg-gray-50/70 transition-colors`}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={isSelected}
                            onChange={e => setSelections(prev => ({ ...prev, [l.row_number]: e.target.checked }))}
                            className="rounded border-gray-300 cursor-pointer" />
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.text}`} title={l.alertes.join('\n')}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700 max-w-[160px] truncate">{l.client_nom || <span className="text-gray-300">???</span>}</td>
                        <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate text-xs">{l.machine_designation || <span className="text-gray-300">???</span>}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">{l.numero_serie}</td>
                        <CellNum value={l.ancien_compteur_nb} placeholder={l.statut === 'PREMIER_RELEVE' ? '0 (init)' : undefined} muted={l.statut === 'ANOMALIE'} />
                        <CellNum value={l.nouveau_compteur_nb} muted={l.statut === 'ANOMALIE'} />
                        <CellNum value={l.volume_nb} warn={l.depassement_nb > 0} muted={l.statut === 'ANOMALIE'} />
                        <CellNum value={l.forfait_nb} muted={!l.forfait_nb} placeholder={!l.forfait_nb && (l.statut === 'SANS_CONTRAT' || l.statut === 'AU_COMPTEUR') ? '—' : undefined} />
                        <CellNum value={l.depassement_nb} warn={l.depassement_nb > 0} muted={l.statut === 'ANOMALIE'} />
                        <CellNum value={l.ancien_compteur_couleur} placeholder={l.statut === 'PREMIER_RELEVE' ? '0 (init)' : undefined} muted={l.statut === 'ANOMALIE'} />
                        <CellNum value={l.nouveau_compteur_couleur} muted={l.statut === 'ANOMALIE'} />
                        <CellNum value={l.volume_couleur} warn={l.depassement_couleur > 0} muted={l.statut === 'ANOMALIE'} />
                        <CellNum value={l.forfait_couleur} muted={!l.forfait_couleur} placeholder={!l.forfait_couleur && (l.statut === 'SANS_CONTRAT' || l.statut === 'AU_COMPTEUR') ? '—' : undefined} />
                        <CellNum value={l.depassement_couleur} warn={l.depassement_couleur > 0} muted={l.statut === 'ANOMALIE'} />
                        <td className={`px-3 py-2 text-right text-sm whitespace-nowrap ${l.montant_total_ht > 0 ? 'font-bold text-gray-900' : 'text-gray-400'}`}>
                          {l.statut === 'ANOMALIE' ? '—' : fmtEur(l.montant_total_ht)}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredLignes.length === 0 && (
                    <tr><td colSpan={16} className="px-4 py-8 text-center text-gray-400">Aucune ligne ne correspond au filtre</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center">
            <button onClick={() => setStep(1)} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">Retour</button>
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-500">{selectedCount} ligne{selectedCount > 1 ? 's' : ''} sélectionnée{selectedCount > 1 ? 's' : ''} sur {analyseResult.lignes.length}</p>
              <button onClick={handleExecute} disabled={executing || selectedCount === 0}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
                {executing ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                    Import en cours...
                  </span>
                ) : `Valider l'import (${selectedCount})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: RÉSULTAT ═══ */}
      {step === 3 && executeResult && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
          <div className="h-16 w-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Import des relevés terminé</h2>
          {executeResult.numero_batch && (
            <p className="text-sm text-gray-500 mb-1">
              Import <span className="font-mono font-semibold text-blue-600">{executeResult.numero_batch}</span> enregistré
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-6 my-6">
            <ResultStat value={executeResult.imported} label="Relevés importés" color="emerald" />
            <ResultStat value={executeResult.depassements} label="Dépassements détectés" color="amber" />
            <ResultStat value={fmtEur(executeResult.montant_total_depassement_ht)} label="Montant total HT" color="blue" isText />
            <ResultStat value={executeResult.anomalies_ignorees} label="Anomalies ignorées" color="gray" />
            {executeResult.errors > 0 && <ResultStat value={executeResult.errors} label="Erreurs" color="red" />}
          </div>

          {executeResult.error_details.length > 0 && (
            <div className="mt-4 text-left max-h-48 overflow-y-auto bg-red-50 rounded-lg p-4">
              {executeResult.error_details.map((e, i) => (
                <p key={i} className="text-xs text-red-600">Ligne {e.row_number} ({e.numero_serie}): {e.error}</p>
              ))}
            </div>
          )}

          <div className="flex justify-center gap-3 mt-8">
            {executeResult.import_id && (
              <button onClick={() => router.push(`/dashboard/parc-machines/imports/${executeResult.import_id}`)} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer">
                Voir le détail de cet import
              </button>
            )}
            <button onClick={() => router.push('/dashboard/parc-machines/imports')} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              Historique des imports
            </button>
            <button onClick={() => router.push('/dashboard/parc-machines')} className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              Voir le parc machine
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function SummaryCard({ label, value, color, suffix, isText }: { label: string; value: number | string; color: string; suffix?: string; isText?: boolean }) {
  const colorMap: Record<string, string> = {
    blue: 'border-blue-100 text-blue-600',
    amber: 'border-amber-100 text-amber-600',
    red: 'border-red-100 text-red-600',
    gray: 'border-gray-100 text-gray-600',
    emerald: 'border-emerald-100 text-emerald-600',
  };
  const c = colorMap[color] || colorMap.gray;
  return (
    <div className={`bg-white rounded-xl border ${c.split(' ')[0]} p-4 text-center shadow-sm`}>
      <p className={`text-2xl font-bold ${c.split(' ')[1]}`}>
        {isText ? value : fmt(value as number)} {suffix}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function ResultStat({ value, label, color, isText }: { value: number | string; label: string; color: string; isText?: boolean }) {
  const colorMap: Record<string, string> = { emerald: 'text-emerald-600', amber: 'text-amber-600', blue: 'text-blue-600', gray: 'text-gray-400', red: 'text-red-600' };
  return (
    <div>
      <p className={`text-3xl font-bold ${colorMap[color] || 'text-gray-700'}`}>{isText ? value : fmt(value as number)}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

function ThSort({ label, col, sortCol, sortDir, onSort, align }: { label: string; col: string; sortCol: string; sortDir: string; onSort: (c: string) => void; align?: string }) {
  const isActive = sortCol === col;
  return (
    <th className={`${align === 'right' ? 'text-right' : 'text-left'} px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase whitespace-nowrap cursor-pointer hover:text-gray-700 select-none`}
      onClick={() => onSort(col)}>
      {label}
      {isActive && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

function CellNum({ value, warn, muted, placeholder }: { value: number; warn?: boolean; muted?: boolean; placeholder?: string }) {
  if (placeholder) return <td className="px-3 py-2 text-right text-xs text-gray-400 whitespace-nowrap">{placeholder}</td>;
  if (muted && value === 0) return <td className="px-3 py-2 text-right text-xs text-gray-300 whitespace-nowrap">—</td>;
  return (
    <td className={`px-3 py-2 text-right text-xs whitespace-nowrap ${warn ? 'text-amber-700 font-semibold' : muted ? 'text-gray-400' : 'text-gray-700'}`}>
      {fmt(value)}
    </td>
  );
}
