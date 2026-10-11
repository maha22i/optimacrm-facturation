export const name = '081_renouvellement_contrats';

// ---------------------------------------------------------------------------
// Renouvellement automatique des contrats copieur.
//
// Le décompte part de la date d'installation (mise en service), repli sur la
// date de début : c'est l'usage du métier, la location financière court à
// partir de la mise en service et non de la signature.
//
//   date_echeance       = installation + duree_contrat_mois (fin de la période
//                         initiale, figée, ne bouge plus)
//   date_renouvellement = première fin de période non passée, obtenue en
//                         ajoutant duree_reconduction_mois autant de fois que
//                         nécessaire (tacite reconduction)
//   date d'alerte       = date_renouvellement - preavis_renouvellement_mois
//
// Les deux dates deviennent calculées (lecture seule côté formulaire) et sont
// recalculées à chaque écriture du contrat ainsi que par le job quotidien.
//
// renouvellement_traite_echeance mémorise l'échéance pour laquelle la relance a
// été faite : l'alerte disparaît de la liste, et réapparaît d'elle-même au
// cycle suivant puisque date_renouvellement aura changé de valeur.
// ---------------------------------------------------------------------------

export async function up(client) {
  await client.query(`
    ALTER TABLE contrats
      ADD COLUMN IF NOT EXISTS duree_reconduction_mois        INTEGER NOT NULL DEFAULT 12,
      ADD COLUMN IF NOT EXISTS preavis_renouvellement_mois    INTEGER NOT NULL DEFAULT 6,
      ADD COLUMN IF NOT EXISTS renouvellement_traite_echeance DATE,
      ADD COLUMN IF NOT EXISTS renouvellement_traite_date     DATE,
      ADD COLUMN IF NOT EXISTS renouvellement_traite_par      TEXT
  `);

  await client.query(`
    ALTER TABLE contrats DROP CONSTRAINT IF EXISTS contrats_duree_reconduction_check
  `);
  await client.query(`
    ALTER TABLE contrats
      ADD CONSTRAINT contrats_duree_reconduction_check
      CHECK (duree_reconduction_mois >= 0 AND duree_reconduction_mois <= 120)
  `);
  await client.query(`
    ALTER TABLE contrats DROP CONSTRAINT IF EXISTS contrats_preavis_renouvellement_check
  `);
  await client.query(`
    ALTER TABLE contrats
      ADD CONSTRAINT contrats_preavis_renouvellement_check
      CHECK (preavis_renouvellement_mois >= 0 AND preavis_renouvellement_mois <= 60)
  `);

  // La liste des contrats à renouveler filtre sur le type et trie sur la date.
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contrats_renouvellement
      ON contrats (type_contrat, date_renouvellement)
      WHERE deleted_at IS NULL
  `);

  // --- Reprise de l'existant ---------------------------------------------
  // generate_series cherche le premier multiple de la reconduction qui ne soit
  // pas passé. `+ interval` borne au dernier jour du mois cible, exactement
  // comme addMonthsUTC côté service (un 31/08 + 1 mois donne le 30/09).
  //
  // Conservateur par construction : une date de renouvellement déjà saisie et
  // encore à venir est respectée, seules les dates absentes ou dépassées sont
  // (re)calculées.
  await client.query(`
    WITH premiere AS (
      SELECT id,
             (COALESCE(date_installation, date_debut)
               + make_interval(months => duree_contrat_mois))::date AS fin_initiale,
             GREATEST(duree_reconduction_mois, 1) AS reconduction
      FROM contrats
      WHERE type_contrat = 'Copieur'
        AND deleted_at IS NULL
        AND COALESCE(date_installation, date_debut) IS NOT NULL
        AND COALESCE(duree_contrat_mois, 0) > 0
    ),
    calc AS (
      SELECT p.id,
             p.fin_initiale,
             COALESCE((
               SELECT (p.fin_initiale + make_interval(months => p.reconduction * k))::date
               FROM generate_series(0, 200) AS k
               WHERE (p.fin_initiale + make_interval(months => p.reconduction * k))::date >= CURRENT_DATE
               ORDER BY k
               LIMIT 1
             ), p.fin_initiale) AS prochaine
      FROM premiere p
    )
    UPDATE contrats c
    SET date_echeance = COALESCE(c.date_echeance, calc.fin_initiale),
        date_renouvellement = CASE
          WHEN c.date_renouvellement IS NULL OR c.date_renouvellement < CURRENT_DATE
            THEN calc.prochaine
          ELSE c.date_renouvellement
        END,
        updated_at = NOW()
    FROM calc
    WHERE c.id = calc.id
  `);
}

export async function down(client) {
  await client.query(`DROP INDEX IF EXISTS idx_contrats_renouvellement`);
  await client.query(`ALTER TABLE contrats DROP CONSTRAINT IF EXISTS contrats_duree_reconduction_check`);
  await client.query(`ALTER TABLE contrats DROP CONSTRAINT IF EXISTS contrats_preavis_renouvellement_check`);
  await client.query(`
    ALTER TABLE contrats
      DROP COLUMN IF EXISTS duree_reconduction_mois,
      DROP COLUMN IF EXISTS preavis_renouvellement_mois,
      DROP COLUMN IF EXISTS renouvellement_traite_echeance,
      DROP COLUMN IF EXISTS renouvellement_traite_date,
      DROP COLUMN IF EXISTS renouvellement_traite_par
  `);
}
