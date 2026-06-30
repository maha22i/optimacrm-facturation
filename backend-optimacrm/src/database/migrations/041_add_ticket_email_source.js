export const name = '041_add_ticket_email_source';

export async function up(client) {
  // ── Colonnes source email sur tickets (non destructif, ALTER uniquement) ──
  await client.query(`
    ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manuel',
      ADD COLUMN IF NOT EXISTS email_message_id TEXT,
      ADD COLUMN IF NOT EXISTS email_from TEXT,
      ADD COLUMN IF NOT EXISTS email_received_at TIMESTAMPTZ
  `);

  // Les tickets créés depuis un email peuvent ne pas être rapprochés d'un client
  await client.query(`
    ALTER TABLE tickets ALTER COLUMN client_id DROP NOT NULL
  `);

  // Déduplication par Message-ID (app mono-instance : pas de tenant_id dans le schéma)
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_tickets_email_msgid
      ON tickets (email_message_id)
      WHERE email_message_id IS NOT NULL
  `);

  // ── Config IMAP (singleton : une seule ligne, id=1, comme email_config) ──
  await client.query(`
    CREATE TABLE IF NOT EXISTS tenant_email_config (
      id                       INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      imap_host                TEXT,
      imap_port                INTEGER NOT NULL DEFAULT 993,
      imap_user                TEXT,
      imap_password_encrypted  TEXT,
      imap_tls                 BOOLEAN NOT NULL DEFAULT true,
      folder                   TEXT NOT NULL DEFAULT 'INBOX',
      actif                    BOOLEAN NOT NULL DEFAULT false,
      derniere_synchro         TIMESTAMPTZ,
      created_at               TIMESTAMPTZ DEFAULT NOW(),
      updated_at               TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    INSERT INTO tenant_email_config (id) VALUES (1) ON CONFLICT DO NOTHING
  `);
}

export async function down(client) {
  await client.query('DROP TABLE IF EXISTS tenant_email_config');
  await client.query('DROP INDEX IF EXISTS uniq_tickets_email_msgid');
  await client.query(`
    ALTER TABLE tickets
      DROP COLUMN IF EXISTS source,
      DROP COLUMN IF EXISTS email_message_id,
      DROP COLUMN IF EXISTS email_from,
      DROP COLUMN IF EXISTS email_received_at
  `);
}
