export const name = '048_add_tenant_id_clients';

export async function up(client) {
  // --- clients (racine) — backfill trivial direct vers Groupe Innov ---
  await client.query(`
    ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE clients
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_clients_tenant_id ON clients (tenant_id)
  `);

  // --- client_adresses — backfill dérivé du client parent ---
  await client.query(`
    ALTER TABLE client_adresses
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE client_adresses ca
    SET tenant_id = c.tenant_id
    FROM clients c
    WHERE ca.client_id = c.id AND ca.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_client_adresses_tenant_id ON client_adresses (tenant_id)
  `);

  // --- client_contacts — backfill dérivé du client parent ---
  await client.query(`
    ALTER TABLE client_contacts
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE client_contacts cc
    SET tenant_id = c.tenant_id
    FROM clients c
    WHERE cc.client_id = c.id AND cc.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_client_contacts_tenant_id ON client_contacts (tenant_id)
  `);

  // --- client_documents — backfill dérivé du client parent ---
  await client.query(`
    ALTER TABLE client_documents
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE client_documents cd
    SET tenant_id = c.tenant_id
    FROM clients c
    WHERE cd.client_id = c.id AND cd.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_client_documents_tenant_id ON client_documents (tenant_id)
  `);

  // --- Passage en NOT NULL, une fois les 4 tables backfillées ---
  // Si une ligne orpheline (client_id sans parent) est restée à tenant_id NULL,
  // cet ALTER échoue et fait rollback toute la migration — comportement voulu.
  await client.query(`ALTER TABLE clients ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE client_adresses ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE client_contacts ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE client_documents ALTER COLUMN tenant_id SET NOT NULL`);
}

export async function down(client) {
  await client.query(`DROP INDEX IF EXISTS idx_client_documents_tenant_id`);
  await client.query(`ALTER TABLE client_documents DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_client_contacts_tenant_id`);
  await client.query(`ALTER TABLE client_contacts DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_client_adresses_tenant_id`);
  await client.query(`ALTER TABLE client_adresses DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_clients_tenant_id`);
  await client.query(`ALTER TABLE clients DROP COLUMN IF EXISTS tenant_id`);
}
