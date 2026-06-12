import { pool } from '../config/database.js';

const migrations = [];

async function loadMigrations() {
  const m1 = await import('./migrations/001_create_users.js');
  migrations.push(m1);
  const m2 = await import('./migrations/002_create_clients.js');
  migrations.push(m2);
  const m3 = await import('./migrations/003_create_devis.js');
  migrations.push(m3);
  const m4 = await import('./migrations/004_create_societe_config.js');
  migrations.push(m4);
  const m5 = await import('./migrations/005_create_marques_fournisseurs_familles.js');
  migrations.push(m5);
  const m6 = await import('./migrations/006_alter_catalogue_produits_fk.js');
  migrations.push(m6);
  const m7 = await import('./migrations/007_alter_catalogue_produits_extended.js');
  migrations.push(m7);
  const m8 = await import('./migrations/008_create_produit_details_tarifs.js');
  migrations.push(m8);
  const m9 = await import('./migrations/009_add_client_custom_fields.js');
  migrations.push(m9);
  const m10 = await import('./migrations/010_create_champs_personnalises_unified.js');
  migrations.push(m10);
  const m11 = await import('./migrations/011_create_contrats.js');
  migrations.push(m11);
  const m12 = await import('./migrations/012_create_import_tables.js');
  migrations.push(m12);
  const m13 = await import('./migrations/013_create_user_permissions.js');
  migrations.push(m13);
  const m14 = await import('./migrations/014_create_parc_machines.js');
  migrations.push(m14);
  const m15 = await import('./migrations/015_add_contrat_entite_champs.js');
  migrations.push(m15);
  const m16 = await import('./migrations/016_add_parc_couts_copie.js');
  migrations.push(m16);
  const m17 = await import('./migrations/017_create_factures.js');
  migrations.push(m17);
  const m18 = await import('./migrations/018_alter_releves_compteurs_import.js');
  migrations.push(m18);
  const m19 = await import('./migrations/019_create_activity_logs.js');
  migrations.push(m19);
  const m23 = await import('./migrations/023_fix_contrats_facturation.js');
  migrations.push(m23);
  const m24 = await import('./migrations/024_cleanup_reglements.js');
  migrations.push(m24);
  const m25 = await import('./migrations/025_create_email_config.js');
  migrations.push(m25);
  const m26 = await import('./migrations/026_alter_devis_import_columns.js');
  migrations.push(m26);
  const m27 = await import('./migrations/027_add_email_template_devis.js');
  migrations.push(m27);
  const m28 = await import('./migrations/028_add_client_numero_rcs.js');
  migrations.push(m28);
  const m29 = await import('./migrations/029_fix_couts_copie_precision.js');
  migrations.push(m29);
  const m30 = await import('./migrations/030_create_imports_releves.js');
  migrations.push(m30);
  const m31 = await import('./migrations/031_create_sepa_tables.js');
  migrations.push(m31);
  const m32 = await import('./migrations/032_create_avoirs.js');
  migrations.push(m32);
  const m33 = await import('./migrations/033_alter_bic_length.js');
  migrations.push(m33);
  const m34 = await import('./migrations/034_reset_telephonie_prochaine_facturation.js');
  migrations.push(m34);
  const m35 = await import('./migrations/035_add_informatique_support.js');
  migrations.push(m35);
  const m36 = await import('./migrations/036_create_ticket_tables.js');
  migrations.push(m36);
  const m37 = await import('./migrations/037_add_technical_roles.js');
  migrations.push(m37);
  const m38 = await import('./migrations/038_remove_categorie_check_add_mapping_type.js');
  migrations.push(m38);
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function runMigrations() {
  await loadMigrations();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);

    const { rows: executed } = await client.query('SELECT name FROM _migrations');
    const executedNames = new Set(executed.map((r) => r.name));

    for (const migration of migrations) {
      if (executedNames.has(migration.name)) continue;

      await client.query('BEGIN');
      try {
        await migration.up(client);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
        await client.query('COMMIT');
        console.log(`  ↳ Migration "${migration.name}" applied`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration "${migration.name}" failed: ${error.message}`);
      }
    }
  } finally {
    client.release();
  }
}
