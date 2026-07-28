export const name = '052_add_tenant_id_factures_avoirs';

export async function up(client) {
  // --- factures — backfill dérivé du client parent (client_id NOT NULL, FK réelle) ---
  await client.query(`
    ALTER TABLE factures
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE factures f
    SET tenant_id = c.tenant_id
    FROM clients c
    WHERE f.client_id = c.id AND f.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_factures_tenant_id ON factures (tenant_id)
  `);

  // --- facture_lignes — backfill dérivé de la facture parente (facture_id NOT NULL, FK réelle CASCADE) ---
  await client.query(`
    ALTER TABLE facture_lignes
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE facture_lignes fl
    SET tenant_id = f.tenant_id
    FROM factures f
    WHERE fl.facture_id = f.id AND fl.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_facture_lignes_tenant_id ON facture_lignes (tenant_id)
  `);

  // --- facture_reglements — backfill dérivé de la facture parente ---
  await client.query(`
    ALTER TABLE facture_reglements
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE facture_reglements fr
    SET tenant_id = f.tenant_id
    FROM factures f
    WHERE fr.facture_id = f.id AND fr.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_facture_reglements_tenant_id ON facture_reglements (tenant_id)
  `);

  // --- facture_historique — backfill dérivé de la facture parente ---
  await client.query(`
    ALTER TABLE facture_historique
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE facture_historique fh
    SET tenant_id = f.tenant_id
    FROM factures f
    WHERE fh.facture_id = f.id AND fh.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_facture_historique_tenant_id ON facture_historique (tenant_id)
  `);

  // --- avoirs — backfill dérivé directement du client (chaîne la plus courte,
  //     client_id NOT NULL / FK réelle ; préféré à une dérivation via facture_id) ---
  await client.query(`
    ALTER TABLE avoirs
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE avoirs av
    SET tenant_id = c.tenant_id
    FROM clients c
    WHERE av.client_id = c.id AND av.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_avoirs_tenant_id ON avoirs (tenant_id)
  `);

  // --- avoir_lignes — backfill dérivé de l'avoir parent (avoir_id NOT NULL, FK réelle CASCADE) ---
  await client.query(`
    ALTER TABLE avoir_lignes
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE avoir_lignes al
    SET tenant_id = av.tenant_id
    FROM avoirs av
    WHERE al.avoir_id = av.id AND al.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_avoir_lignes_tenant_id ON avoir_lignes (tenant_id)
  `);

  // --- Passage en NOT NULL, une fois les 6 tables backfillées ---
  await client.query(`ALTER TABLE factures ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE facture_lignes ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE facture_reglements ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE facture_historique ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE avoirs ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE avoir_lignes ALTER COLUMN tenant_id SET NOT NULL`);
}

export async function down(client) {
  await client.query(`DROP INDEX IF EXISTS idx_avoir_lignes_tenant_id`);
  await client.query(`ALTER TABLE avoir_lignes DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_avoirs_tenant_id`);
  await client.query(`ALTER TABLE avoirs DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_facture_historique_tenant_id`);
  await client.query(`ALTER TABLE facture_historique DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_facture_reglements_tenant_id`);
  await client.query(`ALTER TABLE facture_reglements DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_facture_lignes_tenant_id`);
  await client.query(`ALTER TABLE facture_lignes DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_factures_tenant_id`);
  await client.query(`ALTER TABLE factures DROP COLUMN IF EXISTS tenant_id`);
}
