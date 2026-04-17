export const name = '008_create_produit_details_tarifs';

export async function up(client) {
  await client.query(`
    -- ═══════════════════════════════════════════════════════════════
    -- Détails Copieur
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS produit_details_copieur (
      produit_id          INTEGER PRIMARY KEY REFERENCES catalogue_produits(id) ON DELETE CASCADE,
      cartouche           VARCHAR(255),
      consommation        VARCHAR(255),
      interface           VARCHAR(255),
      dimensions          VARCHAR(255),
      conditionnement     VARCHAR(255),
      poids               DECIMAL(8,2),
      resolution          VARCHAR(100),
      nb_pages            INTEGER,
      largeur_impression  VARCHAR(100)
    );

    -- ═══════════════════════════════════════════════════════════════
    -- Détails Téléphonie
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS produit_details_telephonie (
      produit_id          INTEGER PRIMARY KEY REFERENCES catalogue_produits(id) ON DELETE CASCADE,
      operateur           VARCHAR(255),
      type_ligne          VARCHAR(20),
      debit_download      VARCHAR(100),
      debit_upload        VARCHAR(100),
      engagement_mois     INTEGER,
      nombre_lignes       INTEGER,
      nombre_postes       INTEGER,
      inclus_appels       VARCHAR(500),
      data_mobile         VARCHAR(100),
      protocole           VARCHAR(100),
      codec               VARCHAR(100),

      CONSTRAINT details_tel_type_ligne_check CHECK (
        type_ligne IS NULL OR type_ligne IN ('FIXE','MOBILE','FIBRE','ADSL','SDSL','SIP','TRUNK','AUTRE')
      )
    );

    -- ═══════════════════════════════════════════════════════════════
    -- Détails Informatique
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS produit_details_informatique (
      produit_id            INTEGER PRIMARY KEY REFERENCES catalogue_produits(id) ON DELETE CASCADE,
      type_materiel         VARCHAR(255),
      processeur            VARCHAR(255),
      memoire_ram           VARCHAR(100),
      stockage              VARCHAR(100),
      systeme_exploitation  VARCHAR(100),
      garantie_mois         INTEGER,
      licence_type          VARCHAR(100),
      nombre_utilisateurs   INTEGER
    );

    -- ═══════════════════════════════════════════════════════════════
    -- Détails Sécurité
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS produit_details_securite (
      produit_id          INTEGER PRIMARY KEY REFERENCES catalogue_produits(id) ON DELETE CASCADE,
      type_equipement     VARCHAR(255),
      resolution_camera   VARCHAR(100),
      angle_vue           VARCHAR(100),
      vision_nocturne     BOOLEAN,
      stockage_jours      INTEGER,
      protocole           VARCHAR(100),
      ip_rating           VARCHAR(20)
    );

    -- ═══════════════════════════════════════════════════════════════
    -- Tarifs clients
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS produit_tarifs_clients (
      id              SERIAL PRIMARY KEY,
      produit_id      INTEGER NOT NULL REFERENCES catalogue_produits(id) ON DELETE CASCADE,
      client_id       INTEGER NOT NULL REFERENCES clients(id),
      prix_vente      DECIMAL(12,2) NOT NULL,
      taux_tva        DECIMAL(4,1) NOT NULL DEFAULT 20,
      notes           VARCHAR(500),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      UNIQUE(produit_id, client_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tarifs_clients_produit ON produit_tarifs_clients (produit_id);
    CREATE INDEX IF NOT EXISTS idx_tarifs_clients_client ON produit_tarifs_clients (client_id);

    -- ═══════════════════════════════════════════════════════════════
    -- Comptabilité produit
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS produit_comptabilite (
      produit_id      INTEGER PRIMARY KEY REFERENCES catalogue_produits(id) ON DELETE CASCADE,
      compte_vente    VARCHAR(20),
      compte_achat    VARCHAR(20),
      code_analytique VARCHAR(50),
      centre_cout     VARCHAR(100)
    );
  `);
}

export async function down(client) {
  await client.query(`
    DROP TABLE IF EXISTS produit_comptabilite;
    DROP TABLE IF EXISTS produit_tarifs_clients;
    DROP TABLE IF EXISTS produit_details_securite;
    DROP TABLE IF EXISTS produit_details_informatique;
    DROP TABLE IF EXISTS produit_details_telephonie;
    DROP TABLE IF EXISTS produit_details_copieur;
  `);
}
