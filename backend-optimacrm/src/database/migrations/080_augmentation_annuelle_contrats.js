export const name = '080_augmentation_annuelle_contrats';

// ---------------------------------------------------------------------------
// Augmentation annuelle des tarifs d'un contrat.
//
// Anniversaire = date d'installation (repli sur date de signature puis date de
// début si absente).
// Taux composé : chaque anniversaire multiplie les tarifs déjà augmentés.
// Non rétroactif : augmentation_date_reference borne le passé, seuls les
// anniversaires postérieurs à cette date sont appliqués. Elle est posée à la
// date du jour lors de la mise en place (migration, import, activation).
//
// Remplace l'ancien mécanisme qui stockait le taux en texte dans
// contrats.notes ("Augmentation: 2%") et se déclenchait sur
// date_renouvellement : le taux est remonté dans la colonne dédiée et la
// ligne correspondante est retirée des notes.
//
// contrat_augmentations trace chaque application (valeurs avant/après) et son
// unicité (contrat_id, date_anniversaire) garantit qu'un anniversaire ne peut
// pas être appliqué deux fois, même si le job et la facturation se croisent.
// ---------------------------------------------------------------------------

export async function up(client) {
  await client.query(`
    ALTER TABLE contrats
      ADD COLUMN IF NOT EXISTS augmentation_active         BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS augmentation_pourcentage    NUMERIC(5,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS augmentation_date_reference DATE,
      ADD COLUMN IF NOT EXISTS augmentation_prochaine_date DATE,
      ADD COLUMN IF NOT EXISTS augmentation_derniere_date  DATE,
      ADD COLUMN IF NOT EXISTS augmentation_nb_appliquees  INTEGER NOT NULL DEFAULT 0
  `);

  await client.query(`
    ALTER TABLE contrats DROP CONSTRAINT IF EXISTS contrats_augmentation_pourcentage_check
  `);
  await client.query(`
    ALTER TABLE contrats
      ADD CONSTRAINT contrats_augmentation_pourcentage_check
      CHECK (augmentation_pourcentage >= 0 AND augmentation_pourcentage <= 100)
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS contrat_augmentations (
      id                SERIAL PRIMARY KEY,
      tenant_id         UUID NOT NULL REFERENCES tenants(id)
                        DEFAULT current_setting('app.current_tenant_id')::uuid,
      contrat_id        INTEGER NOT NULL REFERENCES contrats(id) ON DELETE CASCADE,
      date_anniversaire DATE NOT NULL,
      pourcentage       NUMERIC(5,2) NOT NULL,
      declencheur       VARCHAR(20) NOT NULL DEFAULT 'Job',
      applique_par      TEXT,
      nb_elements       INTEGER NOT NULL DEFAULT 0,
      details           JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (contrat_id, date_anniversaire)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contrat_augmentations_contrat
      ON contrat_augmentations (tenant_id, contrat_id, date_anniversaire DESC)
  `);

  await client.query(`ALTER TABLE contrat_augmentations ENABLE ROW LEVEL SECURITY`);
  await client.query(`ALTER TABLE contrat_augmentations FORCE ROW LEVEL SECURITY`);
  await client.query(`DROP POLICY IF EXISTS tenant_isolation ON contrat_augmentations`);
  await client.query(`
    CREATE POLICY tenant_isolation ON contrat_augmentations
      USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        OR NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      )
      WITH CHECK (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        OR NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      )
  `);

  // --- Reprise des taux stockés dans les notes par les imports ---
  await client.query(`
    UPDATE contrats
    SET augmentation_pourcentage = LEAST(
          100,
          replace(substring(notes from 'Augmentation:[[:space:]]*([0-9]+(?:[.,][0-9]+)?)[[:space:]]*%'), ',', '.')::numeric
        )
    WHERE notes ~ 'Augmentation:[[:space:]]*[0-9]'
  `);
  await client.query(`
    UPDATE contrats
    SET notes = NULLIF(
          btrim(regexp_replace(notes, 'Augmentation:[^\\n]*\\n?', '', 'g'), E' \\n'),
          ''
        )
    WHERE notes ~ 'Augmentation:'
  `);

  // --- Planification initiale : aucun anniversaire passé n'est rattrapé ---
  await client.query(`
    WITH calc AS (
      SELECT id,
             (COALESCE(date_installation, date_signature, date_debut)
               + make_interval(years => GREATEST(
                   0,
                   EXTRACT(YEAR FROM CURRENT_DATE)::int
                     - EXTRACT(YEAR FROM COALESCE(date_installation, date_signature, date_debut))::int
                 ))
             )::date AS candidat
      FROM contrats
      WHERE COALESCE(date_installation, date_signature, date_debut) IS NOT NULL
    )
    UPDATE contrats c
    SET augmentation_date_reference = CURRENT_DATE,
        augmentation_prochaine_date = CASE
          WHEN calc.candidat > CURRENT_DATE THEN calc.candidat
          ELSE (calc.candidat + interval '1 year')::date
        END
    FROM calc
    WHERE c.id = calc.id
  `);
  await client.query(`
    UPDATE contrats
    SET augmentation_date_reference = CURRENT_DATE
    WHERE augmentation_date_reference IS NULL
  `);
}

export async function down(client) {
  await client.query(`DROP TABLE IF EXISTS contrat_augmentations`);
  await client.query(`ALTER TABLE contrats DROP CONSTRAINT IF EXISTS contrats_augmentation_pourcentage_check`);
  await client.query(`
    ALTER TABLE contrats
      DROP COLUMN IF EXISTS augmentation_active,
      DROP COLUMN IF EXISTS augmentation_pourcentage,
      DROP COLUMN IF EXISTS augmentation_date_reference,
      DROP COLUMN IF EXISTS augmentation_prochaine_date,
      DROP COLUMN IF EXISTS augmentation_derniere_date,
      DROP COLUMN IF EXISTS augmentation_nb_appliquees
  `);
}
