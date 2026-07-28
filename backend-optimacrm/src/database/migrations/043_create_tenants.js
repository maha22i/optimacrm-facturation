export const name = '043_create_tenants';

export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      nom             VARCHAR(255) NOT NULL,
      slug            VARCHAR(100) UNIQUE,
      statut          VARCHAR(20)  NOT NULL DEFAULT 'actif',
      modules_actifs  JSONB        DEFAULT '{}',
      created_at      TIMESTAMPTZ  DEFAULT NOW(),
      updated_at      TIMESTAMPTZ  DEFAULT NOW(),
      CONSTRAINT tenants_statut_check CHECK (statut IN ('actif', 'suspendu', 'inactif'))
    );

    CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants (slug);
  `);

  await client.query(`
    INSERT INTO tenants (nom, slug, statut)
    VALUES ('Groupe Innov', 'groupe-innov', 'actif')
    ON CONFLICT (slug) DO NOTHING
  `);

  const { rows } = await client.query(
    `SELECT id FROM tenants WHERE slug = 'groupe-innov'`
  );
  console.log(`  ↳ Tenant "Groupe Innov" id = ${rows[0].id}`);
}

export async function down(client) {
  await client.query('DROP TABLE IF EXISTS tenants');
}
