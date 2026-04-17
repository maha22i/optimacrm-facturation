export const name = '014_create_parc_machines';

export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS parc_machines (
      id SERIAL PRIMARY KEY,

      -- Identification
      numero_serie VARCHAR(50) NOT NULL UNIQUE,
      matricule VARCHAR(50),

      -- Produit / Modèle
      designation VARCHAR(255) NOT NULL,
      marque VARCHAR(100),
      modele VARCHAR(100),
      categorie VARCHAR(50) NOT NULL DEFAULT 'Copieur',
      reference_produit VARCHAR(100),

      -- Localisation / Client
      client_id INTEGER REFERENCES clients(id),
      site_installation TEXT,

      -- Contrat lié
      contrat_id INTEGER,
      numero_contrat VARCHAR(50),

      -- Dates
      date_installation DATE,
      date_fin_garantie DATE,
      date_retrait DATE,

      -- Statut
      statut VARCHAR(30) NOT NULL DEFAULT 'En service',

      -- Compteurs dénormalisés
      dernier_compteur_nb INTEGER DEFAULT 0,
      dernier_compteur_couleur INTEGER DEFAULT 0,
      date_dernier_releve DATE,

      -- Copieurs
      vitesse_ppm INTEGER,
      format_max VARCHAR(10),
      recto_verso BOOLEAN DEFAULT true,
      reseau BOOLEAN DEFAULT true,

      -- Téléphonie
      type_equipement_tel VARCHAR(50),
      nb_postes INTEGER,
      protocole VARCHAR(50),

      -- Informatique
      type_equipement_info VARCHAR(50),
      processeur VARCHAR(100),
      ram VARCHAR(50),
      stockage VARCHAR(100),
      systeme_exploitation VARCHAR(100),

      -- Métadonnées
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_parc_client ON parc_machines(client_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_parc_statut ON parc_machines(statut)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_parc_categorie ON parc_machines(categorie)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_parc_numero_serie ON parc_machines(numero_serie)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_parc_contrat ON parc_machines(numero_contrat)');

  await client.query(`
    CREATE TABLE IF NOT EXISTS releves_compteurs (
      id SERIAL PRIMARY KEY,
      machine_id INTEGER NOT NULL REFERENCES parc_machines(id) ON DELETE CASCADE,
      date_releve DATE NOT NULL,
      date_debut_periode DATE,
      date_fin_periode DATE,
      compteur_nb INTEGER DEFAULT 0,
      compteur_couleur INTEGER DEFAULT 0,
      volume_nb INTEGER DEFAULT 0,
      volume_couleur INTEGER DEFAULT 0,
      source VARCHAR(30) DEFAULT 'Manuel',
      facture_id INTEGER,
      facture_numero VARCHAR(50),
      est_facture BOOLEAN DEFAULT false,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query('CREATE INDEX IF NOT EXISTS idx_releves_machine ON releves_compteurs(machine_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_releves_date ON releves_compteurs(date_releve DESC)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_releves_non_factures ON releves_compteurs(est_facture) WHERE est_facture = false');
}
