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
  const m39 = await import('./migrations/039_devis_signature_publique.js');
  migrations.push(m39);
  const m40 = await import('./migrations/040_create_planning_creneaux.js');
  migrations.push(m40);
  const m41 = await import('./migrations/041_add_ticket_email_source.js');
  migrations.push(m41);
  const m42 = await import('./migrations/042_add_terme_facturation.js');
  migrations.push(m42);
  const m43 = await import('./migrations/043_create_tenants.js');
  migrations.push(m43);
  const m44 = await import('./migrations/044_add_super_admin_role.js');
  migrations.push(m44);
  const m45 = await import('./migrations/045_add_tenant_id_to_users.js');
  migrations.push(m45);
  const m46 = await import('./migrations/046_add_tenant_id_transverse.js');
  migrations.push(m46);
  const m47 = await import('./migrations/047_add_tenant_id_referentiels_catalogue.js');
  migrations.push(m47);
  const m48 = await import('./migrations/048_add_tenant_id_clients.js');
  migrations.push(m48);
  const m49 = await import('./migrations/049_add_tenant_id_devis.js');
  migrations.push(m49);
  const m50 = await import('./migrations/050_add_tenant_id_contrats.js');
  migrations.push(m50);
  const m51 = await import('./migrations/051_add_tenant_id_parc_releves.js');
  migrations.push(m51);
  const m52 = await import('./migrations/052_add_tenant_id_factures_avoirs.js');
  migrations.push(m52);
  const m53 = await import('./migrations/053_add_tenant_id_sepa.js');
  migrations.push(m53);
  const m54 = await import('./migrations/054_add_tenant_id_tickets.js');
  migrations.push(m54);
  const m55 = await import('./migrations/055_users_tenant_id_check.js');
  migrations.push(m55);
  const m56 = await import('./migrations/056_add_tenant_id_defaults.js');
  migrations.push(m56);
  const m57 = await import('./migrations/057_rls_marques.js');
  migrations.push(m57);
  const m58 = await import('./migrations/058_rls_referentiels.js');
  migrations.push(m58);
  const m59 = await import('./migrations/059_rls_catalogue.js');
  migrations.push(m59);
  const m60 = await import('./migrations/060_rls_clients.js');
  migrations.push(m60);
  const m61 = await import('./migrations/061_rls_devis.js');
  migrations.push(m61);
  const m62 = await import('./migrations/062_rls_contrats.js');
  migrations.push(m62);
  const m63 = await import('./migrations/063_rls_parc.js');
  migrations.push(m63);
  const m64 = await import('./migrations/064_rls_factures.js');
  migrations.push(m64);
  const m65 = await import('./migrations/065_rls_sepa.js');
  migrations.push(m65);
  const m66 = await import('./migrations/066_rls_tickets.js');
  migrations.push(m66);
  const m67 = await import('./migrations/067_rls_transverse.js');
  migrations.push(m67);
  const m68 = await import('./migrations/068_fix_rls_policies_nullif.js');
  migrations.push(m68);
  const m69 = await import('./migrations/069_rls_users.js');
  migrations.push(m69);
  const m70 = await import('./migrations/070_multitenant_sepa_creancier.js');
  migrations.push(m70);
  const m71 = await import('./migrations/071_multitenant_tenant_email_config.js');
  migrations.push(m71);
  const m72 = await import('./migrations/072_multitenant_email_config.js');
  migrations.push(m72);
  const m73 = await import('./migrations/073_multitenant_societe_config.js');
  migrations.push(m73);
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

// Permet de lancer les migrations manuellement via `npm run migrate`
// (node src/database/migrate.js), sans effet lorsque ce fichier est
// simplement importé par server.js.
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log('✓ All migrations applied');
      return pool.end();
    })
    .then(() => {
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('✗ Migration run failed:', error.message);
      await pool.end();
      process.exit(1);
    });
}
