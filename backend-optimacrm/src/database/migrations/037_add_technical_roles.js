export const name = '037_add_technical_roles';

export async function up(client) {
  await client.query(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check
  `);
  await client.query(`
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('admin', 'user', 'admin_technique', 'technicien'))
  `);
}
