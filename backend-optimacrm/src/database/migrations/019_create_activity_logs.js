export const name = '019_create_activity_logs';

export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id              SERIAL PRIMARY KEY,
      user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
      user_nom        VARCHAR(255),
      action          VARCHAR(50) NOT NULL,
      module          VARCHAR(50) NOT NULL,
      description     TEXT NOT NULL,
      entity_type     VARCHAR(50),
      entity_id       INTEGER,
      entity_label    VARCHAR(255),
      details         JSONB DEFAULT '{}',
      statut          VARCHAR(20) DEFAULT 'succes',
      ip_address      VARCHAR(45),
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_module   ON activity_logs(module)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_action   ON activity_logs(action)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_user     ON activity_logs(user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_created  ON activity_logs(created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_activity_logs_entity   ON activity_logs(entity_type, entity_id)`);
}

export async function down(client) {
  await client.query(`DROP TABLE IF EXISTS activity_logs`);
}
