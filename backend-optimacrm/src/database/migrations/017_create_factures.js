export const name = '017_create_factures';

export async function up(client) {
  await client.query(`CREATE SEQUENCE IF NOT EXISTS facture_numero_seq START 1`);
  await client.query(`CREATE SEQUENCE IF NOT EXISTS avoir_numero_seq START 1`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS factures (
      id SERIAL PRIMARY KEY,

      numero_facture VARCHAR(20) NOT NULL UNIQUE,

      type_origine VARCHAR(30) NOT NULL DEFAULT 'Manuelle'
        CHECK (type_origine IN ('Manuelle', 'Contrat', 'Devis')),
      contrat_id INTEGER REFERENCES contrats(id),
      devis_id INTEGER,

      client_id INTEGER NOT NULL REFERENCES clients(id),
      code_client VARCHAR(20),

      client_raison_sociale VARCHAR(255),
      client_adresse TEXT,
      client_cp VARCHAR(10),
      client_ville VARCHAR(100),
      client_email VARCHAR(255),
      client_tva_numero VARCHAR(50),

      site_concerne_nom VARCHAR(255),
      site_concerne_adresse TEXT,
      site_concerne_cp VARCHAR(10),
      site_concerne_ville VARCHAR(100),
      site_concerne_email VARCHAR(255),

      numero_contrat VARCHAR(50),
      numero_serie VARCHAR(50),
      modele_machine VARCHAR(255),

      date_creation DATE NOT NULL DEFAULT CURRENT_DATE,
      date_echeance DATE NOT NULL,

      periode_debut DATE,
      periode_fin DATE,

      mode_reglement VARCHAR(50) DEFAULT 'Prélèvement',

      total_ht DECIMAL(12,2) NOT NULL DEFAULT 0,
      frais_techniques DECIMAL(12,2) DEFAULT 0,
      eco_contribution DECIMAL(12,2) DEFAULT 0,
      taux_tva DECIMAL(5,2) DEFAULT 20.00,
      montant_tva DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_ttc DECIMAL(12,2) NOT NULL DEFAULT 0,

      total_regle DECIMAL(12,2) DEFAULT 0,
      net_a_payer DECIMAL(12,2) NOT NULL DEFAULT 0,

      statut VARCHAR(30) NOT NULL DEFAULT 'Brouillon'
        CHECK (statut IN ('Brouillon', 'Validée', 'Envoyée', 'Payée', 'Partiellement payée', 'En retard', 'Annulée')),

      avoir_id INTEGER,
      est_avoir BOOLEAN DEFAULT false,
      facture_origine_id INTEGER,

      notes TEXT,

      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_factures_client ON factures(client_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_factures_contrat ON factures(contrat_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_factures_statut ON factures(statut)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_factures_date ON factures(date_creation DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_factures_numero ON factures(numero_facture)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS facture_lignes (
      id SERIAL PRIMARY KEY,
      facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,

      position INTEGER NOT NULL DEFAULT 0,

      type_ligne VARCHAR(30) NOT NULL DEFAULT 'PRODUIT'
        CHECK (type_ligne IN (
          'PRODUIT', 'FORFAIT_NB', 'FORFAIT_COULEUR',
          'REGULARISATION_NB', 'REGULARISATION_COULEUR',
          'SERVICE', 'ABONNEMENT', 'LOCATION',
          'COMMENTAIRE', 'SOUS_TOTAL', 'SAUT_DE_LIGNE'
        )),

      reference VARCHAR(50),
      designation TEXT NOT NULL,
      description TEXT,

      ligne_periode_debut DATE,
      ligne_periode_fin DATE,

      ancien_compteur INTEGER,
      nouveau_compteur INTEGER,
      compteur_periode_debut DATE,
      compteur_periode_fin DATE,

      quantite DECIMAL(12,2) DEFAULT 1,
      prix_unitaire DECIMAL(12,6) DEFAULT 0,
      remise_pourcentage DECIMAL(5,2) DEFAULT 0,
      remise_montant DECIMAL(12,2) DEFAULT 0,

      taux_tva DECIMAL(5,2) DEFAULT 20.00,
      total_ht DECIMAL(12,2) NOT NULL DEFAULT 0,

      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_facture_lignes_facture ON facture_lignes(facture_id)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS facture_reglements (
      id SERIAL PRIMARY KEY,
      facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,

      date_reglement DATE NOT NULL,
      montant DECIMAL(12,2) NOT NULL,
      mode_reglement VARCHAR(50) NOT NULL,
      reference VARCHAR(100),
      notes TEXT,

      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_reglements_facture ON facture_reglements(facture_id)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS facture_historique (
      id SERIAL PRIMARY KEY,
      facture_id INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,

      action VARCHAR(50) NOT NULL,
      description TEXT,
      utilisateur VARCHAR(100),

      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_facture_historique_facture ON facture_historique(facture_id)`);
}
