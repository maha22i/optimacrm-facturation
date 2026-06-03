export const name = '032_create_avoirs';

export async function up(client) {
  await client.query(`CREATE SEQUENCE IF NOT EXISTS avoir_numero_annuel_seq START 1`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS avoirs (
      id                SERIAL PRIMARY KEY,
      numero            VARCHAR(20) UNIQUE NOT NULL,
      facture_id        INTEGER NOT NULL REFERENCES factures(id),
      client_id         INTEGER NOT NULL REFERENCES clients(id),
      type_avoir        VARCHAR(10) NOT NULL CHECK (type_avoir IN ('TOTAL', 'PARTIEL')),
      motif             TEXT,
      date_avoir        DATE NOT NULL DEFAULT CURRENT_DATE,
      montant_ht        NUMERIC(14,2) NOT NULL DEFAULT 0,
      montant_tva       NUMERIC(14,2) NOT NULL DEFAULT 0,
      montant_ttc       NUMERIC(14,2) NOT NULL DEFAULT 0,
      statut            VARCHAR(20) NOT NULL DEFAULT 'Brouillon'
                          CHECK (statut IN ('Brouillon', 'Validé', 'Remboursé', 'Imputé', 'Annulé')),
      mode_utilisation  VARCHAR(20) CHECK (mode_utilisation IN ('REMBOURSEMENT', 'IMPUTATION')),
      facture_imputee_id INTEGER REFERENCES factures(id),
      pdf_url           TEXT,
      created_at        TIMESTAMPTZ DEFAULT now(),
      updated_at        TIMESTAMPTZ DEFAULT now()
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS avoir_lignes (
      id                SERIAL PRIMARY KEY,
      avoir_id          INTEGER NOT NULL REFERENCES avoirs(id) ON DELETE CASCADE,
      facture_ligne_id  INTEGER REFERENCES facture_lignes(id),
      designation       TEXT NOT NULL,
      quantite          NUMERIC(12,3) NOT NULL DEFAULT 1,
      prix_unitaire_ht  NUMERIC(14,4) NOT NULL DEFAULT 0,
      taux_tva          NUMERIC(5,2)  NOT NULL DEFAULT 20,
      montant_ht        NUMERIC(14,2) NOT NULL DEFAULT 0,
      montant_ttc       NUMERIC(14,2) NOT NULL DEFAULT 0
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_avoirs_facture ON avoirs(facture_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_avoirs_client ON avoirs(client_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_avoirs_statut ON avoirs(statut)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_avoir_lignes_avoir ON avoir_lignes(avoir_id)`);
}
