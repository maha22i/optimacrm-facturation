export const name = '051_add_tenant_id_parc_releves';

export async function up(client) {
  // --- imports_releves — backfill trivial direct vers Groupe Innov
  //     (aucune colonne de rattachement métier pertinente : uniquement des FK vers users) ---
  await client.query(`
    ALTER TABLE imports_releves
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE imports_releves
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_imports_releves_tenant_id ON imports_releves (tenant_id)
  `);

  // --- parc_machines — backfill trivial direct vers Groupe Innov
  //     (client_id FK réelle mais nullable — statut "En stock" légitime sans client ;
  //      contrat_id INTEGER nu sans FK, jamais utilisable comme source) ---
  await client.query(`
    ALTER TABLE parc_machines
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE parc_machines
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_parc_machines_tenant_id ON parc_machines (tenant_id)
  `);

  // --- releves_compteurs — backfill dérivé de parc_machines via machine_id
  //     (FK réelle NOT NULL ON DELETE CASCADE ; facture_id et import_id exclus) ---
  await client.query(`
    ALTER TABLE releves_compteurs
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE releves_compteurs rc
    SET tenant_id = pm.tenant_id
    FROM parc_machines pm
    WHERE rc.machine_id = pm.id AND rc.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_releves_compteurs_tenant_id ON releves_compteurs (tenant_id)
  `);

  // --- Passage en NOT NULL, une fois les 3 tables backfillées ---
  await client.query(`ALTER TABLE imports_releves ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE parc_machines ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE releves_compteurs ALTER COLUMN tenant_id SET NOT NULL`);
}

export async function down(client) {
  await client.query(`DROP INDEX IF EXISTS idx_releves_compteurs_tenant_id`);
  await client.query(`ALTER TABLE releves_compteurs DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_parc_machines_tenant_id`);
  await client.query(`ALTER TABLE parc_machines DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_imports_releves_tenant_id`);
  await client.query(`ALTER TABLE imports_releves DROP COLUMN IF EXISTS tenant_id`);
}
