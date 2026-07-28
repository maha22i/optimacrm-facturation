export const name = '046_add_tenant_id_transverse';

export async function up(client) {
  // --- activity_logs ---
  await client.query(`
    ALTER TABLE activity_logs
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE activity_logs
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_activity_logs_tenant_id ON activity_logs (tenant_id)
  `);

  // --- import_logs ---
  await client.query(`
    ALTER TABLE import_logs
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE import_logs
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_import_logs_tenant_id ON import_logs (tenant_id)
  `);

  // --- import_mappings_saved ---
  await client.query(`
    ALTER TABLE import_mappings_saved
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE import_mappings_saved
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_import_mappings_saved_tenant_id ON import_mappings_saved (tenant_id)
  `);

  // --- user_permissions ---
  await client.query(`
    ALTER TABLE user_permissions
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE user_permissions
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_user_permissions_tenant_id ON user_permissions (tenant_id)
  `);

  // --- email_logs ---
  await client.query(`
    ALTER TABLE email_logs
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE email_logs
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_email_logs_tenant_id ON email_logs (tenant_id)
  `);

  // --- Passage en NOT NULL, une fois les 5 tables backfillées ---
  await client.query(`ALTER TABLE activity_logs ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE import_logs ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE import_mappings_saved ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE user_permissions ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE email_logs ALTER COLUMN tenant_id SET NOT NULL`);
}

export async function down(client) {
  await client.query(`DROP INDEX IF EXISTS idx_email_logs_tenant_id`);
  await client.query(`ALTER TABLE email_logs DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_user_permissions_tenant_id`);
  await client.query(`ALTER TABLE user_permissions DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_import_mappings_saved_tenant_id`);
  await client.query(`ALTER TABLE import_mappings_saved DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_import_logs_tenant_id`);
  await client.query(`ALTER TABLE import_logs DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_activity_logs_tenant_id`);
  await client.query(`ALTER TABLE activity_logs DROP COLUMN IF EXISTS tenant_id`);
}
