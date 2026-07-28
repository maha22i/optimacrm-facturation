export const name = '050_add_tenant_id_contrats';

export async function up(client) {
  // --- contrats — backfill dérivé du client parent (client_id NOT NULL, FK réelle) ---
  await client.query(`
    ALTER TABLE contrats
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE contrats co
    SET tenant_id = c.tenant_id
    FROM clients c
    WHERE co.client_id = c.id AND co.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contrats_tenant_id ON contrats (tenant_id)
  `);

  // --- contrat_lignes — backfill dérivé du contrat parent (contrat_id NOT NULL, FK réelle CASCADE) ---
  await client.query(`
    ALTER TABLE contrat_lignes
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE contrat_lignes cl
    SET tenant_id = co.tenant_id
    FROM contrats co
    WHERE cl.contrat_id = co.id AND cl.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contrat_lignes_tenant_id ON contrat_lignes (tenant_id)
  `);

  // --- contrat_machines — backfill dérivé du contrat parent (contrat_id NOT NULL, FK réelle CASCADE) ---
  await client.query(`
    ALTER TABLE contrat_machines
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE contrat_machines cm
    SET tenant_id = co.tenant_id
    FROM contrats co
    WHERE cm.contrat_id = co.id AND cm.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_contrat_machines_tenant_id ON contrat_machines (tenant_id)
  `);

  // --- Passage en NOT NULL, une fois les 3 tables backfillées ---
  await client.query(`ALTER TABLE contrats ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE contrat_lignes ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE contrat_machines ALTER COLUMN tenant_id SET NOT NULL`);
}

export async function down(client) {
  await client.query(`DROP INDEX IF EXISTS idx_contrat_machines_tenant_id`);
  await client.query(`ALTER TABLE contrat_machines DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_contrat_lignes_tenant_id`);
  await client.query(`ALTER TABLE contrat_lignes DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_contrats_tenant_id`);
  await client.query(`ALTER TABLE contrats DROP COLUMN IF EXISTS tenant_id`);
}
