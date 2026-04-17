export const name = '007_alter_catalogue_produits_extended';

export async function up(client) {
  await client.query(`
    ALTER TABLE catalogue_produits
      ADD COLUMN IF NOT EXISTS reference_fournisseur VARCHAR(100),
      ADD COLUMN IF NOT EXISTS code_barre VARCHAR(100),
      ADD COLUMN IF NOT EXISTS contribution_environnement DECIMAL(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS frais_divers DECIMAL(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS prix_achat DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS prix_revient DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS prix_vendeur DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS prix_public DECIMAL(12,2),
      ADD COLUMN IF NOT EXISTS marge_pourcentage DECIMAL(6,2),
      ADD COLUMN IF NOT EXISTS quantite_stock INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS alerte_stock_mini DECIMAL(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS quantite_reapprovisionnement INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS hors_catalogue BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE catalogue_produits
      DROP COLUMN IF EXISTS reference_fournisseur,
      DROP COLUMN IF EXISTS code_barre,
      DROP COLUMN IF EXISTS contribution_environnement,
      DROP COLUMN IF EXISTS frais_divers,
      DROP COLUMN IF EXISTS prix_achat,
      DROP COLUMN IF EXISTS prix_revient,
      DROP COLUMN IF EXISTS prix_vendeur,
      DROP COLUMN IF EXISTS prix_public,
      DROP COLUMN IF EXISTS marge_pourcentage,
      DROP COLUMN IF EXISTS quantite_stock,
      DROP COLUMN IF EXISTS alerte_stock_mini,
      DROP COLUMN IF EXISTS quantite_reapprovisionnement,
      DROP COLUMN IF EXISTS hors_catalogue,
      DROP COLUMN IF EXISTS image_url;
  `);
}
