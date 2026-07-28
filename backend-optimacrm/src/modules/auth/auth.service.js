import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

const SALT_ROUNDS = 12;
const USER_FIELDS = 'id, email, first_name, last_name, role, is_active, created_at, updated_at';

function generateToken(userId, role) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
}

function omitPassword(user) {
  const { password, ...rest } = user;
  return rest;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export async function register({ email, password, first_name, last_name }) {
  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    throw ApiError.conflict('Email already registered');
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await query(
    `INSERT INTO users (email, password, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     RETURNING ${USER_FIELDS}`,
    [email.toLowerCase(), hashed, first_name, last_name],
  );

  const user = result.rows[0];
  user.permissions = [];
  const token = generateToken(user.id, user.role);
  return { user, token };
}

export async function login(email, password) {
  // LEFT JOIN (pas INNER) : tenant_id est NULL pour un super_admin — même
  // raisonnement que authenticate.js. tenant_statut vaut NULL pour lui, ce
  // qui désactive naturellement le contrôle de suspension ci-dessous.
  // modules_actifs n'est pas aliasé : `users` n'a pas de colonne de ce nom,
  // donc pas de collision avec le `u.*` — le champ atterrit directement
  // dans safeUser sous la clé attendue par le frontend (User.modules_actifs).
  const result = await query(
    `SELECT u.*, t.statut AS tenant_statut, t.modules_actifs
     FROM users u
     LEFT JOIN tenants t ON t.id = u.tenant_id
     WHERE u.email = $1`,
    [email.toLowerCase()],
  );
  if (result.rows.length === 0) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw ApiError.forbidden('Account is deactivated');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  // Avant login() ce contrôle n'existait qu'au niveau de authenticate.js :
  // la connexion réussissait (token émis) puis le tout premier appel
  // authentifié suivant échouait en 403. Corrigé ici pour ne jamais émettre
  // de token/cookie pour un compte dont le tenant est suspendu.
  //
  // Message EXACT identique à authenticate.js ('Compte suspendu') : c'est le
  // contrat de détection utilisé par le frontend (lib/api.ts) pour déclencher
  // l'écran de suspension dédié — ne jamais faire diverger ce texte entre les
  // deux emplacements.
  if (user.tenant_id && user.tenant_statut === 'suspendu') {
    throw ApiError.forbidden('Compte suspendu');
  }

  const permResult = await query(
    'SELECT permission FROM user_permissions WHERE user_id = $1',
    [user.id],
  );

  const token = generateToken(user.id, user.role);
  const safeUser = omitPassword(user);
  delete safeUser.tenant_statut; // champ de jointure, pas une colonne de `users`
  safeUser.permissions = permResult.rows.map(r => r.permission);
  return { user: safeUser, token };
}

// ---------------------------------------------------------------------------
// Authenticated user
// ---------------------------------------------------------------------------

export async function getProfile(userId) {
  // LEFT JOIN tenants pour exposer modules_actifs (filtrage de menu côté
  // frontend) — NULL pour un super_admin (tenant_id NULL), sans incidence.
  const [userResult, permResult] = await Promise.all([
    query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active,
              u.created_at, u.updated_at, t.modules_actifs
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [userId],
    ),
    query('SELECT permission FROM user_permissions WHERE user_id = $1', [userId]),
  ]);
  if (userResult.rows.length === 0) throw ApiError.notFound('User not found');
  const user = userResult.rows[0];
  user.permissions = permResult.rows.map(r => r.permission);
  return user;
}

export async function updateProfile(userId, data) {
  if (data.email) {
    const dup = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [
      data.email.toLowerCase(),
      userId,
    ]);
    if (dup.rows.length > 0) throw ApiError.conflict('Email already in use');
  }

  const sets = [];
  const vals = [];
  let i = 1;

  if (data.first_name !== undefined) { sets.push(`first_name = $${i++}`); vals.push(data.first_name); }
  if (data.last_name !== undefined)  { sets.push(`last_name = $${i++}`);  vals.push(data.last_name); }
  if (data.email !== undefined)      { sets.push(`email = $${i++}`);      vals.push(data.email.toLowerCase()); }

  if (sets.length === 0) throw ApiError.badRequest('No fields to update');

  sets.push('updated_at = NOW()');
  vals.push(userId);

  const result = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${USER_FIELDS}`,
    vals,
  );

  return result.rows[0];
}

export async function changePassword(userId, oldPassword, newPassword) {
  const result = await query('SELECT password FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) throw ApiError.notFound('User not found');

  const valid = await bcrypt.compare(oldPassword, result.rows[0].password);
  if (!valid) throw ApiError.unauthorized('Current password is incorrect');

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hashed, userId]);
}

// ---------------------------------------------------------------------------
// Admin — user management
// ---------------------------------------------------------------------------

export async function createUser({ email, password, first_name, last_name, role = 'user', tenant_id }) {
  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    throw ApiError.conflict('Email already registered');
  }

  // Cohérence avec la contrainte users_tenant_id_required_check
  // (role = 'super_admin' OR tenant_id IS NOT NULL) : on refuse ici plutôt
  // que de laisser Postgres renvoyer une erreur de contrainte opaque.
  // Défensif : le controller impose déjà cette règle côté acteur (req.user),
  // mais createUser() peut être appelé depuis d'autres call sites futurs.
  if (role !== 'super_admin' && !tenant_id) {
    throw ApiError.badRequest('tenant_id est requis pour créer un utilisateur non super_admin');
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await query(
    `INSERT INTO users (email, password, first_name, last_name, role, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${USER_FIELDS}`,
    [email.toLowerCase(), hashed, first_name, last_name, role, tenant_id ?? null],
  );

  const newUser = result.rows[0];

  const DEFAULT_PERMISSIONS = {
    admin_technique: [
      'tickets_read', 'tickets_write', 'tickets_admin', 'techniciens_manage',
      'clients_read', 'parc_read',
    ],
    technicien: [
      'tickets_read', 'tickets_write',
      'clients_read',
    ],
  };

  const defaultPerms = DEFAULT_PERMISSIONS[role];
  if (defaultPerms && defaultPerms.length > 0) {
    const placeholders = defaultPerms.map((_, idx) => `($1, $${idx + 2})`).join(', ');
    await query(
      `INSERT INTO user_permissions (user_id, permission) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      [newUser.id, ...defaultPerms],
    );
  }

  return newUser;
}

export async function getAllUsers(page = 1, limit = 20, roleFilter = null) {
  const offset = (page - 1) * limit;

  const params = [limit, offset];
  let whereClause = '';
  let countWhereClause = '';

  if (roleFilter) {
    whereClause = 'WHERE role = $3';
    countWhereClause = 'WHERE role = $1';
    params.push(roleFilter);
  }

  const usersRes = await query(`SELECT ${USER_FIELDS} FROM users ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, params);
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM users ${countWhereClause}`, roleFilter ? [roleFilter] : []);

  return {
    users: usersRes.rows,
    pagination: {
      page,
      limit,
      total: countRes.rows[0].total,
      totalPages: Math.ceil(countRes.rows[0].total / limit),
    },
  };
}

export async function getUserById(id) {
  const result = await query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [id]);
  if (result.rows.length === 0) throw ApiError.notFound('User not found');
  return result.rows[0];
}

export async function updateUser(id, data) {
  if (data.email) {
    const dup = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [
      data.email.toLowerCase(),
      id,
    ]);
    if (dup.rows.length > 0) throw ApiError.conflict('Email already in use');
  }

  const sets = [];
  const vals = [];
  let i = 1;

  if (data.first_name !== undefined) { sets.push(`first_name = $${i++}`); vals.push(data.first_name); }
  if (data.last_name !== undefined)  { sets.push(`last_name = $${i++}`);  vals.push(data.last_name); }
  if (data.email !== undefined)      { sets.push(`email = $${i++}`);      vals.push(data.email.toLowerCase()); }
  if (data.role !== undefined)       { sets.push(`role = $${i++}`);       vals.push(data.role); }
  if (data.is_active !== undefined)  { sets.push(`is_active = $${i++}`);  vals.push(data.is_active); }
  if (data.password !== undefined && data.password.trim().length >= 8) {
    const hashed = await bcrypt.hash(data.password, SALT_ROUNDS);
    sets.push(`password = $${i++}`);
    vals.push(hashed);
  }

  if (sets.length === 0) throw ApiError.badRequest('No fields to update');

  sets.push('updated_at = NOW()');
  vals.push(id);

  const result = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${USER_FIELDS}`,
    vals,
  );

  if (result.rows.length === 0) throw ApiError.notFound('User not found');
  return result.rows[0];
}

export async function generateResetToken(userId) {
  const userRes = await query('SELECT id, email, first_name, last_name FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) throw ApiError.notFound('User not found');

  const token = jwt.sign({ userId, purpose: 'reset' }, process.env.JWT_SECRET, { expiresIn: '24h' });
  return { user: userRes.rows[0], token };
}

export async function deleteUser(id) {
  const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) throw ApiError.notFound('User not found');
}
