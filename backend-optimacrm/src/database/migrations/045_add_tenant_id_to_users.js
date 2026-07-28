export const name = '045_add_tenant_id_to_users';

export async function up(client) {
  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);

  await client.query(`
    UPDATE users
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users (tenant_id)
  `);
}

export async function down(client) {
  await client.query(`
    DROP INDEX IF EXISTS idx_users_tenant_id
  `);
  await client.query(`
    ALTER TABLE users DROP COLUMN IF EXISTS tenant_id
  `);
}
