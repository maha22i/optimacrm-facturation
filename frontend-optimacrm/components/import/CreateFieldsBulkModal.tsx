'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { ApiResponse, ChampConfig, SectionInfo } from '@/lib/types';
import { cleanLabel, labelToSlug, detectFieldType } from './CreateFieldModal';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UnmappedColumn {
  header: string;
  values: unknown[];
}

export interface BulkFieldEntry {
  header: string;
  label: string;
  slug: string;
  type: 'TEXTE' | 'NOMBRE' | 'DATE' | 'LISTE' | 'BOOLEEN';
  checked: boolean;
}

export interface CreateFieldsBulkModalProps {
  open: boolean;
  onClose: () => void;
  entity: string;
  unmappedColumns: UnmappedColumn[];
  existingSections: SectionInfo[];
  onCreated: (fields: ChampConfig[], headerToSlugMap: Record<string, string>) => void;
}

type FieldType = 'TEXTE' | 'NOMBRE' | 'DATE' | 'LISTE' | 'BOOLEEN';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'TEXTE', label: 'Texte' },
  { value: 'NOMBRE', label: 'Nombre' },
  { value: 'DATE', label: 'Date' },
  { value: 'LISTE', label: 'Liste' },
  { value: 'BOOLEEN', label: 'Booléen' },
];

const ENTITY_LABELS: Record<string, string> = {
  CATALOGUE: 'Catalogue',
  CLIENT: 'Clients',
  CONTRAT: 'Contrats',
  DEVIS: 'Devis',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreateFieldsBulkModal({
  open,
  onClose,
  entity,
  unmappedColumns,
  existingSections,
  onCreated,
}: CreateFieldsBulkModalProps) {
  const [entries, setEntries] = useState<BulkFieldEntry[]>([]);
  const [sectionName, setSectionName] = useState('');
  const [showNewSection, setShowNewSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const entitySections = existingSections.filter(s => s.entite === entity.toUpperCase());

  useEffect(() => {
    if (!open) return;
    setEntries(
      unmappedColumns.map(col => ({
        header: col.header,
        label: cleanLabel(col.header),
        slug: labelToSlug(cleanLabel(col.header)),
        type: detectFieldType(col.values),
        checked: true,
      }))
    );
    const defaultSection = entitySections[0]?.section || '';
    setSectionName(defaultSection);
    setShowNewSection(entitySections.length === 0);
    setNewSectionName(entitySections.length === 0 ? 'Import' : '');
    setError('');
  }, [open, unmappedColumns]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkedCount = entries.filter(e => e.checked).length;

  const toggleCheck = (idx: number) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, checked: !e.checked } : e));
  };

  const updateEntry = (idx: number, field: Partial<BulkFieldEntry>) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, ...field } : e));
  };

  const handleSubmit = async () => {
    setError('');
    const toCreate = entries.filter(e => e.checked);
    if (toCreate.length === 0) { setError('Sélectionnez au moins un champ'); return; }

    const section = showNewSection ? newSectionName.trim() : sectionName;
    if (!section) { setError('La section est requise'); return; }

    const slugs = toCreate.map(e => e.slug);
    const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    if (dupes.length > 0) { setError(`Clés en double : ${[...new Set(dupes)].join(', ')}`); return; }

    setSaving(true);
    try {
      const created: ChampConfig[] = [];
      const headerToSlugMap: Record<string, string> = {};

      for (const entry of toCreate) {
        const res = await api.post<ApiResponse<ChampConfig>>('/champs-config', {
          entite: entity.toUpperCase(),
          section,
          label: entry.label.trim(),
          cle: entry.slug,
          type: entry.type,
          obligatoire: false,
        });
        created.push(res.data);
        headerToSlugMap[entry.header] = `custom_${res.data.cle}`;
      }

      onCreated(created, headerToSlugMap);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </span>
            Créer {unmappedColumns.length} champs personnalisés
          </h2>
          <p className="text-sm text-gray-500 mt-1 ml-10">
            Les colonnes suivantes vont être créées comme champs personnalisés pour l&apos;entité <strong>{ENTITY_LABELS[entity.toUpperCase()] || entity}</strong>
          </p>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[55vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700 font-medium">
              {error}
            </div>
          )}

          <div className="space-y-2">
            {entries.map((entry, idx) => (
              <div
                key={`${idx}-${entry.header}`}
                className={`rounded-xl border p-3 transition ${
                  entry.checked ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100 bg-gray-50/50 opacity-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={entry.checked}
                    onChange={() => toggleCheck(idx)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-gray-400 bg-gray-100 rounded px-1.5 py-0.5 truncate max-w-[150px]" title={entry.header}>
                        &ldquo;{entry.header}&rdquo;
                      </span>
                      <svg className="h-3.5 w-3.5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
                      {entry.checked ? (
                        <input
                          type="text"
                          value={entry.slug}
                          onChange={e => updateEntry(idx, { slug: e.target.value.replace(/[^a-z0-9_]/g, '') })}
                          className="text-xs font-mono text-blue-700 bg-white border border-blue-200 rounded px-2 py-0.5 w-32 outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <span className="text-xs font-mono text-gray-400">{entry.slug}</span>
                      )}
                    </div>
                  </div>
                  {entry.checked && (
                    <select
                      value={entry.type}
                      onChange={e => updateEntry(idx, { type: e.target.value as FieldType })}
                      className="text-xs rounded-lg border border-gray-200 bg-white px-2 py-1 text-gray-700 outline-none cursor-pointer"
                    >
                      {FIELD_TYPES.map(ft => (
                        <option key={ft.value} value={ft.value}>{ft.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Section pour tous les champs</label>
            {!showNewSection ? (
              <div className="flex gap-2">
                <select
                  value={sectionName}
                  onChange={e => setSectionName(e.target.value)}
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-4 text-sm text-gray-900 outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition cursor-pointer appearance-none"
                >
                  {entitySections.length === 0 && <option value="">Aucune section</option>}
                  {entitySections.map(s => (
                    <option key={s.section} value={s.section}>{s.section}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewSection(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 px-3 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition cursor-pointer whitespace-nowrap"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Nouvelle
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSectionName}
                  onChange={e => setNewSectionName(e.target.value)}
                  placeholder="Nom de la nouvelle section"
                  className="flex-1 rounded-xl border border-blue-200 bg-blue-50/30 py-2.5 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition"
                  autoFocus
                />
                {entitySections.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setShowNewSection(false); setSectionName(entitySections[0]?.section || ''); }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 transition cursor-pointer whitespace-nowrap"
                  >
                    Existante
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || checkedCount === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:from-violet-700 hover:to-purple-700 transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Création...</>
            ) : (
              <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" /></svg> Créer {checkedCount} champ{checkedCount > 1 ? 's' : ''} et mapper</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
