export const name = '003_create_devis';

export async function up(client) {
  await client.query(`
    -- Séquences pour la numérotation auto
    CREATE SEQUENCE IF NOT EXISTS devis_numero_seq START WITH 1;
    CREATE SEQUENCE IF NOT EXISTS bon_commande_numero_seq START WITH 1;

    -- ═══════════════════════════════════════════════════════════════
    -- Catalogue produits / services
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS catalogue_produits (
      id                SERIAL PRIMARY KEY,
      reference         VARCHAR(50) UNIQUE NOT NULL,
      designation       VARCHAR(255) NOT NULL,
      description       TEXT,
      categorie         VARCHAR(100),
      unite             VARCHAR(30) NOT NULL DEFAULT 'unité',
      prix_unitaire_ht  DECIMAL(12,2) NOT NULL DEFAULT 0,
      taux_tva          DECIMAL(4,1) NOT NULL DEFAULT 20,
      actif             BOOLEAN NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT catalogue_taux_tva_check CHECK (taux_tva IN (20, 10, 5.5, 0))
    );

    CREATE INDEX IF NOT EXISTS idx_catalogue_reference ON catalogue_produits (reference);
    CREATE INDEX IF NOT EXISTS idx_catalogue_categorie ON catalogue_produits (categorie);
    CREATE INDEX IF NOT EXISTS idx_catalogue_actif ON catalogue_produits (actif);

    -- ═══════════════════════════════════════════════════════════════
    -- Templates de champs personnalisés
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS champs_personnalises_templates (
      id              SERIAL PRIMARY KEY,
      label           VARCHAR(255) NOT NULL,
      cle             VARCHAR(100) UNIQUE NOT NULL,
      type            VARCHAR(10) NOT NULL DEFAULT 'TEXTE',
      valeur_defaut   TEXT,
      options_liste   JSONB,
      categorie       VARCHAR(100) NOT NULL DEFAULT 'Général',
      actif           BOOLEAN NOT NULL DEFAULT true,
      afficher_sur_pdf BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT champs_templates_type_check CHECK (
        type IN ('TEXTE','NOMBRE','DATE','LISTE','BOOLEEN')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_champs_templates_categorie ON champs_personnalises_templates (categorie);

    -- ═══════════════════════════════════════════════════════════════
    -- Devis
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS devis (
      id                          SERIAL PRIMARY KEY,
      numero_devis                VARCHAR(20) UNIQUE NOT NULL,
      client_id                   INTEGER NOT NULL REFERENCES clients(id),
      contact_id                  INTEGER REFERENCES client_contacts(id),
      adresse_facturation_id      INTEGER REFERENCES client_adresses(id),
      adresse_livraison_id        INTEGER REFERENCES client_adresses(id),

      statut                      VARCHAR(15) NOT NULL DEFAULT 'BROUILLON',
      date_creation               DATE NOT NULL DEFAULT CURRENT_DATE,
      date_emission               DATE,
      date_validite               DATE NOT NULL,
      date_acceptation            DATE,
      date_transformation         DATE,

      objet                       VARCHAR(500) NOT NULL,
      reference_client            VARCHAR(100),
      commercial_id               UUID REFERENCES users(id),

      conditions_paiement         VARCHAR(25) NOT NULL DEFAULT '30_JOURS',
      mode_paiement               VARCHAR(20) NOT NULL DEFAULT 'VIREMENT',
      devise                      VARCHAR(5) NOT NULL DEFAULT 'EUR',

      remise_globale_type         VARCHAR(15) NOT NULL DEFAULT 'POURCENTAGE',
      remise_globale_valeur       DECIMAL(12,2) NOT NULL DEFAULT 0,

      montant_ht                  DECIMAL(12,2) NOT NULL DEFAULT 0,
      montant_remise              DECIMAL(12,2) NOT NULL DEFAULT 0,
      montant_ht_apres_remise     DECIMAL(12,2) NOT NULL DEFAULT 0,
      montant_tva                 DECIMAL(12,2) NOT NULL DEFAULT 0,
      montant_ttc                 DECIMAL(12,2) NOT NULL DEFAULT 0,

      notes_internes              TEXT,
      conditions_generales        TEXT,
      message_client              TEXT,

      signature_client            TEXT,
      date_signature              TIMESTAMPTZ,
      ip_signature                VARCHAR(45),

      facture_id                  INTEGER,
      bon_commande_id             INTEGER,

      created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at                  TIMESTAMPTZ,

      CONSTRAINT devis_statut_check CHECK (
        statut IN ('BROUILLON','ENVOYE','ACCEPTE','REFUSE','EXPIRE','FACTURE')
      ),
      CONSTRAINT devis_conditions_paiement_check CHECK (
        conditions_paiement IN ('COMPTANT','15_JOURS','30_JOURS','45_JOURS_FIN_MOIS','60_JOURS')
      ),
      CONSTRAINT devis_mode_paiement_check CHECK (
        mode_paiement IN ('VIREMENT','PRELEVEMENT_SEPA','CHEQUE','CARTE','ESPECES')
      ),
      CONSTRAINT devis_remise_type_check CHECK (
        remise_globale_type IN ('POURCENTAGE','MONTANT_FIXE')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_devis_numero ON devis (numero_devis);
    CREATE INDEX IF NOT EXISTS idx_devis_client ON devis (client_id);
    CREATE INDEX IF NOT EXISTS idx_devis_statut ON devis (statut);
    CREATE INDEX IF NOT EXISTS idx_devis_commercial ON devis (commercial_id);
    CREATE INDEX IF NOT EXISTS idx_devis_date_creation ON devis (date_creation);
    CREATE INDEX IF NOT EXISTS idx_devis_deleted_at ON devis (deleted_at);

    -- ═══════════════════════════════════════════════════════════════
    -- Lignes de devis
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS devis_lignes (
      id                    SERIAL PRIMARY KEY,
      devis_id              INTEGER NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
      ordre                 INTEGER NOT NULL DEFAULT 0,
      type                  VARCHAR(15) NOT NULL DEFAULT 'PRODUIT',

      reference             VARCHAR(50),
      designation           VARCHAR(500),
      description_detaillee TEXT,
      unite                 VARCHAR(30),

      quantite              DECIMAL(12,3) NOT NULL DEFAULT 1,
      prix_unitaire_ht      DECIMAL(12,2) NOT NULL DEFAULT 0,
      remise_ligne_type     VARCHAR(15) NOT NULL DEFAULT 'POURCENTAGE',
      remise_ligne_valeur   DECIMAL(12,2) NOT NULL DEFAULT 0,
      taux_tva              DECIMAL(4,1) NOT NULL DEFAULT 20,

      montant_ht            DECIMAL(12,2) NOT NULL DEFAULT 0,
      montant_tva           DECIMAL(12,2) NOT NULL DEFAULT 0,
      montant_ttc           DECIMAL(12,2) NOT NULL DEFAULT 0,

      est_optionnel         BOOLEAN NOT NULL DEFAULT false,
      catalogue_id          INTEGER REFERENCES catalogue_produits(id),

      CONSTRAINT devis_lignes_type_check CHECK (
        type IN ('PRODUIT','SERVICE','COMMENTAIRE','SAUT_DE_LIGNE','SOUS_TOTAL')
      ),
      CONSTRAINT devis_lignes_remise_type_check CHECK (
        remise_ligne_type IN ('POURCENTAGE','MONTANT_FIXE')
      ),
      CONSTRAINT devis_lignes_taux_tva_check CHECK (
        taux_tva IN (20, 10, 5.5, 0)
      )
    );

    CREATE INDEX IF NOT EXISTS idx_devis_lignes_devis ON devis_lignes (devis_id);
    CREATE INDEX IF NOT EXISTS idx_devis_lignes_ordre ON devis_lignes (devis_id, ordre);

    -- ═══════════════════════════════════════════════════════════════
    -- Champs personnalisés du devis
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS devis_champs_personnalises (
      id                SERIAL PRIMARY KEY,
      devis_id          INTEGER NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
      cle               VARCHAR(100) NOT NULL,
      label             VARCHAR(255) NOT NULL,
      valeur            TEXT,
      type              VARCHAR(10) NOT NULL DEFAULT 'TEXTE',
      ordre             INTEGER NOT NULL DEFAULT 0,
      afficher_sur_pdf  BOOLEAN NOT NULL DEFAULT true,

      CONSTRAINT devis_champs_type_check CHECK (
        type IN ('TEXTE','NOMBRE','DATE','LISTE','BOOLEEN')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_devis_champs_devis ON devis_champs_personnalises (devis_id);

    -- ═══════════════════════════════════════════════════════════════
    -- Historique des devis
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS devis_historique (
      id          SERIAL PRIMARY KEY,
      devis_id    INTEGER NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
      user_id     UUID REFERENCES users(id),
      action      VARCHAR(50) NOT NULL,
      detail      TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_devis_historique_devis ON devis_historique (devis_id);

    -- ═══════════════════════════════════════════════════════════════
    -- Bons de commande
    -- ═══════════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS bons_commande (
      id              SERIAL PRIMARY KEY,
      numero_bc       VARCHAR(20) UNIQUE NOT NULL,
      devis_id        INTEGER NOT NULL REFERENCES devis(id),
      client_id       INTEGER NOT NULL REFERENCES clients(id),
      statut          VARCHAR(15) NOT NULL DEFAULT 'EN_ATTENTE',
      date_emission   DATE NOT NULL DEFAULT CURRENT_DATE,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT bons_commande_statut_check CHECK (
        statut IN ('EN_ATTENTE','CONFIRME','ANNULE')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_bons_commande_devis ON bons_commande (devis_id);
    CREATE INDEX IF NOT EXISTS idx_bons_commande_client ON bons_commande (client_id);

    -- FK retro : devis → bons_commande
    ALTER TABLE devis
      ADD CONSTRAINT fk_devis_bon_commande
      FOREIGN KEY (bon_commande_id) REFERENCES bons_commande(id);
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE devis DROP CONSTRAINT IF EXISTS fk_devis_bon_commande;
    DROP TABLE IF EXISTS bons_commande;
    DROP TABLE IF EXISTS devis_historique;
    DROP TABLE IF EXISTS devis_champs_personnalises;
    DROP TABLE IF EXISTS devis_lignes;
    DROP TABLE IF EXISTS devis;
    DROP TABLE IF EXISTS champs_personnalises_templates;
    DROP TABLE IF EXISTS catalogue_produits;
    DROP SEQUENCE IF EXISTS devis_numero_seq;
    DROP SEQUENCE IF EXISTS bon_commande_numero_seq;
  `);
}
