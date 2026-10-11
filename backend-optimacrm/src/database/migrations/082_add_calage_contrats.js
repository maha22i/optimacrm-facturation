export const name = '082_add_calage_contrats';

// ---------------------------------------------------------------------------
// Calage du contrat : information purement déclarative saisie dans le bloc
// financement, sans incidence sur la facturation ni sur les échéances.
// date_calage n'a de sens que si calage est vrai.
// ---------------------------------------------------------------------------

export async function up(client) {
  await client.query(`
    ALTER TABLE contrats
      ADD COLUMN IF NOT EXISTS calage      BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS date_calage DATE
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE contrats
      DROP COLUMN IF EXISTS calage,
      DROP COLUMN IF EXISTS date_calage
  `);
}
