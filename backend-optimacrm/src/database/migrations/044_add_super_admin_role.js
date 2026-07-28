export const name = '044_add_super_admin_role';

export async function up(client) {
  await client.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check
  `);
  await client.query(`
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('admin', 'user', 'admin_technique', 'technicien', 'super_admin'))
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check
  `);
  await client.query(`
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('admin', 'user', 'admin_technique', 'technicien'))
  `);
}
