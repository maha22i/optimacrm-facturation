export const name = '027_add_email_template_devis';

export async function up(client) {
  await client.query(`
    ALTER TABLE email_config
      ADD COLUMN IF NOT EXISTS template_devis_sujet TEXT DEFAULT 'Votre devis {{numero}} - {{societe}}',
      ADD COLUMN IF NOT EXISTS template_devis_corps TEXT DEFAULT 'Bonjour,

Veuillez trouver ci-joint notre devis pour un montant de {{montant_ttc}} TTC (valable jusqu''au {{date_validite}}).

Cordialement,
{{societe}}';
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE email_config
      DROP COLUMN IF EXISTS template_devis_sujet,
      DROP COLUMN IF EXISTS template_devis_corps;
  `);
}
