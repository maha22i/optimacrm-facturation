export const name = '025_create_email_config';

export async function up(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS email_config (
      id                      SERIAL PRIMARY KEY,
      smtp_host               VARCHAR(255),
      smtp_port               INTEGER DEFAULT 587,
      smtp_secure             BOOLEAN DEFAULT false,
      smtp_user               VARCHAR(255),
      smtp_password           TEXT,
      smtp_from_name          VARCHAR(255),
      smtp_from_email         VARCHAR(255),
      reply_to_email          VARCHAR(255),
      signature               TEXT,
      template_facture_sujet  TEXT DEFAULT 'Votre facture {{numero}} - {{societe}}',
      template_facture_corps  TEXT DEFAULT 'Bonjour,

Veuillez trouver ci-joint un montant de {{montant_ttc}} TTC.

    échéance : {{date_echeance}}

Cordialement,
{{societe}}',
      est_configure           BOOLEAN DEFAULT false,
      derniere_verification   TIMESTAMP,
      created_at              TIMESTAMP DEFAULT NOW(),
      updated_at              TIMESTAMP DEFAULT NOW()
    );

    INSERT INTO email_config (id) VALUES (1) ON CONFLICT DO NOTHING;

    CREATE TABLE IF NOT EXISTS email_logs (
      id                SERIAL PRIMARY KEY,
      type_document     VARCHAR(50),
      document_id       INTEGER,
      document_numero   VARCHAR(50),
      destinataire      VARCHAR(255),
      sujet             TEXT,
      statut            VARCHAR(20) DEFAULT 'envoyé',
      message_erreur    TEXT,
      created_at        TIMESTAMP DEFAULT NOW()
    );
  `);
}

export async function down(client) {
  await client.query('DROP TABLE IF EXISTS email_logs');
  await client.query('DROP TABLE IF EXISTS email_config');
}
