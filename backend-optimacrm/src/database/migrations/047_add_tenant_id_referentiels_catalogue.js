export const name = '047_add_tenant_id_referentiels_catalogue';

export async function up(client) {
  // --- marques ---
  await client.query(`
    ALTER TABLE marques
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE marques
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_marques_tenant_id ON marques (tenant_id)
  `);

  // --- fournisseurs ---
  await client.query(`
    ALTER TABLE fournisseurs
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE fournisseurs
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_fournisseurs_tenant_id ON fournisseurs (tenant_id)
  `);

  // --- familles_produits ---
  await client.query(`
    ALTER TABLE familles_produits
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE familles_produits
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_familles_produits_tenant_id ON familles_produits (tenant_id)
  `);

  // --- unites ---
  await client.query(`
    ALTER TABLE unites
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE unites
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_unites_tenant_id ON unites (tenant_id)
  `);

  // --- catalogue_produits ---
  await client.query(`
    ALTER TABLE catalogue_produits
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE catalogue_produits
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_catalogue_produits_tenant_id ON catalogue_produits (tenant_id)
  `);

  // --- produit_tarifs_clients (backfill trivial direct ; clients pas encore tenané, cf. Lot 2) ---
  await client.query(`
    ALTER TABLE produit_tarifs_clients
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE produit_tarifs_clients
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_produit_tarifs_clients_tenant_id ON produit_tarifs_clients (tenant_id)
  `);

  // --- champs_personnalises_config ---
  await client.query(`
    ALTER TABLE champs_personnalises_config
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE champs_personnalises_config
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_champs_personnalises_config_tenant_id ON champs_personnalises_config (tenant_id)
  `);

  // --- champs_personnalises_valeurs (entite_id polymorphe sans FK : backfill trivial direct) ---
  await client.query(`
    ALTER TABLE champs_personnalises_valeurs
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE champs_personnalises_valeurs
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_champs_personnalises_valeurs_tenant_id ON champs_personnalises_valeurs (tenant_id)
  `);

  // --- champs_personnalises_templates (table vivante, cf. tâche préalable) ---
  await client.query(`
    ALTER TABLE champs_personnalises_templates
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE champs_personnalises_templates
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_champs_personnalises_templates_tenant_id ON champs_personnalises_templates (tenant_id)
  `);

  // --- Passage en NOT NULL, une fois les 9 tables backfillées ---
  await client.query(`ALTER TABLE marques ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE fournisseurs ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE familles_produits ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE unites ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE catalogue_produits ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE produit_tarifs_clients ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE champs_personnalises_config ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE champs_personnalises_valeurs ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE champs_personnalises_templates ALTER COLUMN tenant_id SET NOT NULL`);
}

export async function down(client) {
  await client.query(`DROP INDEX IF EXISTS idx_champs_personnalises_templates_tenant_id`);
  await client.query(`ALTER TABLE champs_personnalises_templates DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_champs_personnalises_valeurs_tenant_id`);
  await client.query(`ALTER TABLE champs_personnalises_valeurs DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_champs_personnalises_config_tenant_id`);
  await client.query(`ALTER TABLE champs_personnalises_config DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_produit_tarifs_clients_tenant_id`);
  await client.query(`ALTER TABLE produit_tarifs_clients DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_catalogue_produits_tenant_id`);
  await client.query(`ALTER TABLE catalogue_produits DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_unites_tenant_id`);
  await client.query(`ALTER TABLE unites DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_familles_produits_tenant_id`);
  await client.query(`ALTER TABLE familles_produits DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_fournisseurs_tenant_id`);
  await client.query(`ALTER TABLE fournisseurs DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_marques_tenant_id`);
  await client.query(`ALTER TABLE marques DROP COLUMN IF EXISTS tenant_id`);
}
