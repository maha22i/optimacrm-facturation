export const name = '053_add_tenant_id_sepa';

export async function up(client) {
  // --- sepa_remises — backfill trivial direct vers Groupe Innov
  //     (aucune colonne de rattachement métier : uniquement user_id → users, nullable.
  //      Sémantiquement correct : une remise SEPA regroupe des prélèvements de plusieurs
  //      factures/clients, elle appartient à l'organisation émettrice, pas à un client) ---
  await client.query(`
    ALTER TABLE sepa_remises
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE sepa_remises
    SET tenant_id = (SELECT id FROM tenants WHERE slug = 'groupe-innov')
    WHERE tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sepa_remises_tenant_id ON sepa_remises (tenant_id)
  `);

  // --- sepa_remise_lignes — backfill dérivé de la remise parente via remise_id
  //     (FK réelle ON DELETE CASCADE ; remise_id et facture_id sont tous deux nullables
  //      au niveau schéma, mais remise_id est la relation la plus courte et la plus
  //      fondamentale — une ligne de remise appartient d'abord à sa remise) ---
  await client.query(`
    ALTER TABLE sepa_remise_lignes
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id)
  `);
  await client.query(`
    UPDATE sepa_remise_lignes srl
    SET tenant_id = sr.tenant_id
    FROM sepa_remises sr
    WHERE srl.remise_id = sr.id AND srl.tenant_id IS NULL
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sepa_remise_lignes_tenant_id ON sepa_remise_lignes (tenant_id)
  `);

  // --- Passage en NOT NULL, une fois les 2 tables backfillées ---
  await client.query(`ALTER TABLE sepa_remises ALTER COLUMN tenant_id SET NOT NULL`);
  await client.query(`ALTER TABLE sepa_remise_lignes ALTER COLUMN tenant_id SET NOT NULL`);
}

export async function down(client) {
  await client.query(`DROP INDEX IF EXISTS idx_sepa_remise_lignes_tenant_id`);
  await client.query(`ALTER TABLE sepa_remise_lignes DROP COLUMN IF EXISTS tenant_id`);

  await client.query(`DROP INDEX IF EXISTS idx_sepa_remises_tenant_id`);
  await client.query(`ALTER TABLE sepa_remises DROP COLUMN IF EXISTS tenant_id`);
}
