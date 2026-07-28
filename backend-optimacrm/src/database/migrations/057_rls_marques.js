export const name = '057_rls_marques';

// ---------------------------------------------------------------------------
// Première policy RLS — table `marques` (référentiel simple, faible risque).
//
// Objectif : valider le mécanisme de bout en bout avant de généraliser à
// toutes les tables tenantées.
//
// Clause d'échappement (OR IS NULL / OR = '') :
//   current_setting('app.current_tenant_id', true) renvoie :
//     - la valeur posée par tenantMiddleware/runWithTenantContext (cas normal,
//       requête HTTP ou job authentifié) ;
//     - NULL si le GUC n'a jamais été positionné sur cette connexion
//       (le second argument `true` = missing_ok évite l'erreur) ;
//     - '' (chaîne vide) si le GUC a été positionné puis remis à vide par un
//       appel précédent sur la même connexion réutilisée par le pool
//       (set_config(..., '', true) plutôt qu'un vrai reset).
//   Ces deux cas (NULL et '') se produisent réellement selon l'historique de
//   la connexion prise dans le pool — sans cette double clause, une requête
//   qui arrive sans contexte tenant explicite (job cron non migré, connexion
//   fraîchement recyclée, script d'admin) échouerait au lieu de passer en
//   mode "non filtré" (comportement actuel, avant durcissement complet).
//
// FORCE ROW LEVEL SECURITY :
//   Sans ce flag, le propriétaire de la table (le rôle qui a fait le CREATE
//   TABLE / les migrations, ex. postgres) bypass systématiquement la policy.
//   Avec FORCE, seul un rôle superuser (ou BYPASSRLS) continue de tout voir ;
//   un propriétaire non-superuser serait lui aussi filtré. Utile ici pour que
//   les tests d'inspection sous `postgres` (superuser) restent bien la seule
//   voie de bypass volontaire, et non un effet de bord de la propriété de
//   la table.
//
// Idempotence : DROP POLICY IF EXISTS avant CREATE POLICY, pour permettre
// de rejouer cette migration sans erreur si elle a déjà tourné partiellement.
// ---------------------------------------------------------------------------

export async function up(client) {
  await client.query(`
    ALTER TABLE marques ENABLE ROW LEVEL SECURITY;
    ALTER TABLE marques FORCE ROW LEVEL SECURITY;
  `);

  await client.query(`
    DROP POLICY IF EXISTS tenant_isolation ON marques;
  `);

  await client.query(`
    CREATE POLICY tenant_isolation ON marques
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

export async function down(client) {
  await client.query(`
    DROP POLICY IF EXISTS tenant_isolation ON marques;
  `);
  await client.query(`
    ALTER TABLE marques DISABLE ROW LEVEL SECURITY;
  `);
}
