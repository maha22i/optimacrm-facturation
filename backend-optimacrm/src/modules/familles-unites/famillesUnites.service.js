import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

// ── Familles ─────────────────────────────────────────────────────────────────

export async function listFamilles({ actif } = {}) {
  const conditions = [];
  const params = [];
  let i = 1;

  if (actif !== undefined) {
    conditions.push(`f.actif = $${i++}`);
    params.push(actif === 'true' || actif === true);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT f.id, f.nom, f.categorie, f.description, f.actif, f.created_at, f.updated_at,
            COALESCE(p.nb, 0)::int AS nb_produits
     FROM familles_produits f
     LEFT JOIN (SELECT famille_id, COUNT(*) AS nb FROM catalogue_produits GROUP BY famille_id) p ON p.famille_id = f.id
     ${where}
     ORDER BY f.nom`,
    params
  );
  return result.rows;
}

export async function createFamille(data) {
  const result = await query(
    `INSERT INTO familles_produits (nom, categorie, description)
     VALUES ($1, $2, $3)
     RETURNING id, nom, categorie, description, actif, created_at, updated_at`,
    [data.nom, data.categorie, data.description || null]
  );
  return { ...result.rows[0], nb_produits: 0 };
}

export async function updateFamille(id, data) {
  const existing = await query('SELECT id FROM familles_produits WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Famille non trouvée');

  const allowedFields = ['nom', 'categorie', 'description', 'actif'];
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
    `UPDATE familles_produits SET ${sets.join(', ')} WHERE id = $${i}
     RETURNING id, nom, categorie, description, actif, created_at, updated_at`,
    vals
  );
  return result.rows[0];
}

export async function deleteFamille(id) {
  const prodCount = await query('SELECT COUNT(*)::int AS count FROM catalogue_produits WHERE famille_id = $1', [id]);
  if (prodCount.rows[0].count > 0) {
    throw ApiError.conflict(`Impossible de supprimer cette famille : ${prodCount.rows[0].count} produit(s) y sont liés`);
  }

  const result = await query('DELETE FROM familles_produits WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) throw ApiError.notFound('Famille non trouvée');
  return { id };
}

// ── Unités ───────────────────────────────────────────────────────────────────

export async function listUnites() {
  const result = await query(
    `SELECT u.id, u.nom, u.actif,
            (SELECT COUNT(*)::int FROM catalogue_produits WHERE unite = u.nom) AS nb_produits
     FROM unites u
     WHERE u.actif = true
     ORDER BY u.nom`
  );
  return result.rows;
}

export async function createUnite(data) {
  const dup = await query('SELECT id FROM unites WHERE nom = $1', [data.nom.toLowerCase().trim()]);
  if (dup.rows.length > 0) throw ApiError.conflict('Cette unité existe déjà');

  const result = await query(
    'INSERT INTO unites (nom) VALUES ($1) RETURNING id, nom, actif',
    [data.nom.toLowerCase().trim()]
  );
  return { ...result.rows[0], nb_produits: 0 };
}

export async function deleteUnite(id) {
  const existing = await query('SELECT nom FROM unites WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Unité non trouvée');

  const prodCount = await query('SELECT COUNT(*)::int AS count FROM catalogue_produits WHERE unite = $1', [existing.rows[0].nom]);
  if (prodCount.rows[0].count > 0) {
    throw ApiError.conflict(`Impossible de supprimer cette unité : ${prodCount.rows[0].count} produit(s) l'utilisent`);
  }

  await query('DELETE FROM unites WHERE id = $1', [id]);
  return { id };
}
