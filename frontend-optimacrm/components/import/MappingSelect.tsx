'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ImportFieldGroup } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MappingSelectProps {
  value: string | null | undefined;
  onChange: (val: string | null) => void;
  standardGroups: ImportFieldGroup[];
  customGroups: ImportFieldGroup[];
  usedFields: string[];
  onCreateField: () => void;
  groupIcons?: Record<string, string>;
}

const DEFAULT_GROUP_ICONS: Record<string, string> = {
  'Identification': '🏷️',
  'Classification': '📋',
  'Tarification': '💰',
  'Stock': '📦',
  'Copieur': '🖨️',
  'Contrat': '📄',
  'Dates': '📅',
  'Financement': '💰',
  'Machine': '🖨️',
  'Tarifs copie': '📊',
  'Volumes forfait': '📦',
  'Services machine': '🔧',
  'Dernière facturation': '🧾',
  'Adresse (vérification)': '📍',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function MappingSelect({
  value,
  onChange,
  standardGroups,
  customGroups,
  usedFields,
  onCreateField,
  groupIcons = {},
}: MappingSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const icons = { ...DEFAULT_GROUP_ICONS, ...groupIcons };

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); setSearch(''); }
  }, []);

  const handleSelect = useCallback((key: string | null) => {
    onChange(key);
    setOpen(false);
    setSearch('');
  }, [onChange]);

  const currentLabel = (() => {
    if (!value) return '-- Ignorer cette colonne --';
    for (const g of standardGroups) {
      const f = g.fields.find(f => f.key === value);
      if (f) return `${f.label}${f.required ? ' ★' : ''}`;
    }
    for (const g of customGroups) {
      const f = g.fields.find(f => f.key === value);
      if (f) return `📝 ${f.label} (${f.type})`;
    }
    return value;
  })();

  const searchLower = search.toLowerCase();

  const filterFields = (fields: ImportFieldGroup['fields']) => {
    if (!search) return fields;
    return fields.filter(f =>
      f.label.toLowerCase().includes(searchLower) || f.key.toLowerCase().includes(searchLower)
    );
  };

  const hasCustomGroups = customGroups.length > 0;

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full text-left appearance-none rounded-lg border px-3 py-2 text-sm font-medium outline-none transition cursor-pointer flex items-center justify-between gap-2 ${
          value ? 'border-blue-200 bg-blue-50/50 text-blue-800' : 'border-gray-200 bg-gray-50 text-gray-400'
        } hover:border-blue-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10`}
      >
        <span className="truncate">{currentLabel}</span>
        <svg className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
      </button>

      {open && (
        <div className="absolute z-[9999] mt-1 w-full min-w-[320px] bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden" style={{ maxHeight: '380px' }}>
          <div className="p-2 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un champ..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30"
            />
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: '310px' }}>
            {/* Ignore option */}
            {(!search || '-- ignorer cette colonne --'.includes(searchLower)) && (
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className={`w-full text-left px-3 py-2 text-sm transition cursor-pointer hover:bg-gray-50 ${
                  !value ? 'bg-gray-50 font-semibold text-gray-700' : 'text-gray-400'
                }`}
              >
                -- Ignorer cette colonne --
              </button>
            )}

            {/* Standard groups */}
            {standardGroups.map(g => {
              const filtered = filterFields(g.fields);
              if (filtered.length === 0) return null;
              return (
                <div key={g.group}>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/80 sticky top-0">
                    {icons[g.group] || '📌'} {g.group}
                  </div>
                  {filtered.map(f => {
                    const isUsed = usedFields.includes(f.key);
                    const isSelected = value === f.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => !isUsed && handleSelect(f.key)}
                        disabled={isUsed}
                        className={`w-full text-left px-4 py-1.5 text-sm transition cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected ? 'bg-blue-50 text-blue-700 font-semibold' :
                          isUsed ? 'text-gray-300 cursor-not-allowed' :
                          'text-gray-700 hover:bg-blue-50/50'
                        }`}
                      >
                        <span className="truncate">
                          {f.label}{f.required ? ' ★' : ''}
                        </span>
                        {isUsed && <span className="text-[10px] text-gray-300 shrink-0">déjà utilisé</span>}
                        {isSelected && (
                          <svg className="h-3.5 w-3.5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* Custom groups */}
            {hasCustomGroups && customGroups.map(g => {
              const filtered = filterFields(g.fields);
              if (filtered.length === 0) return null;
              return (
                <div key={`custom_${g.group}`}>
                  <div className="px-3 py-1.5 text-[10px] font-bold text-indigo-500 uppercase tracking-wider bg-indigo-50/50 sticky top-0">
                    📝 Champs perso &gt; {g.group}
                  </div>
                  {filtered.map(f => {
                    const isUsed = usedFields.includes(f.key);
                    const isSelected = value === f.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => !isUsed && handleSelect(f.key)}
                        disabled={isUsed}
                        className={`w-full text-left px-4 py-1.5 text-sm transition cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected ? 'bg-indigo-50 text-indigo-700 font-semibold' :
                          isUsed ? 'text-gray-300 cursor-not-allowed' :
                          'text-gray-700 hover:bg-indigo-50/50'
                        }`}
                      >
                        <span className="truncate">
                          {f.label} ({f.type}{f.required ? ', Obligatoire' : ''})
                        </span>
                        {isUsed && <span className="text-[10px] text-gray-300 shrink-0">déjà utilisé</span>}
                        {isSelected && (
                          <svg className="h-3.5 w-3.5 text-indigo-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* Separator + Create option */}
            <div className="border-t border-gray-200 mt-1">
              <button
                type="button"
                onClick={() => { onCreateField(); setOpen(false); setSearch(''); }}
                className="w-full text-left px-4 py-2.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition cursor-pointer flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Créer un nouveau champ personnalisé...
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
