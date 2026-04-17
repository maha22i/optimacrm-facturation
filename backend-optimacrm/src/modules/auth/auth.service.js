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
  const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
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

  const permResult = await query(
    'SELECT permission FROM user_permissions WHERE user_id = $1',
    [user.id],
  );

  const token = generateToken(user.id, user.role);
  const safeUser = omitPassword(user);
  safeUser.permissions = permResult.rows.map(r => r.permission);
  return { user: safeUser, token };
}

// ---------------------------------------------------------------------------
// Authenticated user
// ---------------------------------------------------------------------------

export async function getProfile(userId) {
  const [userResult, permResult] = await Promise.all([
    query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [userId]),
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

export async function createUser({ email, password, first_name, last_name, role = 'user' }) {
  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    throw ApiError.conflict('Email already registered');
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await query(
    `INSERT INTO users (email, password, first_name, last_name, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${USER_FIELDS}`,
    [email.toLowerCase(), hashed, first_name, last_name, role],
  );

  return result.rows[0];
}

export async function getAllUsers(page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  const [usersRes, countRes] = await Promise.all([
    query(`SELECT ${USER_FIELDS} FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    query('SELECT COUNT(*)::int AS total FROM users'),
  ]);

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

export async function deleteUser(id) {
  const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) throw ApiError.notFound('User not found');
}
