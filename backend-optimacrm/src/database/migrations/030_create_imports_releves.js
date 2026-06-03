export const name = '030_create_imports_releves';

export async function up(client) {
  // ── 1. Table principale imports_releves ────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS imports_releves (
      id SERIAL PRIMARY KEY,

      -- Identification du batch
      numero_batch VARCHAR(20) UNIQUE NOT NULL,

      -- Fichier source
      nom_fichier VARCHAR(255) NOT NULL,
      taille_fichier INTEGER,
      hash_fichier VARCHAR(64) NOT NULL,

      -- Métadonnées
      user_id UUID REFERENCES users(id),
      user_nom VARCHAR(150),
      date_import TIMESTAMP DEFAULT NOW(),

      -- Stats du batch
      nb_lignes_fichier INTEGER DEFAULT 0,
      nb_releves_crees INTEGER DEFAULT 0,
      nb_lignes_ignorees INTEGER DEFAULT 0,
      nb_lignes_erreur INTEGER DEFAULT 0,

      -- Période couverte
      periode_debut DATE,
      periode_fin DATE,

      -- Statut
      statut VARCHAR(20) DEFAULT 'Actif',
      date_annulation TIMESTAMP,
      user_annulation_id UUID REFERENCES users(id),
      motif_annulation TEXT,

      -- Détail erreurs
      rapport_erreurs JSONB,

      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_imports_date ON imports_releves(date_import DESC)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_imports_hash ON imports_releves(hash_fichier)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_imports_statut ON imports_releves(statut)');

  // ── 2. ALTER releves_compteurs ─────────────────────────────────────────
  const { rows: rcCols } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'releves_compteurs'
  `);
  const rcColSet = new Set(rcCols.map(r => r.column_name));

  // import_id already exists from migration 018 but without FK — drop & re-add with FK
  if (rcColSet.has('import_id')) {
    // Drop old column (no FK constraint existed)
    try {
      await client.query('ALTER TABLE releves_compteurs DROP COLUMN import_id');
    } catch { /* ignore if already dropped */ }
  }
  await client.query('ALTER TABLE releves_compteurs ADD COLUMN import_id INTEGER REFERENCES imports_releves(id) ON DELETE SET NULL');

  if (!rcColSet.has('ligne_fichier')) {
    await client.query('ALTER TABLE releves_compteurs ADD COLUMN ligne_fichier INTEGER');
  }

  await client.query('CREATE INDEX IF NOT EXISTS idx_releves_import ON releves_compteurs(import_id)');

  // Unique constraint for duplicate detection per machine+date
  // First clean up any existing duplicates (keep the most recent by id)
  await client.query(`
    DELETE FROM releves_compteurs rc1
    USING releves_compteurs rc2
    WHERE rc1.machine_id = rc2.machine_id
      AND rc1.date_releve = rc2.date_releve
      AND rc1.id < rc2.id
  `);

  // Now create the unique index
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_releve_machine_date
    ON releves_compteurs(machine_id, date_releve)
  `);

  // ── 3. ALTER facture_lignes ────────────────────────────────────────────
  const { rows: flCols } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'facture_lignes'
  `);
  const flColSet = new Set(flCols.map(r => r.column_name));

  if (!flColSet.has('releve_compteur_id')) {
    await client.query('ALTER TABLE facture_lignes ADD COLUMN releve_compteur_id INTEGER REFERENCES releves_compteurs(id) ON DELETE SET NULL');
    await client.query('CREATE INDEX IF NOT EXISTS idx_facture_lignes_releve ON facture_lignes(releve_compteur_id)');
  }

  // ── 4. Sequence for batch numbering ────────────────────────────────────
  await client.query(`CREATE SEQUENCE IF NOT EXISTS imports_releves_batch_seq START 1`);
}
