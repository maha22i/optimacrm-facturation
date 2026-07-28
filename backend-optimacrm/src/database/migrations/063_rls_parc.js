export const name = '063_rls_parc';

// ---------------------------------------------------------------------------
// RLS — domaine parc machines & relevés.
// Même pattern validé par 057_rls_marques.js, appliqué à chaque table listée.
// ---------------------------------------------------------------------------

const TABLES = [
  'parc_machines',
  'releves_compteurs',
  'imports_releves',
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
