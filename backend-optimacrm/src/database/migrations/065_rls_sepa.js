export const name = '065_rls_sepa';

// ---------------------------------------------------------------------------
// RLS — domaine SEPA.
// Même pattern validé par 057_rls_marques.js, appliqué à chaque table listée.
// ---------------------------------------------------------------------------

const TABLES = [
  'sepa_remises',
  'sepa_remise_lignes',
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
