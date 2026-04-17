export const name = '011_create_contrats';

export async function up(client) {
  // Séquence pour auto-numérotation
  await client.query(`CREATE SEQUENCE IF NOT EXISTS contrat_numero_seq START 1`);

  // Table principale contrats
  await client.query(`
    CREATE TABLE IF NOT EXISTS contrats (
      id SERIAL PRIMARY KEY,
      numero_contrat VARCHAR(50) NOT NULL UNIQUE,
      type_contrat VARCHAR(30) NOT NULL CHECK (type_contrat IN ('Copieur', 'Telephonie', 'Informatique', 'Securite')),
      type_facturation VARCHAR(30) NOT NULL DEFAULT 'Periodique' CHECK (type_facturation IN ('Unique', 'Periodique')),
      client_id INTEGER NOT NULL REFERENCES clients(id),
      periodicite VARCHAR(20) NOT NULL DEFAULT 'Trimestriel' CHECK (periodicite IN ('Mensuel', 'Bimestriel', 'Trimestriel', 'Semestriel', 'Annuel')),

      date_signature DATE,
      date_installation DATE,
      date_debut DATE NOT NULL,
      date_echeance DATE,
      date_prochaine_facture DATE,
      date_renouvellement DATE,

      duree_contrat_mois INTEGER DEFAULT 63,

      numero_dossier_financement VARCHAR(50),
      organisme_credit VARCHAR(100),
      montant_finance DECIMAL(12,2) DEFAULT 0,
      loyer_ht DECIMAL(12,2) DEFAULT 0,
      location_interne BOOLEAN DEFAULT false,

      statut VARCHAR(30) NOT NULL DEFAULT 'Actif' CHECK (statut IN ('Brouillon', 'Actif', 'Suspendu', 'Résilié', 'Échu', 'Renouvelé')),

      derniere_facture_date DATE,
      derniere_facture_numero VARCHAR(20),
      derniere_facture_montant_ht DECIMAL(12,2),

      ftc DECIMAL(10,2) DEFAULT 0,
      ect DECIMAL(10,2) DEFAULT 0,

      notes TEXT,
      devis_id INTEGER REFERENCES devis(id),

      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_contrats_client ON contrats(client_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_contrats_type ON contrats(type_contrat)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_contrats_statut ON contrats(statut)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_contrats_prochaine_facture ON contrats(date_prochaine_facture)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_contrats_echeance ON contrats(date_echeance)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_contrats_deleted ON contrats(deleted_at)`);

  // Table lignes de contrat
  await client.query(`
    CREATE TABLE IF NOT EXISTS contrat_lignes (
      id SERIAL PRIMARY KEY,
      contrat_id INTEGER NOT NULL REFERENCES contrats(id) ON DELETE CASCADE,
      ordre INTEGER NOT NULL DEFAULT 0,
      categorie_ligne VARCHAR(50) CHECK (categorie_ligne IN (
        'Forfait Fixe',
        'Forfait Mobile',
        'Lien Internet',
        'Location Matériel',
        'Services',
        'Autre',
        'Forfait Copie N&B',
        'Forfait Copie Couleur',
        'Service Connectic',
        'PLC',
        'Hors Forfait'
      )),
      reference VARCHAR(20),
      designation VARCHAR(255) NOT NULL,
      complement_info TEXT,
      quantite DECIMAL(10,2) NOT NULL DEFAULT 1,
      prix_unitaire_ht DECIMAL(12,4) NOT NULL DEFAULT 0,
      remise_pourcentage DECIMAL(5,2) DEFAULT 0,
      taux_tva DECIMAL(5,2) NOT NULL DEFAULT 20,
      catalogue_produit_id INTEGER REFERENCES catalogue_produits(id),
      actif BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_contrat_lignes_contrat ON contrat_lignes(contrat_id)`);

  // Table machines (contrats Copieur)
  await client.query(`
    CREATE TABLE IF NOT EXISTS contrat_machines (
      id SERIAL PRIMARY KEY,
      contrat_id INTEGER NOT NULL REFERENCES contrats(id) ON DELETE CASCADE,
      numero_serie VARCHAR(50) NOT NULL,
      modele VARCHAR(100),
      marque VARCHAR(50),
      designation VARCHAR(255),

      cout_copie_nb DECIMAL(10,6) DEFAULT 0,
      cout_copie_couleur DECIMAL(10,6) DEFAULT 0,
      cout_copie_t1 DECIMAL(10,6) DEFAULT 0,
      cout_copie_t2 DECIMAL(10,6) DEFAULT 0,
      cout_copie_t3 DECIMAL(10,6) DEFAULT 0,

      volume_forfait_nb INTEGER DEFAULT 0,
      volume_forfait_couleur INTEGER DEFAULT 0,
      volume_forfait_t1 INTEGER DEFAULT 0,
      volume_forfait_t2 INTEGER DEFAULT 0,

      dernier_compteur_nb INTEGER DEFAULT 0,
      dernier_compteur_couleur INTEGER DEFAULT 0,
      date_dernier_releve DATE,

      service_connectic DECIMAL(10,2) DEFAULT 0,
      service_collecteur DECIMAL(10,2) DEFAULT 0,
      service_divers DECIMAL(10,2) DEFAULT 0,
      service_autre DECIMAL(10,2) DEFAULT 0,

      actif BOOLEAN DEFAULT true,
      catalogue_produit_id INTEGER REFERENCES catalogue_produits(id),

      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_contrat_machines_contrat ON contrat_machines(contrat_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_contrat_machines_serie ON contrat_machines(numero_serie)`);
}

export async function down(client) {
  await client.query(`DROP TABLE IF EXISTS contrat_machines`);
  await client.query(`DROP TABLE IF EXISTS contrat_lignes`);
  await client.query(`DROP TABLE IF EXISTS contrats`);
  await client.query(`DROP SEQUENCE IF EXISTS contrat_numero_seq`);
}
