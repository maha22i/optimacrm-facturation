export const name = '029_fix_couts_copie_precision';

export async function up(client) {
  // contrat_machines — coûts copie et services
  await client.query(`
    ALTER TABLE contrat_machines
      ALTER COLUMN cout_copie_nb      TYPE NUMERIC(20, 10),
      ALTER COLUMN cout_copie_couleur TYPE NUMERIC(20, 10),
      ALTER COLUMN cout_copie_t1      TYPE NUMERIC(20, 10),
      ALTER COLUMN cout_copie_t2      TYPE NUMERIC(20, 10),
      ALTER COLUMN cout_copie_t3      TYPE NUMERIC(20, 10),
      ALTER COLUMN service_connectic  TYPE NUMERIC(20, 10),
      ALTER COLUMN service_collecteur TYPE NUMERIC(20, 10),
      ALTER COLUMN service_divers     TYPE NUMERIC(20, 10),
      ALTER COLUMN service_autre      TYPE NUMERIC(20, 10)
  `);

  // contrat_lignes — prix unitaire HT
  await client.query(`
    ALTER TABLE contrat_lignes
      ALTER COLUMN prix_unitaire_ht TYPE NUMERIC(20, 10)
  `);

  // facture_lignes — prix unitaire et total HT
  await client.query(`
    ALTER TABLE facture_lignes
      ALTER COLUMN prix_unitaire TYPE NUMERIC(20, 10),
      ALTER COLUMN total_ht      TYPE NUMERIC(20, 10)
  `);

  // devis_lignes — prix unitaire HT
  await client.query(`
    ALTER TABLE devis_lignes
      ALTER COLUMN prix_unitaire_ht TYPE NUMERIC(20, 10)
  `);

  // catalogue_produits — prix unitaire HT
  await client.query(`
    ALTER TABLE catalogue_produits
      ALTER COLUMN prix_unitaire_ht TYPE NUMERIC(20, 10)
  `);

  // parc_machines — coûts copie (ajoutés par migration 016)
  const { rows } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'parc_machines' AND column_name IN ('cout_copie_nb', 'cout_copie_couleur')
  `);
  if (rows.length > 0) {
    const alterCols = rows.map(r => `ALTER COLUMN ${r.column_name} TYPE NUMERIC(20, 10)`).join(', ');
    await client.query(`ALTER TABLE parc_machines ${alterCols}`);
  }
}
