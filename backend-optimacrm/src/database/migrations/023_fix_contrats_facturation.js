export const name = '023_fix_contrats_facturation';

export async function up(client) {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'contrats' AND column_name = 'prochaine_date_facturation'
      ) THEN
        ALTER TABLE contrats ADD COLUMN prochaine_date_facturation DATE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'contrats' AND column_name = 'derniere_date_facturation'
      ) THEN
        ALTER TABLE contrats ADD COLUMN derniere_date_facturation DATE;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'contrats' AND column_name = 'periodicite'
      ) THEN
        ALTER TABLE contrats ADD COLUMN periodicite VARCHAR(20) DEFAULT 'mensuel';
      END IF;
    END
    $$;

    -- Sync: copier les valeurs existantes de date_prochaine_facture vers prochaine_date_facturation si vide
    UPDATE contrats
    SET prochaine_date_facturation = date_prochaine_facture
    WHERE prochaine_date_facturation IS NULL
      AND date_prochaine_facture IS NOT NULL;

    -- Sync: copier derniere_facture_date vers derniere_date_facturation si vide
    UPDATE contrats
    SET derniere_date_facturation = derniere_facture_date
    WHERE derniere_date_facturation IS NULL
      AND derniere_facture_date IS NOT NULL;
  `);
}
