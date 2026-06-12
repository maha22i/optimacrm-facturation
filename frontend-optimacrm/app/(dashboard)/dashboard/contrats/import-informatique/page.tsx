'use client';

import ImportContratsPage from '../import/page';

export default function ImportInformatiquePage() {
  return (
    <ImportContratsPage
      typeContrat="Informatique"
      title="Import contrats informatique"
      subtitle="Importez vos contrats informatique avec mapping des colonnes. Chaque colonne de montant crée une ligne d'abonnement."
    />
  );
}
