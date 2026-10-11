export const name = '078_add_compteur_initial_contrat_machines';

// ---------------------------------------------------------------------------
// Compteur relevé à la pose de la machine, importé depuis les colonnes
// "COMPTEUR INITIAL N/B" / "COMPTEUR INITIAL COULEUR" du fichier contrats.
// Nullable volontairement : NULL = donnée absente du fichier, 0 = compteur
// réellement à zéro. À distinguer de dernier_compteur_* qui suit les relevés.
// ---------------------------------------------------------------------------

export async function up(client) {
  await client.query(`
    ALTER TABLE contrat_machines
      ADD COLUMN IF NOT EXISTS compteur_initial_nb      INTEGER,
      ADD COLUMN IF NOT EXISTS compteur_initial_couleur INTEGER
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE contrat_machines
      DROP COLUMN IF EXISTS compteur_initial_nb,
      DROP COLUMN IF EXISTS compteur_initial_couleur
  `);
}
