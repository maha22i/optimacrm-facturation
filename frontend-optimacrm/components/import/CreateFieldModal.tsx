'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { ApiResponse, ChampConfig, SectionInfo } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateFieldModalProps {
  open: boolean;
  onClose: () => void;
  entity: string;
  columnName: string;
  columnValues: unknown[];
  existingSections: SectionInfo[];
  onCreated: (field: ChampConfig) => void;
}

type FieldType = 'TEXTE' | 'NOMBRE' | 'DATE' | 'LISTE' | 'BOOLEEN';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'TEXTE', label: 'Texte' },
  { value: 'NOMBRE', label: 'Nombre' },
  { value: 'DATE', label: 'Date' },
  { value: 'LISTE', label: 'Liste' },
  { value: 'BOOLEEN', label: 'Booléen' },
];

// ─── Utils ────────────────────────────────────────────────────────────────────

export function cleanLabel(raw: string): string {
  return raw
    .replace(/[\n\r\t]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function labelToSlug(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function detectFieldType(values: unknown[]): FieldType {
  const nonEmpty = values
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(v => String(v).trim());

  if (nonEmpty.length === 0) return 'TEXTE';

  const boolValues = ['oui', 'non', 'yes', 'no', 'true', 'false', '0', '1', 'vrai', 'faux'];
  if (nonEmpty.every(v => boolValues.includes(v.toLowerCase()))) return 'BOOLEEN';

  if (nonEmpty.every(v => !isNaN(parseFloat(v.replace(',', '.').replace(/\s/g, ''))))) return 'NOMBRE';

  const dateRegex = /^(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}|\d{4}[/\-]\d{1,2}[/\-]\d{1,2})$/;
  if (nonEmpty.every(v => dateRegex.test(v))) return 'DATE';

  return 'TEXTE';
}

// ─── Entity label mapping ─────────────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
  CATALOGUE: 'Catalogue',
  CLIENT: 'Clients',
  CONTRAT: 'Contrats',
  DEVIS: 'Devis',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreateFieldModal({
  open,
  onClose,
  entity,
  columnName,
  columnValues,
  existingSections,
  onCreated,
}: CreateFieldModalProps) {
  const [label, setLabel] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [type, setType] = useState<FieldType>('TEXTE');
  const [sectionId, setSectionId] = useState('');
  const [newSectionName, setNewSectionName] = useState('');
  const [showNewSection, setShowNewSection] = useState(false);
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const entitySections = existingSections.filter(
    s => s.entite === entity.toUpperCase()
  );

  useEffect(() => {
    if (!open) return;
    const cleaned = cleanLabel(columnName);
    setLabel(cleaned);
    setSlug(labelToSlug(cleaned));
    setSlugManuallyEdited(false);
    setType(detectFieldType(columnValues));
    setSectionId(entitySections[0]?.section || '');
    setNewSectionName('');
    setShowNewSection(entitySections.length === 0);
    setRequired(false);
    setError('');
  }, [open, columnName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLabelChange = useCallback((val: string) => {
    setLabel(val);
    if (!slugManuallyEdited) setSlug(labelToSlug(val));
  }, [slugManuallyEdited]);

  const handleSlugChange = useCallback((val: string) => {
    setSlug(val.replace(/[^a-z0-9_]/g, ''));
    setSlugManuallyEdited(true);
  }, []);

  const handleSubmit = async () => {
    setError('');

    if (!label.trim()) { setError('Le label est requis'); return; }
    if (!slug.trim()) { setError('La clé interne est requise'); return; }
    if (!/^[a-z0-9_]+$/.test(slug)) { setError('La clé interne doit contenir uniquement a-z, 0-9, _'); return; }

    const sectionName = showNewSection ? newSectionName.trim() : sectionId;
    if (!sectionName) { setError('La section est requise'); return; }

    setSaving(true);
    try {
      const res = await api.post<ApiResponse<ChampConfig>>('/champs-config', {
        entite: entity.toUpperCase(),
        section: sectionName,
        label: label.trim(),
        cle: slug,
        type,
        obligatoire: required,
      });

      onCreated(res.data);
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            </span>
            Nouveau champ personnalisé
          </h2>
          <p className="text-sm text-gray-500 mt-1 ml-10">
            Ce champ sera ajouté à l&apos;entité <strong>{ENTITY_LABELS[entity.toUpperCase()] || entity}</strong> et disponible pour le mapping
          </p>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700 font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Label <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={label}
              onChange={e => handleLabelChange(e.target.value)}
              placeholder="ex: Taux de marge"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Clé interne <span className="text-gray-400 font-normal">(auto-générée, modifiable)</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={e => handleSlugChange(e.target.value)}
              placeholder="taux_de_marge"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-4 text-sm font-mono text-gray-700 placeholder-gray-400 outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Type <span className="text-red-500">*</span></label>
            <div className="flex flex-wrap gap-2">
              {FIELD_TYPES.map(ft => (
                <button
                  key={ft.value}
                  type="button"
                  onClick={() => setType(ft.value)}
                  className={`px-3.5 py-2 rounded-lg text-sm font-medium transition cursor-pointer border ${
                    type === ft.value
                      ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {ft.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Section <span className="text-red-500">*</span></label>
            {!showNewSection ? (
              <div className="flex gap-2">
                <select
                  value={sectionId}
                  onChange={e => setSectionId(e.target.value)}
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
                    onClick={() => { setShowNewSection(false); setSectionId(entitySections[0]?.section || ''); }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50 transition cursor-pointer whitespace-nowrap"
                  >
                    Existante
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              role="switch"
              aria-checked={required}
              onClick={() => setRequired(!required)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${required ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition ${required ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
            <span className="text-sm font-medium text-gray-700">Obligatoire</span>
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
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 cursor-pointer"
          >
            {saving ? (
              <><div className="h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Création...</>
            ) : (
              <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" /></svg> Créer et mapper</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
