export const name = '016_add_parc_couts_copie';

export async function up(client) {
  const { rows } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'parc_machines'
  `);
  const cols = new Set(rows.map(r => r.column_name));

  if (!cols.has('cout_copie_nb')) {
    await client.query('ALTER TABLE parc_machines ADD COLUMN cout_copie_nb DECIMAL(10,6)');
  }
  if (!cols.has('cout_copie_couleur')) {
    await client.query('ALTER TABLE parc_machines ADD COLUMN cout_copie_couleur DECIMAL(10,6)');
  }
  if (!cols.has('volume_offert_nb')) {
    await client.query('ALTER TABLE parc_machines ADD COLUMN volume_offert_nb INTEGER DEFAULT 0');
  }
  if (!cols.has('volume_offert_couleur')) {
    await client.query('ALTER TABLE parc_machines ADD COLUMN volume_offert_couleur INTEGER DEFAULT 0');
  }
}
