export const name = '039_devis_signature_publique';

export async function up(client) {
  await client.query(`
    ALTER TABLE devis
      ADD COLUMN IF NOT EXISTS token_public          VARCHAR(64) UNIQUE,
      ADD COLUMN IF NOT EXISTS signataire_nom        VARCHAR(255),
      ADD COLUMN IF NOT EXISTS signataire_email      VARCHAR(255),
      ADD COLUMN IF NOT EXISTS email_verifie         BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS code_verification     VARCHAR(6),
      ADD COLUMN IF NOT EXISTS code_expiration       TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS date_envoi_signature  TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS user_agent_signature  TEXT;

    CREATE INDEX IF NOT EXISTS idx_devis_token_public ON devis (token_public);

    ALTER TABLE email_config
      ADD COLUMN IF NOT EXISTS template_devis_verif_sujet VARCHAR(500)
        DEFAULT 'Code de vérification pour signer le devis {{numero}}',
      ADD COLUMN IF NOT EXISTS template_devis_verif_corps TEXT
        DEFAULT 'Bonjour {{signataire}},

Pour signer le devis {{numero}}, voici votre code de vérification : {{code}}

Ce code est valable 15 minutes.

Cordialement,
{{societe}}',
      ADD COLUMN IF NOT EXISTS template_devis_signe_sujet VARCHAR(500)
        DEFAULT 'Confirmation de signature — Devis {{numero}}',
      ADD COLUMN IF NOT EXISTS template_devis_signe_corps TEXT
        DEFAULT 'Bonjour {{signataire}},

Nous confirmons la signature du devis {{numero}} d''un montant de {{montant_ttc}} TTC, le {{date_signature}}.

Vous trouverez le devis signé en pièce jointe.

Cordialement,
{{societe}}';
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE email_config
      DROP COLUMN IF EXISTS template_devis_verif_sujet,
      DROP COLUMN IF EXISTS template_devis_verif_corps,
      DROP COLUMN IF EXISTS template_devis_signe_sujet,
      DROP COLUMN IF EXISTS template_devis_signe_corps;

    DROP INDEX IF EXISTS idx_devis_token_public;

    ALTER TABLE devis
      DROP COLUMN IF EXISTS token_public,
      DROP COLUMN IF EXISTS signataire_nom,
      DROP COLUMN IF EXISTS signataire_email,
      DROP COLUMN IF EXISTS email_verifie,
      DROP COLUMN IF EXISTS code_verification,
      DROP COLUMN IF EXISTS code_expiration,
      DROP COLUMN IF EXISTS date_envoi_signature,
      DROP COLUMN IF EXISTS user_agent_signature;
  `);
}
