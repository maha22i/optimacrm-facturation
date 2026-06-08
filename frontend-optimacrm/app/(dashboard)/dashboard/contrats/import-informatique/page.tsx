'use client';

import ImportContratsTyped from '@/components/import/ImportContratsTyped';

export default function ImportInformatiquePage() {
  return (
    <ImportContratsTyped
      config={{
        type: 'Informatique',
        title: 'Import contrats informatique',
        subtitle: 'Importez les contrats depuis Contrats_INFORMATIQUE.xlsx et Logiciels_INFORMATIQUE.xlsx',
        fileName: 'Contrats_INFORMATIQUE.xlsx',
        color: 'blue',
        gradientFrom: 'from-blue-600',
        gradientTo: 'to-indigo-600',
        shadowColor: 'shadow-blue-500/25',
        supportsLogiciels: true,
        icon: (
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z" />
          </svg>
        ),
        infoItems: [
          'Format : une ligne par contrat avec colonnes de rubriques (Video, Ctrl, TlAssist, GenBr, Tls, LibAutre)',
          'Rattachement client via N°client = code_client en base',
          '5 contrats exclus pour incohérence client (S-5095, L-0750, B-4684, N-6226, I-6176)',
          'Les montants sont importés EXACTEMENT depuis le fichier — jamais hardcodé à 0',
          'Fichier logiciels optionnel : licences rattachées par NumeroContrat',
          'Prochaine facturation alignée sur 01/06/2026 (pas de rétro-facturation)',
          'Ré-importer ne duplique pas (upsert par numéro de contrat)',
        ],
      }}
    />
  );
}
