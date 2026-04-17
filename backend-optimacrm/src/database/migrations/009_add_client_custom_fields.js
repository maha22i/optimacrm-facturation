export const name = '009_add_client_custom_fields';

export async function up(client) {
  await client.query(`
    ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS champs_personnalises JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE clients
    DROP COLUMN IF EXISTS champs_personnalises;
  `);
}
