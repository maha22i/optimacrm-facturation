export const name = '002_create_clients';

export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id                        SERIAL PRIMARY KEY,
      numero_client             VARCHAR(10) UNIQUE NOT NULL,
      raison_sociale            VARCHAR(255) NOT NULL,
      forme_juridique           VARCHAR(30) NOT NULL DEFAULT 'SARL',
      siret                     VARCHAR(14) UNIQUE,
      siren                     VARCHAR(9),
      tva_intracommunautaire    VARCHAR(20),
      code_ape                  VARCHAR(10),
      site_web                  VARCHAR(255),
      telephone_principal       VARCHAR(20),
      email_principal           VARCHAR(255) NOT NULL,
      email_comptabilite        VARCHAR(255),
      statut                    VARCHAR(15) NOT NULL DEFAULT 'ACTIF',
      blocage_raison            TEXT,
      remise_globale            DECIMAL(5,2) NOT NULL DEFAULT 0,
      taux_tva_defaut           DECIMAL(4,1) NOT NULL DEFAULT 20,
      devise                    VARCHAR(5) NOT NULL DEFAULT 'EUR',
      plafond_encours           DECIMAL(12,2),
      delai_paiement            VARCHAR(25) NOT NULL DEFAULT '30_JOURS',
      mode_paiement_prefere     VARCHAR(20),
      iban                      VARCHAR(34),
      bic                       VARCHAR(11),
      reference_mandat_sepa     VARCHAR(35),
      date_mandat_sepa          DATE,
      notes                     TEXT,
      created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT clients_forme_juridique_check CHECK (
        forme_juridique IN ('SARL','SAS','EURL','SA','SCI','AUTO_ENTREPRENEUR','ASSOCIATION','AUTRE')
      ),
      CONSTRAINT clients_statut_check CHECK (
        statut IN ('ACTIF','INACTIF','BLOQUE','PROSPECT')
      ),
      CONSTRAINT clients_taux_tva_check CHECK (
        taux_tva_defaut IN (20, 10, 5.5, 0)
      ),
      CONSTRAINT clients_delai_paiement_check CHECK (
        delai_paiement IN ('COMPTANT','15_JOURS','30_JOURS','45_JOURS_FIN_MOIS','60_JOURS')
      ),
      CONSTRAINT clients_mode_paiement_check CHECK (
        mode_paiement_prefere IS NULL OR mode_paiement_prefere IN ('VIREMENT','PRELEVEMENT_SEPA','CHEQUE','CARTE','ESPECES')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_clients_numero ON clients (numero_client);
    CREATE INDEX IF NOT EXISTS idx_clients_raison_sociale ON clients (raison_sociale);
    CREATE INDEX IF NOT EXISTS idx_clients_statut ON clients (statut);
    CREATE INDEX IF NOT EXISTS idx_clients_email ON clients (email_principal);
    CREATE INDEX IF NOT EXISTS idx_clients_siret ON clients (siret);

    CREATE TABLE IF NOT EXISTS client_adresses (
      id          SERIAL PRIMARY KEY,
      client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      type        VARCHAR(15) NOT NULL DEFAULT 'FACTURATION',
      est_defaut  BOOLEAN NOT NULL DEFAULT false,
      ligne1      VARCHAR(255) NOT NULL,
      ligne2      VARCHAR(255),
      code_postal VARCHAR(10) NOT NULL,
      ville       VARCHAR(100) NOT NULL,
      pays        VARCHAR(60) NOT NULL DEFAULT 'France',
      label       VARCHAR(100),

      CONSTRAINT client_adresses_type_check CHECK (
        type IN ('FACTURATION','LIVRAISON','SIEGE')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_client_adresses_client ON client_adresses (client_id);

    CREATE TABLE IF NOT EXISTS client_contacts (
      id            SERIAL PRIMARY KEY,
      client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      role          VARCHAR(15) NOT NULL DEFAULT 'PRINCIPAL',
      nom           VARCHAR(100) NOT NULL,
      prenom        VARCHAR(100) NOT NULL,
      fonction      VARCHAR(100),
      telephone     VARCHAR(20),
      mobile        VARCHAR(20),
      email         VARCHAR(255),
      est_principal BOOLEAN NOT NULL DEFAULT false,

      CONSTRAINT client_contacts_role_check CHECK (
        role IN ('PRINCIPAL','COMPTABILITE','TECHNIQUE','AUTRE')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON client_contacts (client_id);

    CREATE TABLE IF NOT EXISTS client_documents (
      id          SERIAL PRIMARY KEY,
      client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      nom         VARCHAR(255) NOT NULL,
      type        VARCHAR(20) NOT NULL DEFAULT 'AUTRE',
      url         VARCHAR(500) NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT client_documents_type_check CHECK (
        type IN ('CONTRAT','RIB','MANDAT_SEPA','BON_COMMANDE','AUTRE')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_client_documents_client ON client_documents (client_id);

    CREATE SEQUENCE IF NOT EXISTS client_numero_seq START WITH 1;
  `);
}

export async function down(client) {
  await client.query(`
    DROP TABLE IF EXISTS client_documents;
    DROP TABLE IF EXISTS client_contacts;
    DROP TABLE IF EXISTS client_adresses;
    DROP TABLE IF EXISTS clients;
    DROP SEQUENCE IF EXISTS client_numero_seq;
  `);
}
