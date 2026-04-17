export const name = '006_alter_catalogue_produits_fk';

export async function up(client) {
  await client.query(`
    ALTER TABLE catalogue_produits
      ADD COLUMN IF NOT EXISTS fournisseur_id INTEGER REFERENCES fournisseurs(id),
      ADD COLUMN IF NOT EXISTS marque_id INTEGER REFERENCES marques(id),
      ADD COLUMN IF NOT EXISTS famille_id INTEGER REFERENCES familles_produits(id),
      ADD COLUMN IF NOT EXISTS modele VARCHAR(255),
      ADD COLUMN IF NOT EXISTS type_document VARCHAR(20) NOT NULL DEFAULT 'MARCHANDISE';

    ALTER TABLE catalogue_produits
      ADD CONSTRAINT catalogue_type_document_check CHECK (
        type_document IN ('MARCHANDISE','PRESTATION')
      );

    CREATE INDEX IF NOT EXISTS idx_catalogue_fournisseur ON catalogue_produits (fournisseur_id);
    CREATE INDEX IF NOT EXISTS idx_catalogue_marque ON catalogue_produits (marque_id);
    CREATE INDEX IF NOT EXISTS idx_catalogue_famille ON catalogue_produits (famille_id);
  `);
}

export async function down(client) {
  await client.query(`
    DROP INDEX IF EXISTS idx_catalogue_famille;
    DROP INDEX IF EXISTS idx_catalogue_marque;
    DROP INDEX IF EXISTS idx_catalogue_fournisseur;
    ALTER TABLE catalogue_produits DROP CONSTRAINT IF EXISTS catalogue_type_document_check;
    ALTER TABLE catalogue_produits
      DROP COLUMN IF EXISTS type_document,
      DROP COLUMN IF EXISTS modele,
      DROP COLUMN IF EXISTS famille_id,
      DROP COLUMN IF EXISTS marque_id,
      DROP COLUMN IF EXISTS fournisseur_id;
  `);
}
