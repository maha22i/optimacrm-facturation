'use client';

import ImportContratsPage from '../import/page';

export default function ImportTelephoniePage() {
  return (
    <ImportContratsPage
      typeContrat="Telephonie"
      title="Import contrats téléphonie"
      subtitle="Importez vos contrats téléphonie avec mapping des colonnes. Chaque colonne de montant (Forfait Fixe, Mobile, Fibre...) crée une ligne d'abonnement."
    />
  );
}
