'use client';

import ImportContratsTyped from '@/components/import/ImportContratsTyped';

export default function ImportTelephoniePage() {
  return (
    <ImportContratsTyped
      config={{
        type: 'Telephonie',
        title: 'Import contrats téléphonie',
        subtitle: 'Importez les contrats depuis le fichier Contrats_TELEPHONIE.xlsx',
        fileName: 'Contrats_TELEPHONIE.xlsx',
        color: 'green',
        gradientFrom: 'from-green-600',
        gradientTo: 'to-emerald-600',
        shadowColor: 'shadow-green-500/25',
        icon: (
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
          </svg>
        ),
        infoItems: [
          'Formats supportés : fichier à flags (0/1) ou fichier ligne par rubrique avec montants',
          'Le format est détecté automatiquement selon les en-têtes de colonnes',
          '5 contrats exclus pour incohérence client (S-5095, L-0750, B-4684, N-6226, I-6176)',
          '1 client manquant (code 8680)',
          'Les montants sont importés depuis le fichier. Si une rubrique n\'a pas de montant, elle sera créée à 0€',
          'Les montants FTC > 0 créeront une ligne dédiée',
        ],
      }}
    />
  );
}
