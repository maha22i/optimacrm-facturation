export const name = '012_create_import_tables';

export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS import_logs (
      id              SERIAL PRIMARY KEY,
      entity_type     VARCHAR(30) NOT NULL,
      filename        VARCHAR(500),
      total_rows      INTEGER NOT NULL DEFAULT 0,
      success_count   INTEGER NOT NULL DEFAULT 0,
      error_count     INTEGER NOT NULL DEFAULT 0,
      skipped_count   INTEGER NOT NULL DEFAULT 0,
      mapping_used    JSONB,
      options_used    JSONB,
      errors_detail   JSONB,
      created_by      UUID REFERENCES users(id),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_import_logs_entity ON import_logs (entity_type);
    CREATE INDEX IF NOT EXISTS idx_import_logs_created ON import_logs (created_at DESC);

    CREATE TABLE IF NOT EXISTS import_mappings_saved (
      id              SERIAL PRIMARY KEY,
      entity_type     VARCHAR(30) NOT NULL,
      name            VARCHAR(255) NOT NULL,
      mapping         JSONB NOT NULL,
      created_by      UUID REFERENCES users(id),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT import_mappings_entity_name_unique UNIQUE (entity_type, name)
    );

    CREATE INDEX IF NOT EXISTS idx_import_mappings_entity ON import_mappings_saved (entity_type);
  `);
}

export async function down(client) {
  await client.query(`
    DROP TABLE IF EXISTS import_mappings_saved;
    DROP TABLE IF EXISTS import_logs;
  `);
}
