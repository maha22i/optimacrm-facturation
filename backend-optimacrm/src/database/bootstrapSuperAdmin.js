import bcrypt from 'bcryptjs';
import { pool, query } from '../config/database.js';

// Même valeur que SALT_ROUNDS dans auth.service.js — garder ces deux
// constantes synchronisées si l'une des deux change un jour.
const SALT_ROUNDS = 12;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Crée le premier super_admin (tenant_id NULL, rôle cross-tenant).
 *
 * Idempotent : si un super_admin existe déjà (n'importe lequel), le script
 * n'en crée pas un second et sort proprement sans erreur — il n'y a jamais
 * besoin de plus d'un point d'entrée "bootstrap" une fois le portail
 * super-admin en place (la création de super_admin supplémentaires devra
 * passer par ce portail, pas par ce script).
 *
 * Rôle Postgres attendu : optimacrm_app (le rôle applicatif normal).
 * Ce script ne fait que du DML (SELECT + INSERT) sur `users` — pas besoin
 * du rôle `postgres` réservé aux migrations (DDL). L'INSERT passe sous la
 * clause d'échappement de la policy RLS de `users` (069_rls_users) : aucun
 * contexte tenant n'est jamais posé sur cette connexion (pas de
 * runWithTenantContext ici), donc NULLIF(current_setting(...), '') IS NULL
 * est vrai et le WITH CHECK est satisfait quel que soit tenant_id = NULL.
 */
export async function bootstrapSuperAdmin(email, password) {
  if (!email || !EMAIL_RE.test(email)) {
    throw new Error('Email invalide ou manquant');
  }
  if (!password || password.length < 8) {
    throw new Error('Mot de passe manquant ou trop court (8 caractères minimum)');
  }

  const existingSuperAdmin = await query(
    `SELECT id, email FROM users WHERE role = 'super_admin' LIMIT 1`,
  );
  if (existingSuperAdmin.rows.length > 0) {
    console.log(
      `⚠ Un super_admin existe déjà (${existingSuperAdmin.rows[0].email}, id=${existingSuperAdmin.rows[0].id}) — aucune action effectuée.`,
    );
    return null;
  }

  const existingEmail = await query('SELECT id FROM users WHERE email = $1', [
    email.toLowerCase(),
  ]);
  if (existingEmail.rows.length > 0) {
    throw new Error(`L'email ${email} est déjà utilisé par un autre utilisateur`);
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await query(
    `INSERT INTO users (email, password, first_name, last_name, role, tenant_id)
     VALUES ($1, $2, 'Super', 'Admin', 'super_admin', NULL)
     RETURNING id, email, role`,
    [email.toLowerCase(), hashed],
  );

  const created = result.rows[0];
  console.log(`✓ Super-admin créé : ${created.email} (id=${created.id})`);
  return created;
}

// Permet de lancer le script manuellement via :
//   node --env-file=.env src/database/bootstrapSuperAdmin.js <email> <password>
// (même garde d'auto-exécution CLI que migrate.js, cf. runMigrations())
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , email, password] = process.argv;

  if (!email || !password) {
    console.error('Usage: node src/database/bootstrapSuperAdmin.js <email> <password>');
    process.exit(1);
  }

  bootstrapSuperAdmin(email, password)
    .then(() => pool.end())
    .then(() => {
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('✗ Bootstrap super-admin failed:', error.message);
      await pool.end();
      process.exit(1);
    });
}
