export const name = '076_add_password_reset_to_users';

// ---------------------------------------------------------------------------
// Réinitialisation de mot de passe self-service (portail client).
//
// Contrairement à l'ancien flow interne (JWT signé auto-porteur, jamais
// stocké côté serveur, donc non révocable avant son expiration 24h), ce flow
// public doit pouvoir être invalidé à tout moment : usage unique, expiration
// courte, et surtout aucune trace exploitable en cas de fuite de la base.
//
// D'où le choix : seul le hash SHA-256 du token envoyé par email est stocké
// (jamais le token en clair). Un attaquant avec un accès lecture à la base
// ne peut donc pas rejouer un lien de réinitialisation à partir de la
// colonne — il faudrait posséder le token original (256 bits, envoyé
// uniquement par email).
// ---------------------------------------------------------------------------

export async function up(client) {
  await client.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_reset_token_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ
  `);

  // Index unique partiel : accélère la recherche par hash lors de la
  // consommation du lien, tout en excluant les (très nombreuses) lignes où
  // la colonne est NULL. UNIQUE est une garde-fou défensive supplémentaire
  // (une collision SHA-256 est de toute façon computationnellement
  // infaisable) plutôt qu'une nécessité fonctionnelle.
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_password_reset_token_hash
    ON users (password_reset_token_hash)
    WHERE password_reset_token_hash IS NOT NULL
  `);
}

export async function down(client) {
  await client.query(`DROP INDEX IF EXISTS idx_users_password_reset_token_hash`);
  await client.query(`
    ALTER TABLE users
    DROP COLUMN IF EXISTS password_reset_token_hash,
    DROP COLUMN IF EXISTS password_reset_expires_at
  `);
}
