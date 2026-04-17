'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { ApiResponse, ChampValeur, EntiteType, TypeChamp } from '@/lib/types';

interface Props {
  entite: EntiteType;
  entiteId: number | null;
  onChange?: (valeurs: Record<string, string>) => void;
  readOnly?: boolean;
}

interface GroupedSection {
  section: string;
  section_ordre: number;
  champs: ChampValeur[];
}

export default function ChampsPersonnalisesForm({ entite, entiteId, onChange, readOnly = false }: Props) {
  const [sections, setSections] = useState<GroupedSection[]>([]);
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (entiteId) {
        const res = await api.get<ApiResponse<ChampValeur[]>>(`/champs-config/valeurs/${entite}/${entiteId}`);
        groupAndSet(res.data);
      } else {
        const res = await api.get<ApiResponse<ChampValeur[]>>(`/champs-config?entite=${entite}&actif=true`);
        const mapped: ChampValeur[] = (res.data as unknown as Array<{
          id: number; section: string; section_ordre: number; label: string; cle: string;
          type: TypeChamp; obligatoire: boolean; options_liste: string[] | null;
          valeur_defaut: string | null;
        }>).map(c => ({
          config_id: c.id,
          entite_id: 0,
          valeur: c.valeur_defaut || null,
          label: c.label,
          cle: c.cle,
          type: c.type,
          section: c.section,
          section_ordre: c.section_ordre,
          ordre: 0,
          obligatoire: c.obligatoire,
          options_liste: c.options_liste,
          valeur_defaut: c.valeur_defaut,
          valeur_id: null,
        }));
        groupAndSet(mapped);
      }
    } catch {
      setSections([]);
    } finally {
      setLoading(false);
    }
  }, [entite, entiteId]);

  function groupAndSet(data: ChampValeur[]) {
    const grouped: Record<string, GroupedSection> = {};
    const valeursMap: Record<string, string> = {};

    for (const item of data) {
      if (!grouped[item.section]) {
        grouped[item.section] = { section: item.section, section_ordre: item.section_ordre, champs: [] };
      }
      grouped[item.section].champs.push(item);
      valeursMap[item.cle] = item.valeur || '';
    }

    const sorted = Object.values(grouped).sort((a, b) => a.section_ordre - b.section_ordre);
    setSections(sorted);
    setValeurs(valeursMap);
  }

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => { onChange?.(valeurs); }, [valeurs, onChange]);

  const updateValeur = (cle: string, value: string) => {
    setValeurs(prev => ({ ...prev, [cle]: value }));
  };

  if (loading) {
    return (
      <div className="py-6 flex justify-center">
        <div className="animate-spin h-6 w-6 border-[3px] border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (sections.length === 0) return null;

  return (
    <div className="space-y-6">
      {sections.map(section => (
        <div key={section.section}>
          <div className="flex items-center gap-2 mb-4">
            <span className="h-2 w-2 rounded-full bg-indigo-500" />
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">{section.section}</h3>
            <div className="flex-1 border-t border-gray-100" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {section.champs.map(champ => (
              <ChampInput
                key={champ.cle}
                champ={champ}
                value={valeurs[champ.cle] || ''}
                onChange={v => updateValeur(champ.cle, v)}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReadOnlyValue({ label, value, type }: { label: string; value: string; type: TypeChamp }) {
  let displayValue = value || '—';
  if (type === 'BOOLEEN') displayValue = value === 'true' ? 'Oui' : 'Non';
  if (type === 'DATE' && value) {
    try { displayValue = new Date(value).toLocaleDateString('fr-FR'); } catch { /* keep raw */ }
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3 border-l-4 border-l-indigo-300">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{displayValue}</p>
    </div>
  );
}

function ChampInput({ champ, value, onChange, readOnly }: {
  champ: ChampValeur;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
}) {
  if (readOnly) {
    return <ReadOnlyValue label={champ.label} value={value} type={champ.type} />;
  }

  const baseClass = 'w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-4 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition';

  switch (champ.type) {
    case 'TEXTE':
      return (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {champ.label}
            {champ.obligatoire && <span className="text-red-500 ml-1">*</span>}
          </label>
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={champ.valeur_defaut || ''}
            className={baseClass}
          />
        </div>
      );

    case 'NOMBRE':
      return (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {champ.label}
            {champ.obligatoire && <span className="text-red-500 ml-1">*</span>}
          </label>
          <input
            type="number"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={champ.valeur_defaut || '0'}
            className={baseClass}
          />
        </div>
      );

    case 'DATE':
      return (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {champ.label}
            {champ.obligatoire && <span className="text-red-500 ml-1">*</span>}
          </label>
          <input
            type="date"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={baseClass}
          />
        </div>
      );

    case 'LISTE':
      return (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            {champ.label}
            {champ.obligatoire && <span className="text-red-500 ml-1">*</span>}
          </label>
          <div className="relative">
            <select
              value={value}
              onChange={e => onChange(e.target.value)}
              className={`${baseClass} appearance-none pr-10 cursor-pointer`}
            >
              <option value="">Sélectionner...</option>
              {(champ.options_liste || []).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
          </div>
        </div>
      );

    case 'BOOLEEN':
      return (
        <div className="flex items-center gap-3 py-2">
          <button
            type="button"
            role="switch"
            aria-checked={value === 'true'}
            onClick={() => onChange(value === 'true' ? 'false' : 'true')}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out cursor-pointer ${value === 'true' ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${value === 'true' ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <label className="text-sm font-semibold text-gray-700">
            {champ.label}
            {champ.obligatoire && <span className="text-red-500 ml-1">*</span>}
          </label>
        </div>
      );

    default:
      return null;
  }
}
