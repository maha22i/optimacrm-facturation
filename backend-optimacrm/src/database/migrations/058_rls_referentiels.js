export const name = '058_rls_referentiels';

// ---------------------------------------------------------------------------
// RLS — domaine référentiels & configuration champs personnalisés.
// Même pattern validé par 057_rls_marques.js, appliqué à chaque table listée.
// Voir 057_rls_marques.js pour le détail des choix (escape clause IS NULL /
// = '', FORCE ROW LEVEL SECURITY, idempotence).
// ---------------------------------------------------------------------------

const TABLES = [
  'fournisseurs',
  'familles_produits',
  'unites',
  'champs_personnalises_templates',
  'champs_personnalises_config',
  'champs_personnalises_valeurs',
];

export async function up(client) {
  for (const table of TABLES) {
    await client.query(`
      ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
      ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
    `);

    await client.query(`DROP POLICY IF EXISTS tenant_isolation ON ${table};`);

    await client.query(`
      CREATE POLICY tenant_isolation ON ${table}
        USING (
          tenant_id = current_setting('app.current_tenant_id', true)::uuid
          OR current_setting('app.current_tenant_id', true) IS NULL
          OR current_setting('app.current_tenant_id', true) = ''
        )
        WITH CHECK (
          tenant_id = current_setting('app.current_tenant_id', true)::uuid
          OR current_setting('app.current_tenant_id', true) IS NULL
          OR current_setting('app.current_tenant_id', true) = ''
        );
    `);
  }
}

export async function down(client) {
  for (const table of TABLES) {
    await client.query(`DROP POLICY IF EXISTS tenant_isolation ON ${table};`);
    await client.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`);
  }
}
