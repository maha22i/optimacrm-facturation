export const name = '018_alter_releves_compteurs_import';

export async function up(client) {
  const { rows } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'releves_compteurs'
  `);
  const cols = new Set(rows.map(r => r.column_name));

  if (!cols.has('ancien_compteur_nb')) {
    await client.query('ALTER TABLE releves_compteurs ADD COLUMN ancien_compteur_nb INTEGER DEFAULT 0');
  }
  if (!cols.has('ancien_compteur_couleur')) {
    await client.query('ALTER TABLE releves_compteurs ADD COLUMN ancien_compteur_couleur INTEGER DEFAULT 0');
  }
  if (!cols.has('depassement_nb')) {
    await client.query('ALTER TABLE releves_compteurs ADD COLUMN depassement_nb INTEGER DEFAULT 0');
  }
  if (!cols.has('depassement_couleur')) {
    await client.query('ALTER TABLE releves_compteurs ADD COLUMN depassement_couleur INTEGER DEFAULT 0');
  }
  if (!cols.has('montant_depassement_nb')) {
    await client.query('ALTER TABLE releves_compteurs ADD COLUMN montant_depassement_nb DECIMAL(10,2) DEFAULT 0');
  }
  if (!cols.has('montant_depassement_couleur')) {
    await client.query('ALTER TABLE releves_compteurs ADD COLUMN montant_depassement_couleur DECIMAL(10,2) DEFAULT 0');
  }
  if (!cols.has('forfait_nb')) {
    await client.query('ALTER TABLE releves_compteurs ADD COLUMN forfait_nb INTEGER DEFAULT 0');
  }
  if (!cols.has('forfait_couleur')) {
    await client.query('ALTER TABLE releves_compteurs ADD COLUMN forfait_couleur INTEGER DEFAULT 0');
  }
  if (!cols.has('statut')) {
    await client.query("ALTER TABLE releves_compteurs ADD COLUMN statut VARCHAR(30) DEFAULT 'OK'");
  }
  if (!cols.has('source_import')) {
    await client.query('ALTER TABLE releves_compteurs ADD COLUMN source_import VARCHAR(50)');
  }
  if (!cols.has('import_id')) {
    await client.query('ALTER TABLE releves_compteurs ADD COLUMN import_id INTEGER');
  }

  // Ensure parc_machines has dernier_compteur columns (should exist from 014 but just in case)
  const { rows: parcCols } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'parc_machines'
  `);
  const parcColSet = new Set(parcCols.map(r => r.column_name));

  if (!parcColSet.has('dernier_compteur_nb')) {
    await client.query('ALTER TABLE parc_machines ADD COLUMN dernier_compteur_nb INTEGER DEFAULT 0');
  }
  if (!parcColSet.has('dernier_compteur_couleur')) {
    await client.query('ALTER TABLE parc_machines ADD COLUMN dernier_compteur_couleur INTEGER DEFAULT 0');
  }
  if (!parcColSet.has('date_dernier_releve')) {
    await client.query('ALTER TABLE parc_machines ADD COLUMN date_dernier_releve DATE');
  }
}
