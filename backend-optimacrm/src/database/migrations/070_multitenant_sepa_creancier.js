export const name = '070_multitenant_sepa_creancier';

// ---------------------------------------------------------------------------
// Multi-tenant — sepa_creancier (1ʳᵉ des 4 tables singleton, la plus simple).
//
// Contexte : contrairement à societe_config et tenant_email_config,
// sepa_creancier n'a jamais eu de contrainte CHECK (id = 1) — le singleton
// est purement une convention applicative. Le code (src/modules/sepa/
// sepa.service.js) ne code JAMAIS `WHERE id = 1` :
//   getCreancier()    → SELECT * FROM sepa_creancier ORDER BY id LIMIT 1
//   upsertCreancier() → SELECT id FROM sepa_creancier LIMIT 1 (existence)
//                        puis UPDATE ... WHERE id = <id trouvé>
//                        ou INSERT INTO sepa_creancier (nom, ics, iban, bic)
//                        (tenant_id absent de la liste de colonnes → défaut)
// Conséquence : une fois tenant_id + RLS posés ci-dessous, ces requêtes
// deviennent tenant-scopées SANS AUCUNE MODIFICATION DE CODE — le filtrage
// vient entièrement de la policy RLS (LIMIT 1 ne voit plus que la ligne du
// tenant courant) et du DEFAULT sur tenant_id (l'INSERT sans tenant_id
// explicite récupère automatiquement le tenant courant).
//
// Le singleton "une ligne pour toute l'app" devient "une ligne par tenant" :
// UNIQUE (tenant_id) remplace la notion de PRIMARY KEY = 1 / CHECK (id = 1).
//
// Pattern identique à celui validé par 053 (add + backfill), 056 (default),
// 057/065 (RLS) et 068 (policy NULLIF — pas l'ancienne forme buguée),
// regroupé ici en une seule migration car la table est petite et isolée
// (aucune FK entrante depuis une autre table).
// ---------------------------------------------------------------------------

export async function up(client) {
  // 1. tenant_id, nullable dans un premier temps (backfill à suivre)
  await client.query(`
    ALTER TABLE sepa_creancier
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);

  // 2. Backfill de la ligne existante vers Groupe Innov
  await client.query(`
    UPDATE sepa_creancier
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);

  // 3. Index + NOT NULL, une fois la ligne backfillée
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sepa_creancier_tenant_id ON sepa_creancier (tenant_id)
  `);
  await client.query(`ALTER TABLE sepa_creancier ALTER COLUMN tenant_id SET NOT NULL`);

  // 4. DEFAULT current_setting(...) — même forme que 056_add_tenant_id_defaults
  //    (pas de `true` en 2ᵉ argument : une INSERT hors contexte tenant doit
  //    échouer bruyamment plutôt que silencieusement, comme pour les 43
  //    autres tables déjà migrées).
  await client.query(`
    ALTER TABLE sepa_creancier
    ALTER COLUMN tenant_id
    SET DEFAULT current_setting('app.current_tenant_id')::uuid
  `);

  // 5. Singleton "par tenant" : une seule ligne créancier par tenant.
  await client.query(`
    ALTER TABLE sepa_creancier
    ADD CONSTRAINT sepa_creancier_tenant_id_unique UNIQUE (tenant_id)
  `);

  // 6. RLS — policy NULLIF (forme corrigée par 068, pas l'ancienne forme
  //    buguée de 057-067).
  await client.query(`
    ALTER TABLE sepa_creancier ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sepa_creancier FORCE ROW LEVEL SECURITY;
  `);

  await client.query(`DROP POLICY IF EXISTS tenant_isolation ON sepa_creancier;`);

  await client.query(`
    CREATE POLICY tenant_isolation ON sepa_creancier
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
  await client.query(`DROP POLICY IF EXISTS tenant_isolation ON sepa_creancier;`);
  await client.query(`ALTER TABLE sepa_creancier DISABLE ROW LEVEL SECURITY;`);

  await client.query(`ALTER TABLE sepa_creancier DROP CONSTRAINT IF EXISTS sepa_creancier_tenant_id_unique;`);
  await client.query(`ALTER TABLE sepa_creancier ALTER COLUMN tenant_id DROP DEFAULT;`);
  await client.query(`ALTER TABLE sepa_creancier ALTER COLUMN tenant_id DROP NOT NULL;`);
  await client.query(`DROP INDEX IF EXISTS idx_sepa_creancier_tenant_id;`);
  await client.query(`ALTER TABLE sepa_creancier DROP COLUMN IF EXISTS tenant_id;`);
}
