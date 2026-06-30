export const name = '042_add_terme_facturation';

export async function up(client) {
  await client.query(`
    ALTER TABLE contrats
    ADD COLUMN IF NOT EXISTS terme_facturation VARCHAR(3) DEFAULT 'TEC';
  `);

  await client.query(`
    ALTER TABLE contrats
    DROP CONSTRAINT IF EXISTS contrats_terme_facturation_check;
  `);

  await client.query(`
    ALTER TABLE contrats
    ADD CONSTRAINT contrats_terme_facturation_check
    CHECK (terme_facturation IN ('TAE', 'TEC'));
  `);

  await client.query(`
    UPDATE contrats SET terme_facturation = 'TEC' WHERE terme_facturation IS NULL;
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE contrats
    DROP CONSTRAINT IF EXISTS contrats_terme_facturation_check;
  `);

  await client.query(`
    ALTER TABLE contrats DROP COLUMN IF EXISTS terme_facturation;
  `);
}
