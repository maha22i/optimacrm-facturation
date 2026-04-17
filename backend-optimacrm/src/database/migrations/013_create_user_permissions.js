export const name = '013_create_user_permissions';

export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id          SERIAL PRIMARY KEY,
      user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission  VARCHAR(50) NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT user_permissions_unique UNIQUE (user_id, permission)
    );

    CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions (user_id);
  `);
}

export async function down(client) {
  await client.query(`
    DROP TABLE IF EXISTS user_permissions;
  `);
}
