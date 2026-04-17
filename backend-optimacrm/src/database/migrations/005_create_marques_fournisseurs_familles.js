export const name = '005_create_marques_fournisseurs_familles';

export async function up(client) {
  await client.query(`
    -- ═══════════════════════════════════════════════════════════════
    -- Marques
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS marques (
      id              SERIAL PRIMARY KEY,
      nom             VARCHAR(255) NOT NULL UNIQUE,
      logo_url        VARCHAR(500),
      site_web        VARCHAR(500),
      notes           TEXT,
      actif           BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_marques_nom ON marques (nom);
    CREATE INDEX IF NOT EXISTS idx_marques_actif ON marques (actif);

    -- ═══════════════════════════════════════════════════════════════
    -- Fournisseurs
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS fournisseurs (
      id                      SERIAL PRIMARY KEY,
      nom                     VARCHAR(255) NOT NULL UNIQUE,
      code                    VARCHAR(20) UNIQUE,
      type                    VARCHAR(30) NOT NULL DEFAULT 'FOURNISSEUR',
      contact_nom             VARCHAR(100),
      contact_prenom          VARCHAR(100),
      contact_email           VARCHAR(255),
      contact_telephone       VARCHAR(30),
      adresse_ligne1          VARCHAR(255),
      adresse_ligne2          VARCHAR(255),
      code_postal             VARCHAR(10),
      ville                   VARCHAR(100),
      pays                    VARCHAR(100) NOT NULL DEFAULT 'France',
      site_web                VARCHAR(500),
      numero_compte_client    VARCHAR(100),
      conditions_paiement     VARCHAR(255),
      delai_livraison_jours   INTEGER,
      notes                   TEXT,
      actif                   BOOLEAN NOT NULL DEFAULT true,
      created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT fournisseurs_type_check CHECK (
        type IN ('FOURNISSEUR','OPERATEUR_TELECOM','CONSTRUCTEUR','DISTRIBUTEUR','AUTRE')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_fournisseurs_nom ON fournisseurs (nom);
    CREATE INDEX IF NOT EXISTS idx_fournisseurs_code ON fournisseurs (code);
    CREATE INDEX IF NOT EXISTS idx_fournisseurs_type ON fournisseurs (type);
    CREATE INDEX IF NOT EXISTS idx_fournisseurs_actif ON fournisseurs (actif);

    -- ═══════════════════════════════════════════════════════════════
    -- Familles de produits
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS familles_produits (
      id              SERIAL PRIMARY KEY,
      nom             VARCHAR(255) NOT NULL,
      categorie       VARCHAR(30) NOT NULL,
      description     VARCHAR(500),
      actif           BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT familles_categorie_check CHECK (
        categorie IN ('COPIEUR','TELEPHONIE','INFORMATIQUE','SECURITE')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_familles_categorie ON familles_produits (categorie);
    CREATE INDEX IF NOT EXISTS idx_familles_actif ON familles_produits (actif);

    -- ═══════════════════════════════════════════════════════════════
    -- Unités
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS unites (
      id              SERIAL PRIMARY KEY,
      nom             VARCHAR(50) NOT NULL UNIQUE,
      actif           BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Seed des unités par défaut
    INSERT INTO unites (nom) VALUES
      ('mois'), ('unité'), ('heure'), ('forfait'), ('page'), ('licence')
    ON CONFLICT (nom) DO NOTHING;
  `);
}

export async function down(client) {
  await client.query(`
    DROP TABLE IF EXISTS unites;
    DROP TABLE IF EXISTS familles_produits;
    DROP TABLE IF EXISTS fournisseurs;
    DROP TABLE IF EXISTS marques;
  `);
}
