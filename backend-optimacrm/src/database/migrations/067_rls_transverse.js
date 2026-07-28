export const name = '067_rls_transverse';

// ---------------------------------------------------------------------------
// RLS — domaine transverse (logs, imports, permissions, email).
// Même pattern validé par 057_rls_marques.js, appliqué à chaque table listée.
//
// Note : user_permissions est ici traitée comme les autres tables transverses
// (elle a tenant_id NOT NULL depuis la migration 046), mais reste distincte
// de la table `users` elle-même, volontairement exclue de cette série.
// ---------------------------------------------------------------------------

const TABLES = [
  'activity_logs',
  'import_logs',
  'import_mappings_saved',
  'user_permissions',
  'email_logs',
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
