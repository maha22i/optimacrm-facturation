export const name = '071_multitenant_tenant_email_config';

// ---------------------------------------------------------------------------
// Multi-tenant — tenant_email_config (2/4 tables singleton).
//
// Rappel : malgré son nom, cette table n'a jamais eu de lien avec le
// multi-tenant SaaS — "tenant" y désigne la config IMAP du support
// technique (cf. commentaire de 041_add_ticket_email_source.js : "app
// mono-instance : pas de tenant_id dans le schéma"). Singleton renforcé par
// une contrainte explicite : `id INTEGER PRIMARY KEY DEFAULT 1
// CHECK (id = 1)`.
//
// Bug métier corrigé par ce chantier : emailPollingJob.js boucle déjà par
// tenant actif via runWithTenantContext(tenant.id, ...), mais
// fetchAndCreateTickets() lit toujours WHERE id = 1 → même config IMAP
// utilisée pour tous les tenants, ticket créé sous un tenant non
// déterministe, fuite de config IMAP entre tenants via
// GET/PUT /api/tickets/email-config. Corrigé côté code dans une PR séparée
// (voir emailIngestService.js / emailConfig.service.js) — cette migration
// pose uniquement les fondations SQL.
//
// Point technique : `id INTEGER PRIMARY KEY DEFAULT 1` n'a jamais été un
// vrai SERIAL (DEFAULT littéral, pas de séquence). Avec plusieurs tenants,
// un futur INSERT sans id explicite retenterait id = 1 → collision de PK.
// On convertit id en pseudo-SERIAL (séquence dédiée + nextval() comme
// DEFAULT), repartant juste après le plus grand id existant (1 aujourd'hui),
// pour préserver la ligne actuelle et permettre des insertions futures sans
// collision — mécanisme strictement équivalent à celui d'un SERIAL, et
// cohérent avec sepa_creancier.id SERIAL PRIMARY KEY (table 1/4 de ce
// chantier).
//
// Le singleton "une ligne pour toute l'app" devient "une ligne par tenant" :
// UNIQUE (tenant_id) remplace CHECK (id = 1).
//
// Pattern identique à 070_multitenant_sepa_creancier.js.
// ---------------------------------------------------------------------------

export async function up(client) {
  // 1. tenant_id, nullable dans un premier temps (backfill à suivre)
  await client.query(`
    ALTER TABLE tenant_email_config
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);

  // 2. Backfill de la ligne existante vers Groupe Innov
  await client.query(`
    UPDATE tenant_email_config
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);

  // 3. Index + NOT NULL, une fois la ligne backfillée
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_tenant_email_config_tenant_id ON tenant_email_config (tenant_id)
  `);
  await client.query(`ALTER TABLE tenant_email_config ALTER COLUMN tenant_id SET NOT NULL`);

  // 4. DEFAULT current_setting(...) — même forme que 056/070 (pas de `true`
  //    en 2ᵉ argument : une écriture hors contexte tenant doit échouer
  //    bruyamment plutôt que silencieusement).
  await client.query(`
    ALTER TABLE tenant_email_config
    ALTER COLUMN tenant_id
    SET DEFAULT current_setting('app.current_tenant_id')::uuid
  `);

  // 5. Retrait du singleton "id = 1" — remplacé plus bas par un singleton
  //    "par tenant" (UNIQUE (tenant_id)).
  await client.query(`
    ALTER TABLE tenant_email_config DROP CONSTRAINT IF EXISTS tenant_email_config_id_check
  `);

  // 6. id : DEFAULT littéral 1 → pseudo-SERIAL (séquence dédiée), pour
  //    permettre l'insertion d'une ligne par tenant sans collision de PK.
  //    La ligne existante (id = 1) n'est pas modifiée ; seul le DEFAULT
  //    change pour les futures insertions.
  await client.query(`CREATE SEQUENCE IF NOT EXISTS tenant_email_config_id_seq`);
  await client.query(`ALTER SEQUENCE tenant_email_config_id_seq OWNED BY tenant_email_config.id`);
  await client.query(`
    SELECT setval('tenant_email_config_id_seq', COALESCE((SELECT MAX(id) FROM tenant_email_config), 1))
  `);
  await client.query(`
    ALTER TABLE tenant_email_config
    ALTER COLUMN id
    SET DEFAULT nextval('tenant_email_config_id_seq')
  `);

  // 7. Singleton "par tenant" : une seule ligne de config IMAP par tenant.
  await client.query(`
    ALTER TABLE tenant_email_config
    ADD CONSTRAINT tenant_email_config_tenant_id_unique UNIQUE (tenant_id)
  `);

  // 8. RLS — policy NULLIF (forme corrigée par 068, pas l'ancienne forme
  //    buguée de 057-067). Même pattern que 070_multitenant_sepa_creancier.
  await client.query(`
    ALTER TABLE tenant_email_config ENABLE ROW LEVEL SECURITY;
    ALTER TABLE tenant_email_config FORCE ROW LEVEL SECURITY;
  `);

  await client.query(`DROP POLICY IF EXISTS tenant_isolation ON tenant_email_config;`);

  await client.query(`
    CREATE POLICY tenant_isolation ON tenant_email_config
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
  await client.query(`DROP POLICY IF EXISTS tenant_isolation ON tenant_email_config;`);
  await client.query(`ALTER TABLE tenant_email_config DISABLE ROW LEVEL SECURITY;`);

  await client.query(`
    ALTER TABLE tenant_email_config DROP CONSTRAINT IF EXISTS tenant_email_config_tenant_id_unique
  `);

  // Revert id : pseudo-SERIAL → DEFAULT littéral 1 (comme à l'origine).
  // Ne réussira proprement que s'il ne reste qu'une seule ligne (id = 1) —
  // même limite implicite que le reste des migrations down() de ce projet.
  await client.query(`ALTER TABLE tenant_email_config ALTER COLUMN id SET DEFAULT 1`);
  await client.query(`DROP SEQUENCE IF EXISTS tenant_email_config_id_seq`);
  await client.query(`
    ALTER TABLE tenant_email_config ADD CONSTRAINT tenant_email_config_id_check CHECK (id = 1)
  `);

  await client.query(`ALTER TABLE tenant_email_config ALTER COLUMN tenant_id DROP DEFAULT`);
  await client.query(`ALTER TABLE tenant_email_config ALTER COLUMN tenant_id DROP NOT NULL`);
  await client.query(`DROP INDEX IF EXISTS idx_tenant_email_config_tenant_id`);
  await client.query(`ALTER TABLE tenant_email_config DROP COLUMN IF EXISTS tenant_id`);
}
