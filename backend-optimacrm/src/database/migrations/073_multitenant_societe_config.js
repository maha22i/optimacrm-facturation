export const name = '073_multitenant_societe_config';

// ---------------------------------------------------------------------------
// Multi-tenant — societe_config (4/4, dernière table singleton).
//
// Identité légale, IBAN, logo, mentions légales — affichée sur tous les PDF
// (devis/factures/avoirs) et utilisée dans les emails (nom société dans les
// templates). Singleton renforcé par une contrainte explicite :
// `id INTEGER PRIMARY KEY DEFAULT 1 CONSTRAINT societe_config_singleton
// CHECK (id = 1)` (004_create_societe_config.js).
//
// Point PK : même problème que tenant_email_config (071) — `DEFAULT 1` est
// un littéral, pas une séquence. Même solution : conversion en pseudo-SERIAL
// (séquence dédiée + nextval() en DEFAULT), setval() au MAX(id) existant (1)
// pour que le prochain tenant obtienne id = 2 sans collision, ligne
// existante préservée à l'identique.
//
// Le singleton "une ligne pour toute l'app" devient "une ligne par tenant" :
// UNIQUE (tenant_id) remplace CHECK (id = 1).
//
// Pattern identique à 070/071/072.
// ---------------------------------------------------------------------------

export async function up(client) {
  // 1. tenant_id, nullable dans un premier temps (backfill à suivre)
  await client.query(`
    ALTER TABLE societe_config
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);

  // 2. Backfill de la ligne existante vers Groupe Innov
  await client.query(`
    UPDATE societe_config
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);

  // 3. Index + NOT NULL, une fois la ligne backfillée
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_societe_config_tenant_id ON societe_config (tenant_id)
  `);
  await client.query(`ALTER TABLE societe_config ALTER COLUMN tenant_id SET NOT NULL`);

  // 4. DEFAULT current_setting(...) — sans `true` en 2ᵉ argument : une
  //    écriture hors contexte tenant doit échouer bruyamment plutôt que
  //    silencieusement (même forme que 056/070/071/072).
  await client.query(`
    ALTER TABLE societe_config
    ALTER COLUMN tenant_id
    SET DEFAULT current_setting('app.current_tenant_id')::uuid
  `);

  // 5. Retrait du singleton "id = 1" — remplacé plus bas par un singleton
  //    "par tenant" (UNIQUE (tenant_id)).
  await client.query(`
    ALTER TABLE societe_config DROP CONSTRAINT IF EXISTS societe_config_singleton
  `);

  // 6. id : DEFAULT littéral 1 → pseudo-SERIAL (séquence dédiée), pour
  //    permettre l'insertion d'une ligne par tenant sans collision de PK.
  //    La ligne existante (id = 1) n'est pas modifiée ; seul le DEFAULT
  //    change pour les futures insertions. Même mécanisme que 071.
  await client.query(`CREATE SEQUENCE IF NOT EXISTS societe_config_id_seq`);
  await client.query(`ALTER SEQUENCE societe_config_id_seq OWNED BY societe_config.id`);
  await client.query(`
    SELECT setval('societe_config_id_seq', COALESCE((SELECT MAX(id) FROM societe_config), 1))
  `);
  await client.query(`
    ALTER TABLE societe_config
    ALTER COLUMN id
    SET DEFAULT nextval('societe_config_id_seq')
  `);

  // 7. Singleton "par tenant" : une seule ligne de config société par tenant.
  await client.query(`
    ALTER TABLE societe_config
    ADD CONSTRAINT societe_config_tenant_id_unique UNIQUE (tenant_id)
  `);

  // 8. RLS — policy NULLIF (forme corrigée par 068). Même pattern que
  //    070/071/072.
  await client.query(`
    ALTER TABLE societe_config ENABLE ROW LEVEL SECURITY;
    ALTER TABLE societe_config FORCE ROW LEVEL SECURITY;
  `);

  await client.query(`DROP POLICY IF EXISTS tenant_isolation ON societe_config;`);

  await client.query(`
    CREATE POLICY tenant_isolation ON societe_config
      USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        OR NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      )
      WITH CHECK (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        OR NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
      );
  `);
}

export async function down(client) {
  await client.query(`DROP POLICY IF EXISTS tenant_isolation ON societe_config;`);
  await client.query(`ALTER TABLE societe_config DISABLE ROW LEVEL SECURITY;`);

  await client.query(`
    ALTER TABLE societe_config DROP CONSTRAINT IF EXISTS societe_config_tenant_id_unique
  `);

  // Revert id : pseudo-SERIAL → DEFAULT littéral 1 (comme à l'origine).
  // Ne réussira proprement que s'il ne reste qu'une seule ligne (id = 1).
  await client.query(`ALTER TABLE societe_config ALTER COLUMN id SET DEFAULT 1`);
  await client.query(`DROP SEQUENCE IF EXISTS societe_config_id_seq`);
  await client.query(`
    ALTER TABLE societe_config ADD CONSTRAINT societe_config_singleton CHECK (id = 1)
  `);

  await client.query(`ALTER TABLE societe_config ALTER COLUMN tenant_id DROP DEFAULT`);
  await client.query(`ALTER TABLE societe_config ALTER COLUMN tenant_id DROP NOT NULL`);
  await client.query(`DROP INDEX IF EXISTS idx_societe_config_tenant_id`);
  await client.query(`ALTER TABLE societe_config DROP COLUMN IF EXISTS tenant_id`);
}
