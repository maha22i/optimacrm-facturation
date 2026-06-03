export const name = '031_create_sepa_tables';

export async function up(client) {
  // ── 1. ALTER clients: ajouter sequence_mandat ─────────────────────────────
  const { rows: cols } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'clients'
  `);
  const colSet = new Set(cols.map(r => r.column_name));

  if (!colSet.has('sequence_mandat')) {
    await client.query(`
      ALTER TABLE clients
      ADD COLUMN sequence_mandat VARCHAR(4) DEFAULT 'RCUR'
    `);
  }

  // ── 2. Table sepa_creancier (singleton paramètres créancier) ──────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS sepa_creancier (
      id          SERIAL PRIMARY KEY,
      nom         VARCHAR(70) NOT NULL DEFAULT 'GROUPE INNOV',
      ics         VARCHAR(35) NOT NULL,
      iban        VARCHAR(34) NOT NULL,
      bic         VARCHAR(11) NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // ── 3. Table sepa_remises (historique des remises générées) ────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS sepa_remises (
      id                SERIAL PRIMARY KEY,
      msg_id            VARCHAR(35) NOT NULL,
      pmt_inf_id        VARCHAR(35) NOT NULL,
      date_creation     TIMESTAMPTZ DEFAULT NOW(),
      date_prelevement  DATE NOT NULL,
      nb_transactions   INTEGER NOT NULL,
      montant_total     NUMERIC(14,2) NOT NULL,
      fichier_xml       TEXT,
      statut            VARCHAR(20) DEFAULT 'GENERE',
      user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
      user_nom          VARCHAR(150)
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_sepa_remises_date ON sepa_remises(date_creation DESC)`);

  // ── 4. Table sepa_remise_lignes (détail par facture) ──────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS sepa_remise_lignes (
      id              SERIAL PRIMARY KEY,
      remise_id       INTEGER REFERENCES sepa_remises(id) ON DELETE CASCADE,
      facture_id      INTEGER REFERENCES factures(id),
      instr_id        VARCHAR(35),
      end_to_end_id   VARCHAR(35),
      montant         NUMERIC(14,2) NOT NULL,
      rum             VARCHAR(35),
      iban_debiteur   VARCHAR(34)
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_sepa_remise_lignes_remise ON sepa_remise_lignes(remise_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_sepa_remise_lignes_facture ON sepa_remise_lignes(facture_id)`);
}
