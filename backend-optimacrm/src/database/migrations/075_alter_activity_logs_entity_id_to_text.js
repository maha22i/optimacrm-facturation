export const name = '075_alter_activity_logs_entity_id_to_text';

export async function up(client) {
  await client.query(`
    ALTER TABLE activity_logs
    ALTER COLUMN entity_id TYPE TEXT USING entity_id::TEXT
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE activity_logs
    ALTER COLUMN entity_id TYPE INTEGER USING entity_id::INTEGER
  `);
}
