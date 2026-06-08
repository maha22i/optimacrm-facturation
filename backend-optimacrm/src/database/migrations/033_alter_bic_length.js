export const name = '033_alter_bic_length';

export async function up(client) {
  await client.query(`
    ALTER TABLE clients ALTER COLUMN bic TYPE VARCHAR(20);
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE clients ALTER COLUMN bic TYPE VARCHAR(11);
  `);
}
