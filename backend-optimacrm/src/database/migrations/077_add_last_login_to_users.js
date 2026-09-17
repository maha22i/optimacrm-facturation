export const name = '077_add_last_login_to_users';

// ---------------------------------------------------------------------------
// Horodatage de dernière connexion, affiché dans le portail super-admin
// (tableau des utilisateurs d'un tenant). Mis à jour dans auth.service.js#login
// une fois toutes les vérifications passées (compte actif, mot de passe
// valide, tenant non suspendu) — jamais sur une tentative échouée.
// ---------------------------------------------------------------------------

export async function up(client) {
  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ
  `);
}

export async function down(client) {
  await client.query(`
    ALTER TABLE users
    DROP COLUMN IF EXISTS last_login_at
  `);
}
