import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { bucket, isFirebaseReady } from '../../config/firebase.js';
import fs from 'fs/promises';
import path from 'path';

const FIELDS = `m.id, m.nom, m.logo_url, m.site_web, m.notes, m.actif, m.created_at, m.updated_at`;

export async function list({ search, actif }) {
  const conditions = [];
  const params = [];
  let i = 1;

  if (actif !== undefined) {
    conditions.push(`m.actif = $${i++}`);
    params.push(actif === 'true' || actif === true);
  }
  if (search) {
    conditions.push(`m.nom ILIKE $${i}`);
    params.push(`%${search}%`);
    i++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT ${FIELDS}, COALESCE(p.nb, 0)::int AS nb_produits
     FROM marques m
     LEFT JOIN (SELECT marque_id, COUNT(*) AS nb FROM catalogue_produits GROUP BY marque_id) p ON p.marque_id = m.id
     ${where}
     ORDER BY m.nom`,
    params
  );

  return result.rows;
}

export async function getById(id) {
  const result = await query(
    `SELECT ${FIELDS}, COALESCE(p.nb, 0)::int AS nb_produits
     FROM marques m
     LEFT JOIN (SELECT marque_id, COUNT(*) AS nb FROM catalogue_produits GROUP BY marque_id) p ON p.marque_id = m.id
     WHERE m.id = $1`,
    [id]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Marque non trouvée');
  return result.rows[0];
}

export async function create(data) {
  const dup = await query('SELECT id FROM marques WHERE nom = $1', [data.nom]);
  if (dup.rows.length > 0) throw ApiError.conflict('Une marque avec ce nom existe déjà');

  const result = await query(
    `INSERT INTO marques (nom, site_web, notes) VALUES ($1, $2, $3) RETURNING ${FIELDS.replace(/m\./g, '')}`,
    [data.nom, data.site_web || null, data.notes || null]
  );
  return { ...result.rows[0], nb_produits: 0 };
}

export async function update(id, data) {
  const existing = await query('SELECT id FROM marques WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Marque non trouvée');

  if (data.nom) {
    const dup = await query('SELECT id FROM marques WHERE nom = $1 AND id != $2', [data.nom, id]);
    if (dup.rows.length > 0) throw ApiError.conflict('Une marque avec ce nom existe déjà');
  }

  const allowedFields = ['nom', 'site_web', 'notes', 'actif'];
  const sets = [];
  const vals = [];
  let i = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${i++}`);
      vals.push(data[field] === '' ? null : data[field]);
    }
  }

  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  sets.push('updated_at = NOW()');
  vals.push(id);

  const result = await query(
    `UPDATE marques SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${FIELDS.replace(/m\./g, '')}`,
    vals
  );
  return result.rows[0];
}

export async function softDelete(id) {
  const prodCount = await query('SELECT COUNT(*)::int AS count FROM catalogue_produits WHERE marque_id = $1', [id]);
  if (prodCount.rows[0].count > 0) {
    throw ApiError.conflict(`Impossible de désactiver cette marque : ${prodCount.rows[0].count} produit(s) y sont liés`);
  }

  const result = await query(
    `UPDATE marques SET actif = false, updated_at = NOW() WHERE id = $1 RETURNING ${FIELDS.replace(/m\./g, '')}`,
    [id]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Marque non trouvée');
  return result.rows[0];
}

// ── Logo upload ──────────────────────────────────────────────────────────────

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.svg'];
const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

async function deleteOldLogo(logoUrl) {
  if (!logoUrl) return;

  if (logoUrl.startsWith('http') && isFirebaseReady()) {
    try {
      const u = new URL(logoUrl);
      const encoded = u.pathname.split('/o/')[1]?.split('?')[0];
      const fbPath = encoded ? decodeURIComponent(encoded) : null;
      if (fbPath) await bucket.file(fbPath).delete().catch(() => {});
    } catch { /* ignore */ }
  } else if (logoUrl.startsWith('/uploads/')) {
    const localPath = path.resolve('uploads', logoUrl.replace(/^\/uploads\//, ''));
    await fs.unlink(localPath).catch(() => {});
  }
}

export async function uploadLogo(id, file) {
  const existing = await query('SELECT id, logo_url FROM marques WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Marque non trouvée');

  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    throw ApiError.badRequest('Format non supporté. Formats acceptés : JPG, PNG, SVG');
  }
  if (file.size > 2 * 1024 * 1024) {
    throw ApiError.badRequest('Le fichier ne doit pas dépasser 2 Mo');
  }

  await deleteOldLogo(existing.rows[0].logo_url);

  const filename = `marque-${id}-${Date.now()}${ext}`;
  let logoUrl;

  if (isFirebaseReady()) {
    const firebaseFile = bucket.file(`logos/marques/${filename}`);
    await firebaseFile.save(file.buffer, {
      metadata: { contentType: MIME_MAP[ext] || 'application/octet-stream' },
      public: true,
    });
    logoUrl = `https://storage.googleapis.com/${bucket.name}/logos/marques/${filename}`;
  } else {
    await fs.mkdir(path.resolve('uploads/logos/marques'), { recursive: true });
    await fs.writeFile(path.resolve('uploads/logos/marques', filename), file.buffer);
    logoUrl = `/uploads/logos/marques/${filename}`;
  }

  await query('UPDATE marques SET logo_url = $1, updated_at = NOW() WHERE id = $2', [logoUrl, id]);
  return { logo_url: logoUrl };
}
