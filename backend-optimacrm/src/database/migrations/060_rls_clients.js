export const name = '060_rls_clients';

// ---------------------------------------------------------------------------
// RLS — domaine clients.
// Même pattern validé par 057_rls_marques.js, appliqué à chaque table listée.
// ---------------------------------------------------------------------------

const TABLES = [
  'clients',
  'client_adresses',
  'client_contacts',
  'client_documents',
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
