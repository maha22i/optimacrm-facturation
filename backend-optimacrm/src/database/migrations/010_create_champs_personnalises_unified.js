export const name = '010_create_champs_personnalises_unified';

export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS champs_personnalises_config (
      id              SERIAL PRIMARY KEY,
      entite          VARCHAR(30) NOT NULL,
      section         VARCHAR(100) NOT NULL,
      section_ordre   INTEGER NOT NULL DEFAULT 0,
      label           VARCHAR(255) NOT NULL,
      cle             VARCHAR(100) NOT NULL,
      type            VARCHAR(10) NOT NULL DEFAULT 'TEXTE',
      valeur_defaut   TEXT,
      options_liste   JSONB,
      obligatoire     BOOLEAN NOT NULL DEFAULT false,
      ordre           INTEGER NOT NULL DEFAULT 0,
      actif           BOOLEAN NOT NULL DEFAULT true,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT champs_config_entite_check CHECK (
        entite IN ('CLIENT', 'DEVIS', 'CATALOGUE')
      ),
      CONSTRAINT champs_config_type_check CHECK (
        type IN ('TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN')
      ),
      CONSTRAINT champs_config_entite_cle_unique UNIQUE (entite, cle)
    );

    CREATE INDEX IF NOT EXISTS idx_champs_config_entite ON champs_personnalises_config (entite);
    CREATE INDEX IF NOT EXISTS idx_champs_config_entite_section ON champs_personnalises_config (entite, section);

    CREATE TABLE IF NOT EXISTS champs_personnalises_valeurs (
      id              SERIAL PRIMARY KEY,
      config_id       INTEGER NOT NULL REFERENCES champs_personnalises_config(id) ON DELETE CASCADE,
      entite_id       INTEGER NOT NULL,
      valeur          TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT champs_valeurs_unique UNIQUE (config_id, entite_id)
    );

    CREATE INDEX IF NOT EXISTS idx_champs_valeurs_config ON champs_personnalises_valeurs (config_id);
    CREATE INDEX IF NOT EXISTS idx_champs_valeurs_entite ON champs_personnalises_valeurs (entite_id);
    CREATE INDEX IF NOT EXISTS idx_champs_valeurs_config_entite ON champs_personnalises_valeurs (config_id, entite_id);
  `);
}

export async function down(client) {
  await client.query(`
    DROP TABLE IF EXISTS champs_personnalises_valeurs;
    DROP TABLE IF EXISTS champs_personnalises_config;
  `);
}
