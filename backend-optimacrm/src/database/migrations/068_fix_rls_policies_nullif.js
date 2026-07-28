export const name = '068_fix_rls_policies_nullif';

// ---------------------------------------------------------------------------
// Correctif bloquant — cast ''::uuid dans les policies tenant_isolation.
//
// Bug observé : authenticate.js (et d'autres call sites, voir revue associée)
// interrogent user_permissions AVANT que tenantMiddleware n'ait posé
// app.current_tenant_id. Sur une connexion du pool déjà utilisée par une
// transaction précédente qui a fait SET LOCAL app.current_tenant_id = '<uuid>'
// puis COMMIT, PostgreSQL restaure le paramètre à '' (chaîne vide) et NON à
// NULL une fois la transaction terminée — comportement vérifié empiriquement :
//
//   BEGIN; SET LOCAL app.current_tenant_id = '<uuid>'; COMMIT;
//   SELECT current_setting('app.current_tenant_id', true);  -- renvoie '' (pas NULL)
//
// La policy d'origine (057-067) écrit :
//   USING (
//     tenant_id = current_setting('app.current_tenant_id', true)::uuid
//     OR current_setting('app.current_tenant_id', true) IS NULL
//     OR current_setting('app.current_tenant_id', true) = ''
//   )
// Le planner PostgreSQL n'est pas tenu d'évaluer les branches d'un OR dans
// l'ordre d'écriture : rien ne garantit que les deux clauses d'échappement
// soient évaluées avant le cast ''::uuid, qui échoue avec
// "invalid input syntax for type uuid: """ — plantage confirmé en pratique
// sur /api/auth/login et sur toute requête authentifiée (authenticate.js).
//
// Correctif : NULLIF(current_setting(...), '') transforme la chaîne vide en
// NULL *avant* le cast. NULL::uuid est toujours valide (renvoie NULL, jamais
// d'erreur), donc le cast ne peut plus jamais planter, quel que soit l'ordre
// d'évaluation choisi par le planner.
//
//   USING (
//     tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
//     OR NULLIF(current_setting('app.current_tenant_id', true), '') IS NULL
//   )
//
// Portée : les 43 tables déjà passées en RLS (migrations 057 à 067).
// `users` n'est pas concernée (jamais mise en RLS). `tenants` non plus.
// ENABLE / FORCE ROW LEVEL SECURITY ne sont pas touchés, déjà en place.
// ---------------------------------------------------------------------------

const TABLES = [
  // 057
  'marques',
  // 058 — référentiels & champs personnalisés
  'fournisseurs',
  'familles_produits',
  'unites',
  'champs_personnalises_templates',
  'champs_personnalises_config',
  'champs_personnalises_valeurs',
  // 059 — catalogue
  'catalogue_produits',
  'produit_tarifs_clients',
  // 060 — clients
  'clients',
  'client_adresses',
  'client_contacts',
  'client_documents',
  // 061 — devis
  'devis',
  'devis_lignes',
  'devis_champs_personnalises',
  'devis_historique',
  'bons_commande',
  // 062 — contrats
  'contrats',
  'contrat_lignes',
  'contrat_machines',
  // 063 — parc & relevés
  'parc_machines',
  'releves_compteurs',
  'imports_releves',
  // 064 — factures & avoirs
  'factures',
  'facture_lignes',
  'facture_reglements',
  'facture_historique',
  'avoirs',
  'avoir_lignes',
  // 065 — SEPA
  'sepa_remises',
  'sepa_remise_lignes',
  // 066 — tickets & planning
  'ticket_categories',
  'ticket_sla_rules',
  'tickets',
  'ticket_commentaires',
  'ticket_historique_statuts',
  'planning_creneaux',
  // 067 — transverse
  'activity_logs',
  'import_logs',
  'import_mappings_saved',
  'user_permissions',
  'email_logs',
];

export async function up(client) {
  for (const table of TABLES) {
    await client.query(`DROP POLICY IF EXISTS tenant_isolation ON ${table};`);

    await client.query(`
      CREATE POLICY tenant_isolation ON ${table}
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
}

export async function down(client) {
  // Rétablit la forme précédente (bug compris) plutôt que de laisser les
  // tables sans policy : avec FORCE ROW LEVEL SECURITY déjà actif, une table
  // sans aucune policy refuse tout accès non-superuser — pire que le bug.
  for (const table of TABLES) {
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
