export const name = '038_remove_categorie_check_add_mapping_type';

export async function up(client) {
  // 1) Supprimer la contrainte CHECK rigide sur categorie_ligne
  //    La validation se fait désormais en applicatif via contratCategories.js
  //    pour permettre l'ajout de rubriques sans migration SQL.
  await client.query(`
    ALTER TABLE contrat_lignes
    DROP CONSTRAINT IF EXISTS contrat_lignes_categorie_ligne_check
  `);

  // 2) Ajouter type_contrat à import_mappings_saved
  //    pour séparer les mappings par type (Copieur, Telephonie, etc.)
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'import_mappings_saved' AND column_name = 'type_contrat'
      ) THEN
        ALTER TABLE import_mappings_saved
        ADD COLUMN type_contrat VARCHAR(30) DEFAULT NULL;
      END IF;
    END $$;
  `);

  // 3) Remplacer la contrainte d'unicité pour inclure type_contrat
  await client.query(`
    ALTER TABLE import_mappings_saved
    DROP CONSTRAINT IF EXISTS import_mappings_entity_name_unique
  `);
  await client.query(`
    ALTER TABLE import_mappings_saved
    ADD CONSTRAINT import_mappings_entity_name_type_unique
    UNIQUE (entity_type, name, type_contrat)
  `);

  console.log('  → CHECK categorie_ligne supprimée, type_contrat ajouté à import_mappings_saved');
}

export async function down(client) {
  await client.query(`
    ALTER TABLE import_mappings_saved
    DROP CONSTRAINT IF EXISTS import_mappings_entity_name_type_unique
  `);
  await client.query(`
    ALTER TABLE import_mappings_saved
    ADD CONSTRAINT import_mappings_entity_name_unique
    UNIQUE (entity_type, name)
  `);
  await client.query(`
    DO $$
    BEGIN
      ALTER TABLE import_mappings_saved DROP COLUMN IF EXISTS type_contrat;
    END $$;
  `);
  console.log('  ⚠ Contrainte categorie_ligne non restaurée (volontaire).');
}
