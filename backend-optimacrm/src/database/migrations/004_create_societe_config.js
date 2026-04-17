export const name = '004_create_societe_config';

export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS societe_config (
      id                          INTEGER PRIMARY KEY DEFAULT 1,

      -- Identité légale
      raison_sociale              VARCHAR(255),
      forme_juridique             VARCHAR(30),
      siret                       VARCHAR(14),
      siren                       VARCHAR(9),
      tva_intracommunautaire      VARCHAR(20),
      code_ape                    VARCHAR(10),
      capital_social              DECIMAL(12,2),
      rcs_ville                   VARCHAR(100),
      numero_rcs                  VARCHAR(50),

      -- Coordonnées
      adresse_ligne1              VARCHAR(255),
      adresse_ligne2              VARCHAR(255),
      code_postal                 VARCHAR(10),
      ville                       VARCHAR(100),
      pays                        VARCHAR(100) NOT NULL DEFAULT 'France',
      telephone                   VARCHAR(20),
      email_contact               VARCHAR(255),
      email_facturation           VARCHAR(255),
      site_web                    VARCHAR(255),

      -- Apparence & documents
      logo_url                    VARCHAR(500),
      couleur_principale          VARCHAR(7) NOT NULL DEFAULT '#1E40AF',
      signature_email             TEXT,
      mentions_legales            TEXT,
      cgv                         TEXT,
      message_devis_defaut        TEXT,
      message_facture_defaut      TEXT,

      -- Informations bancaires
      banque_nom                  VARCHAR(100),
      iban                        VARCHAR(34),
      bic                         VARCHAR(11),

      -- Numérotation
      prefixe_devis               VARCHAR(6) NOT NULL DEFAULT 'DEV',
      prefixe_facture             VARCHAR(6) NOT NULL DEFAULT 'FAC',
      prefixe_client              VARCHAR(6) NOT NULL DEFAULT 'CLI',
      prefixe_bon_commande        VARCHAR(6) NOT NULL DEFAULT 'BC',
      remise_a_zero_annuelle      BOOLEAN NOT NULL DEFAULT true,

      updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by                  UUID REFERENCES users(id),

      -- Singleton: une seule ligne autorisée
      CONSTRAINT societe_config_singleton CHECK (id = 1),
      CONSTRAINT societe_forme_juridique_check CHECK (
        forme_juridique IS NULL OR forme_juridique IN (
          'SARL','SAS','EURL','SA','SCI','AUTO_ENTREPRENEUR','ASSOCIATION','AUTRE'
        )
      )
    );

    -- Insérer la ligne par défaut
    INSERT INTO societe_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
  `);
}

export async function down(client) {
  await client.query('DROP TABLE IF EXISTS societe_config');
}
