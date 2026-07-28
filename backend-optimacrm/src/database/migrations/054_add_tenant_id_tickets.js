export const name = '054_add_tenant_id_tickets';

export async function up(client) {
  // --- ticket_categories — backfill trivial direct vers Groupe Innov
  //     (référentiel par tenant, aucun lien vers un client ; technicien_defaut_id
  //      nullable et non pertinent comme source) ---
  await client.query(`
    ALTER TABLE ticket_categories
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE ticket_categories
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ticket_categories_tenant_id ON ticket_categories (tenant_id)
  `);

  // --- ticket_sla_rules — backfill trivial direct vers Groupe Innov (référentiel par tenant) ---
  await client.query(`
    ALTER TABLE ticket_sla_rules
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE ticket_sla_rules
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ticket_sla_rules_tenant_id ON ticket_sla_rules (tenant_id)
  `);

  // --- tickets — backfill trivial direct vers Groupe Innov
  //     (client_id, categorie_id, machine_id, technicien_id, cree_par_id sont TOUS
  //      nullables — la migration 041 a explicitement fait DROP NOT NULL sur client_id
  //      car un ticket créé depuis un email peut ne pas être rapproché d'un client.
  //      Aucune source de dérivation fiable : un ticket appartient à l'organisation
  //      qui le traite, même sans client identifié) ---
  await client.query(`
    ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE tickets
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_tickets_tenant_id ON tickets (tenant_id)
  `);

  // --- ticket_commentaires — backfill dérivé du ticket parent (ticket_id NOT NULL, FK réelle CASCADE) ---
  await client.query(`
    ALTER TABLE ticket_commentaires
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE ticket_commentaires tc
    SET tenant_id = t.tenant_id
    FROM tickets t
    WHERE tc.ticket_id = t.id AND tc.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ticket_commentaires_tenant_id ON ticket_commentaires (tenant_id)
  `);

  // --- ticket_historique_statuts — backfill dérivé du ticket parent ---
  await client.query(`
    ALTER TABLE ticket_historique_statuts
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE ticket_historique_statuts ths
    SET tenant_id = t.tenant_id
    FROM tickets t
    WHERE ths.ticket_id = t.id AND ths.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_ticket_historique_statuts_tenant_id ON ticket_historique_statuts (tenant_id)
  `);

  // --- planning_creneaux — backfill dérivé du ticket parent (ticket_id NOT NULL, FK réelle CASCADE) ---
  await client.query(`
    ALTER TABLE planning_creneaux
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE planning_creneaux pc
    SET tenant_id = t.tenant_id
    FROM tickets t
    WHERE pc.ticket_id = t.id AND pc.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_planning_creneaux_tenant_id ON planning_creneaux (tenant_id)
  `);

  // --- Passage en NOT NULL, une fois les 6 tables backfillées ---
  await client.query(`ALTER TABLE ticket_categories ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE ticket_sla_rules ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE tickets ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE ticket_commentaires ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE ticket_historique_statuts ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE planning_creneaux ALTER COLUMN tenant_id SET NOT NULL`);
}

export async function down(client) {
  await client.query(`DROP INDEX IF EXISTS idx_planning_creneaux_tenant_id`);
  await client.query(`ALTER TABLE planning_creneaux DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_ticket_historique_statuts_tenant_id`);
  await client.query(`ALTER TABLE ticket_historique_statuts DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_ticket_commentaires_tenant_id`);
  await client.query(`ALTER TABLE ticket_commentaires DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_tickets_tenant_id`);
  await client.query(`ALTER TABLE tickets DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_ticket_sla_rules_tenant_id`);
  await client.query(`ALTER TABLE ticket_sla_rules DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_ticket_categories_tenant_id`);
  await client.query(`ALTER TABLE ticket_categories DROP COLUMN IF EXISTS tenant_id`);
}
