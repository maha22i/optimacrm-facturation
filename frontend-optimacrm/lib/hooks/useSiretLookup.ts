import { useState, useCallback } from 'react';

export interface SiretLookupResult {
  raisonSociale: string;
  formeJuridique: string;
  siret: string;
  siren: string;
  tvaIntra: string;
  numeroRcs: string;
  codeApe: string;
  adresse: string;
  codePostal: string;
  ville: string;
}

export type LookupStatus = 'idle' | 'loading' | 'success' | 'error' | 'not_found';

const FORME_JURIDIQUE_MAP: Record<string, string> = {
  '5710': 'SAS', '5720': 'SAS',
  '5499': 'SARL', '5485': 'SARL',
  '5599': 'SA', '5505': 'SA',
  '5410': 'EURL',
  '5202': 'SNC',
  '6540': 'SCI',
  '1000': 'EI', '1100': 'EI',
};

function calculateTvaIntra(siren: string): string {
  if (!/^\d{9}$/.test(siren)) return '';
  const sirenNum = parseInt(siren, 10);
  const cle = (12 + 3 * (sirenNum % 97)) % 97;
  return `FR${cle.toString().padStart(2, '0')}${siren}`;
}

function buildNumeroRcs(siren: string, ville: string): string {
  if (!siren || !ville) return '';
  const villeNormalisee = ville
    .toUpperCase()
    .replace(/^(PARIS|LYON|MARSEILLE)\s.*$/, '$1');
  return `RCS ${villeNormalisee} ${siren}`;
}

export function useSiretLookup() {
  const [status, setStatus] = useState<LookupStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (input: string): Promise<SiretLookupResult | null> => {
    const cleaned = input.replace(/\s/g, '');
    if (!/^\d{9}$/.test(cleaned) && !/^\d{14}$/.test(cleaned)) {
      setStatus('idle');
      return null;
    }

    setStatus('loading');
    setError(null);

    try {
      const url = `https://recherche-entreprises.api.gouv.fr/search?q=${cleaned}&page=1&per_page=1`;
      const response = await fetch(url);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      if (!data.results || data.results.length === 0) {
        setStatus('not_found');
        setError('Aucune entreprise trouvée pour ce numéro');
        return null;
      }

      const entreprise = data.results[0];
      const siege = entreprise.siege || {};

      let etablissement = siege;
      if (cleaned.length === 14 && entreprise.matching_etablissements?.length > 0) {
        const match = entreprise.matching_etablissements.find(
          (e: { siret: string }) => e.siret === cleaned
        );
        if (match) etablissement = match;
      }

      const siren = entreprise.siren || '';
      const villeSiege = siege.libelle_commune || '';

      const result: SiretLookupResult = {
        raisonSociale: entreprise.nom_raison_sociale || entreprise.nom_complet || '',
        formeJuridique: FORME_JURIDIQUE_MAP[entreprise.nature_juridique] || 'AUTRE',
        siret: etablissement.siret || siege.siret || '',
        siren,
        tvaIntra: calculateTvaIntra(siren),
        numeroRcs: buildNumeroRcs(siren, villeSiege),
        codeApe: etablissement.activite_principale || siege.activite_principale || '',
        adresse: etablissement.adresse || siege.adresse || '',
        codePostal: etablissement.code_postal || siege.code_postal || '',
        ville: etablissement.libelle_commune || siege.libelle_commune || '',
      };

      setStatus('success');
      return result;
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Erreur lors de la recherche');
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return { lookup, status, error, reset };
}
