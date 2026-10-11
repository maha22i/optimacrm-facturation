export const name = '079_add_lot_contrat_machines';

// ---------------------------------------------------------------------------
// Un lot = plusieurs machines sous le même contrat et le même identifiant_lot,
// partageant UN forfait porté par la machine principale. Le regroupement se
// fait sur (contrat_id, identifiant_lot) : une facture est rattachée à un seul
// contrat, donc un lot réparti sur deux contrats est facturé séparément et
// signalé à l'import.
//
// est_principale est dérivée du forfait (volume_forfait_* > 0), pas du flag P
// du fichier source — conservé à part dans lot_role_fichier pour l'affichage
// et la détection de divergences.
//
// Pas d'index unique sur la principale : deux forfaits dans un même lot doivent
// remonter une alerte, pas faire échouer l'import.
// ---------------------------------------------------------------------------

export async function up(client) {
  await client.query(`
    ALTER TABLE contrat_machines
      ADD COLUMN IF NOT EXISTS identifiant_lot  VARCHAR(50),
      ADD COLUMN IF NOT EXISTS est_principale   BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS lot_role_fichier CHAR(1)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contrat_machines_lot
      ON contrat_machines (tenant_id, contrat_id, identifiant_lot)
      WHERE identifiant_lot IS NOT NULL
  `);
}

export async function down(client) {
  await client.query(`DROP INDEX IF EXISTS idx_contrat_machines_lot`);
  await client.query(`
    ALTER TABLE contrat_machines
      DROP COLUMN IF EXISTS identifiant_lot,
      DROP COLUMN IF EXISTS est_principale,
      DROP COLUMN IF EXISTS lot_role_fichier
  `);
}
