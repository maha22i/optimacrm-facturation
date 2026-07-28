export const name = '049_add_tenant_id_devis';

export async function up(client) {
  // --- devis — backfill dérivé du client parent (client_id NOT NULL, FK réelle) ---
  await client.query(`
    ALTER TABLE devis
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE devis d
    SET tenant_id = c.tenant_id
    FROM clients c
    WHERE d.client_id = c.id AND d.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_devis_tenant_id ON devis (tenant_id)
  `);

  // --- devis_lignes — backfill dérivé du devis parent (devis_id NOT NULL, FK réelle CASCADE) ---
  await client.query(`
    ALTER TABLE devis_lignes
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE devis_lignes dl
    SET tenant_id = d.tenant_id
    FROM devis d
    WHERE dl.devis_id = d.id AND dl.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_devis_lignes_tenant_id ON devis_lignes (tenant_id)
  `);

  // --- devis_champs_personnalises — backfill dérivé du devis parent ---
  await client.query(`
    ALTER TABLE devis_champs_personnalises
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE devis_champs_personnalises dcp
    SET tenant_id = d.tenant_id
    FROM devis d
    WHERE dcp.devis_id = d.id AND dcp.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_devis_champs_personnalises_tenant_id ON devis_champs_personnalises (tenant_id)
  `);

  // --- devis_historique — backfill dérivé du devis parent ---
  await client.query(`
    ALTER TABLE devis_historique
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE devis_historique dh
    SET tenant_id = d.tenant_id
    FROM devis d
    WHERE dh.devis_id = d.id AND dh.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_devis_historique_tenant_id ON devis_historique (tenant_id)
  `);

  // --- bons_commande — backfill dérivé directement du client (chaîne la plus courte,
  //     client_id NOT NULL / FK réelle ; préféré à une dérivation via devis_id) ---
  await client.query(`
    ALTER TABLE bons_commande
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE bons_commande bc
    SET tenant_id = c.tenant_id
    FROM clients c
    WHERE bc.client_id = c.id AND bc.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_bons_commande_tenant_id ON bons_commande (tenant_id)
  `);

  // --- Passage en NOT NULL, une fois les 5 tables backfillées ---
  await client.query(`ALTER TABLE devis ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE devis_lignes ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE devis_champs_personnalises ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE devis_historique ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE bons_commande ALTER COLUMN tenant_id SET NOT NULL`);
}

export async function down(client) {
  await client.query(`DROP INDEX IF EXISTS idx_bons_commande_tenant_id`);
  await client.query(`ALTER TABLE bons_commande DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_devis_historique_tenant_id`);
  await client.query(`ALTER TABLE devis_historique DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_devis_champs_personnalises_tenant_id`);
  await client.query(`ALTER TABLE devis_champs_personnalises DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_devis_lignes_tenant_id`);
  await client.query(`ALTER TABLE devis_lignes DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_devis_tenant_id`);
  await client.query(`ALTER TABLE devis DROP COLUMN IF EXISTS tenant_id`);
}
