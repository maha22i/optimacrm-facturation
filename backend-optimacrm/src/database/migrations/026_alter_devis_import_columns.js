export const name = '026_alter_devis_import_columns';

export async function up(client) {
  await client.query(`
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS nom_client_libre VARCHAR(255);
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS commercial VARCHAR(100);
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS date_relance DATE;
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS prevision_signature DATE;
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS probabilite_signature INTEGER DEFAULT 0;
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS situation_affaire VARCHAR(100);
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS date_validation DATE;
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS type_produit VARCHAR(100);
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS total_achat_ht NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS marge_realisee NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS taux_marge NUMERIC(5,2) DEFAULT 0;
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS taux_marque NUMERIC(5,2) DEFAULT 0;
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS facture_liee VARCHAR(30);
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS ordre_service VARCHAR(50);
    ALTER TABLE devis ADD COLUMN IF NOT EXISTS provenance VARCHAR(100);

    ALTER TABLE devis ALTER COLUMN client_id DROP NOT NULL;
    ALTER TABLE devis ALTER COLUMN objet DROP NOT NULL;
    ALTER TABLE devis ALTER COLUMN date_validite DROP NOT NULL;

    DROP INDEX IF EXISTS idx_devis_commercial_text;
    CREATE INDEX IF NOT EXISTS idx_devis_commercial_text ON devis (commercial);
    CREATE INDEX IF NOT EXISTS idx_devis_nom_client_libre ON devis (nom_client_libre);
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE devis DROP COLUMN IF EXISTS nom_client_libre;
    ALTER TABLE devis DROP COLUMN IF EXISTS commercial;
    ALTER TABLE devis DROP COLUMN IF EXISTS date_relance;
    ALTER TABLE devis DROP COLUMN IF EXISTS prevision_signature;
    ALTER TABLE devis DROP COLUMN IF EXISTS probabilite_signature;
    ALTER TABLE devis DROP COLUMN IF EXISTS situation_affaire;
    ALTER TABLE devis DROP COLUMN IF EXISTS date_validation;
    ALTER TABLE devis DROP COLUMN IF EXISTS type_produit;
    ALTER TABLE devis DROP COLUMN IF EXISTS total_achat_ht;
    ALTER TABLE devis DROP COLUMN IF EXISTS marge_realisee;
    ALTER TABLE devis DROP COLUMN IF EXISTS taux_marge;
    ALTER TABLE devis DROP COLUMN IF EXISTS taux_marque;
    ALTER TABLE devis DROP COLUMN IF EXISTS facture_liee;
    ALTER TABLE devis DROP COLUMN IF EXISTS ordre_service;
    ALTER TABLE devis DROP COLUMN IF EXISTS provenance;
  `);
}
