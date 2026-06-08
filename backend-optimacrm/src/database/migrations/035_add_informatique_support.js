export const name = '035_add_informatique_support';

export async function up(client) {
  // 1) Ajouter colonne inclus_abonnement sur contrat_lignes (idempotent)
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'contrat_lignes' AND column_name = 'inclus_abonnement'
      ) THEN
        ALTER TABLE contrat_lignes ADD COLUMN inclus_abonnement BOOLEAN DEFAULT true;
      END IF;
    END $$;
  `);

  // 2) Supprimer l'ancienne contrainte CHECK sur categorie_ligne et la remplacer
  //    par une contrainte étendue incluant les catégories Informatique/Sécurité
  await client.query(`
    DO $$
    BEGIN
      -- Supprimer la contrainte existante (nom par défaut ou explicite)
      BEGIN
        ALTER TABLE contrat_lignes DROP CONSTRAINT IF EXISTS contrat_lignes_categorie_ligne_check;
      EXCEPTION WHEN undefined_object THEN
        NULL;
      END;
    END $$;
  `);

  await client.query(`
    ALTER TABLE contrat_lignes ADD CONSTRAINT contrat_lignes_categorie_ligne_check
    CHECK (categorie_ligne IN (
      'Forfait Fixe',
      'Forfait Mobile',
      'Lien Internet',
      'Location Matériel',
      'Services',
      'Autre',
      'Forfait Copie N&B',
      'Forfait Copie Couleur',
      'Service Connectic',
      'PLC',
      'Hors Forfait',
      'Personnalisé',
      'Vidéosurveillance',
      'Contrôle d''accès',
      'Téléassistance',
      'Générateur de brouillard',
      'Maintenance serveur',
      'Maintenance informatique',
      'Cloud',
      'Office 365',
      'Logiciel / Licence'
    ))
  `);

  console.log('  → colonne inclus_abonnement ajoutée + contrainte categorie_ligne étendue');
}

export async function down(client) {
  // Restaurer l'ancienne contrainte
  await client.query(`
    ALTER TABLE contrat_lignes DROP CONSTRAINT IF EXISTS contrat_lignes_categorie_ligne_check
  `);
  await client.query(`
    ALTER TABLE contrat_lignes ADD CONSTRAINT contrat_lignes_categorie_ligne_check
    CHECK (categorie_ligne IN (
      'Forfait Fixe', 'Forfait Mobile', 'Lien Internet', 'Location Matériel',
      'Services', 'Autre', 'Forfait Copie N&B', 'Forfait Copie Couleur',
      'Service Connectic', 'PLC', 'Hors Forfait'
    ))
  `);
  // On ne supprime PAS la colonne inclus_abonnement (jamais de DROP)
  console.log('  ⚠ Contrainte restaurée (catégories d\'origine). Colonne inclus_abonnement conservée.');
}
