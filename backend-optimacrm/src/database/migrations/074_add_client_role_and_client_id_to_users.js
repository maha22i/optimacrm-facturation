export const name = '074_add_client_role_and_client_id_to_users';

// ---------------------------------------------------------------------------
// Espace client — fondations auth.
//
// Ajoute le rôle « client » à la table users et une colonne client_id pour
// relier un user portail-client à son entité clients.
//
// Contrainte de cohérence bidirectionnelle :
//   - role = 'client'  → client_id NOT NULL
//   - role != 'client' → client_id IS NULL
//
// La contrainte users_tenant_id_required_check existante reste satisfaite :
// un client (comme tout rôle non super_admin) a forcément un tenant_id.
// ---------------------------------------------------------------------------

export async function up(client) {
  // 1. Nouvelle colonne client_id (nullable, FK vers clients)
  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL
  `);

  // 2. Remplacer la contrainte de rôle pour inclure 'client'
  await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await client.query(`
    ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'user', 'admin_technique', 'technicien', 'super_admin', 'client'))
  `);

  // 3. Contrainte de cohérence role ↔ client_id
  await client.query(`
    ALTER TABLE users ADD CONSTRAINT users_client_id_coherence
    CHECK (
      (role = 'client' AND client_id IS NOT NULL)
      OR
      (role != 'client' AND client_id IS NULL)
    )
  `);

  // 4. Index partiel sur client_id
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_users_client_id
    ON users (client_id) WHERE client_id IS NOT NULL
  `);
}

export async function down(client) {
  await client.query(`DROP INDEX IF EXISTS idx_users_client_id`);
  await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_client_id_coherence`);

  await client.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await client.query(`
    ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'user', 'admin_technique', 'technicien', 'super_admin'))
  `);

  await client.query(`ALTER TABLE users DROP COLUMN IF EXISTS client_id`);
}
