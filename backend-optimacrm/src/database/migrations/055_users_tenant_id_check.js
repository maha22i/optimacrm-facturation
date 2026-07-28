export const name = '055_users_tenant_id_check';

export async function up(client) {
  // Vérification préalable : aucun user non-super_admin ne doit avoir tenant_id NULL,
  // sinon l'ajout de la contrainte CHECK échouerait (et ferait rollback toute la migration,
  // ce qui est le comportement voulu — mieux vaut le voir ici qu'après coup).
  const { rows } = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM users
    WHERE role != 'super_admin' AND tenant_id IS NULL
  `);
  if (rows[0].count > 0) {
    throw new Error(
      `Migration 055 abandonnée : ${rows[0].count} user(s) non-super_admin ont tenant_id NULL. ` +
      `Corrige ces lignes avant de rejouer cette migration.`
    );
  }

  // La colonne tenant_id reste nullable au niveau type (super_admin doit pouvoir
  // rester cross-tenant, sans organisation). La contrainte CHECK impose la règle
  // conditionnelle : NULL autorisé uniquement pour role = 'super_admin'.
  await client.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_id_required_check
  `);
  await client.query(`
    ALTER TABLE users ADD CONSTRAINT users_tenant_id_required_check
      CHECK (role = 'super_admin' OR tenant_id IS NOT NULL)
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tenant_id_required_check
  `);
}
