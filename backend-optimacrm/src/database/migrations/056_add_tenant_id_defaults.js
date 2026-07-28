export const name = '056_add_tenant_id_defaults';

// Liste exhaustive des 43 tables métier ayant tenant_id NOT NULL
// (migrations 046 → 054). Exclut `users` (nullable + CHECK conditionnel)
// et `tenants` (table racine sans tenant_id sur elle-même).
const TABLES = [
  // 046 — transverse
  'activity_logs',
  'import_logs',
  'import_mappings_saved',
  'user_permissions',
  'email_logs',
  // 047 — référentiels & catalogue
  'marques',
  'fournisseurs',
  'familles_produits',
  'unites',
  'catalogue_produits',
  'produit_tarifs_clients',
  'champs_personnalises_config',
  'champs_personnalises_valeurs',
  'champs_personnalises_templates',
  // 048 — clients
  'clients',
  'client_adresses',
  'client_contacts',
  'client_documents',
  // 049 — devis
  'devis',
  'devis_lignes',
  'devis_champs_personnalises',
  'devis_historique',
  'bons_commande',
  // 050 — contrats
  'contrats',
  'contrat_lignes',
  'contrat_machines',
  // 051 — parc & relevés
  'imports_releves',
  'parc_machines',
  'releves_compteurs',
  // 052 — factures & avoirs
  'factures',
  'facture_lignes',
  'facture_reglements',
  'facture_historique',
  'avoirs',
  'avoir_lignes',
  // 053 — SEPA
  'sepa_remises',
  'sepa_remise_lignes',
  // 054 — tickets & planning
  'ticket_categories',
  'ticket_sla_rules',
  'tickets',
  'ticket_commentaires',
  'ticket_historique_statuts',
  'planning_creneaux',
];

export async function up(client) {
  for (const table of TABLES) {
    await client.query(`
      ALTER TABLE ${table}
      ALTER COLUMN tenant_id
      SET DEFAULT current_setting('app.current_tenant_id')::uuid
    `);
  }
}

export async function down(client) {
  for (const table of TABLES) {
    await client.query(`
      ALTER TABLE ${table}
      ALTER COLUMN tenant_id
      DROP DEFAULT
    `);
  }
}
