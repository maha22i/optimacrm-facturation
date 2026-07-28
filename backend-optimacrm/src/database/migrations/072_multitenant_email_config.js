export const name = '072_multitenant_email_config';

// ---------------------------------------------------------------------------
// Multi-tenant — email_config (3/4 tables singleton).
//
// Singleton implicite : pas de CHECK explicite, `id SERIAL PRIMARY KEY`,
// convention `WHERE id = 1` respectée par toutes les requêtes du code
// (email.service.js). Contient les identifiants SMTP (host, user, password
// en clair) — fuite confirmée en test entre tenants (un admin du tenant
// test voyait la config SMTP complète de Groupe Innov, y compris le mot de
// passe). Priorité haute : fuite de secret, pas seulement de données
// métier.
//
// Point PK : contrairement à tenant_email_config (071), `id` est un vrai
// SERIAL depuis la création (025_create_email_config.js) — séquence réelle,
// nextval() déjà en DEFAULT. Aucune conversion pseudo-SERIAL nécessaire ;
// on passe directement à UNIQUE (tenant_id).
//
// Pattern identique à 070_multitenant_sepa_creancier.js.
// ---------------------------------------------------------------------------

export async function up(client) {
  // 1. tenant_id, nullable dans un premier temps (backfill à suivre)
  await client.query(`
    ALTER TABLE email_config
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);

  // 2. Backfill de la ligne existante vers Groupe Innov
  await client.query(`
    UPDATE email_config
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);

  // 3. Index + NOT NULL, une fois la ligne backfillée
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_email_config_tenant_id ON email_config (tenant_id)
  `);
  await client.query(`ALTER TABLE email_config ALTER COLUMN tenant_id SET NOT NULL`);

  // 4. DEFAULT current_setting(...) — sans `true` en 2ᵉ argument : une
  //    écriture hors contexte tenant doit échouer bruyamment plutôt que
  //    silencieusement (même forme que 056/070/071).
  await client.query(`
    ALTER TABLE email_config
    ALTER COLUMN tenant_id
    SET DEFAULT current_setting('app.current_tenant_id')::uuid
  `);

  // 5. Singleton "par tenant" : une seule ligne de config SMTP par tenant.
  await client.query(`
    ALTER TABLE email_config
    ADD CONSTRAINT email_config_tenant_id_unique UNIQUE (tenant_id)
  `);

  // 6. RLS — policy NULLIF (forme corrigée par 068). Même pattern que
  //    070/071.
  await client.query(`
    ALTER TABLE email_config ENABLE ROW LEVEL SECURITY;
    ALTER TABLE email_config FORCE ROW LEVEL SECURITY;
  `);

  await client.query(`DROP POLICY IF EXISTS tenant_isolation ON email_config;`);

  await client.query(`
    CREATE POLICY tenant_isolation ON email_config
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
  await client.query(`DROP POLICY IF EXISTS tenant_isolation ON email_config;`);
  await client.query(`ALTER TABLE email_config DISABLE ROW LEVEL SECURITY;`);

  await client.query(`
    ALTER TABLE email_config DROP CONSTRAINT IF EXISTS email_config_tenant_id_unique
  `);

  await client.query(`ALTER TABLE email_config ALTER COLUMN tenant_id DROP DEFAULT`);
  await client.query(`ALTER TABLE email_config ALTER COLUMN tenant_id DROP NOT NULL`);
  await client.query(`DROP INDEX IF EXISTS idx_email_config_tenant_id`);
  await client.query(`ALTER TABLE email_config DROP COLUMN IF EXISTS tenant_id`);
}
