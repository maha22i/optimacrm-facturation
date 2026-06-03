export const name = '028_add_client_numero_rcs';

export async function up(client) {
  await client.query(`
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS numero_rcs VARCHAR(50);
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE clients DROP COLUMN IF EXISTS numero_rcs;
  `);
}
