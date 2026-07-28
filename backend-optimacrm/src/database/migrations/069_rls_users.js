export const name = '069_rls_users';

// ---------------------------------------------------------------------------
// RLS — table `users`, dernière table du chantier, traitée séparément et en
// dernier car la plus sensible (authenticate.js en dépend à chaque requête).
//
// Forme NULLIF directement (celle validée par 068, pas l'ancienne forme
// buguée de 057-067) : le cast ''::uuid ne doit jamais pouvoir planter,
// y compris sur une connexion du pool réutilisée hors de tout contexte
// tenant (authenticate.js tourne justement dans ce cas, avant tenantMiddleware).
//
// super_admin (tenant_id NULL) : sa ligne n'est visible/écrivable que via
// l'escape clause (aucun contexte posé) — cohérent avec le fait qu'un
// super_admin n'a jamais de contexte tenant positionné (tenantMiddleware
// bypass explicitement les utilisateurs sans tenant_id). Un admin "normal"
// avec un contexte actif ne verra donc jamais la ligne super_admin dans ses
// listes — comportement voulu.
// ---------------------------------------------------------------------------

export async function up(client) {
  await client.query(`
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE users FORCE ROW LEVEL SECURITY;
  `);

  await client.query(`DROP POLICY IF EXISTS tenant_isolation ON users;`);

  await client.query(`
    CREATE POLICY tenant_isolation ON users
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
  await client.query(`DROP POLICY IF EXISTS tenant_isolation ON users;`);
  await client.query(`ALTER TABLE users DISABLE ROW LEVEL SECURITY;`);
}
