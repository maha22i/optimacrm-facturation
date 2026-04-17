import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

const FIELDS = `id, nom, code, type, contact_nom, contact_prenom, contact_email, contact_telephone,
  adresse_ligne1, adresse_ligne2, code_postal, ville, pays, site_web,
  numero_compte_client, conditions_paiement, delai_livraison_jours, notes, actif, created_at, updated_at`;

export async function list({ page = 1, limit = 20, type, search, actif }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let i = 1;

  if (actif !== undefined) {
    conditions.push(`actif = $${i++}`);
    params.push(actif === 'true' || actif === true);
  }
  if (type) {
    conditions.push(`type = $${i++}`);
    params.push(type);
  }
  if (search) {
    conditions.push(`(nom ILIKE $${i} OR code ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [rows, countRes] = await Promise.all([
    query(`SELECT ${FIELDS} FROM fournisseurs ${where} ORDER BY nom LIMIT $${i} OFFSET $${i + 1}`, [...params, limit, offset]),
    query(`SELECT COUNT(*)::int AS total FROM fournisseurs ${where}`, params),
  ]);

  return {
    fournisseurs: rows.rows,
    pagination: { page, limit, total: countRes.rows[0].total, totalPages: Math.ceil(countRes.rows[0].total / limit) },
  };
}

export async function getById(id) {
  const result = await query(`SELECT ${FIELDS} FROM fournisseurs WHERE id = $1`, [id]);
  if (result.rows.length === 0) throw ApiError.notFound('Fournisseur non trouvé');
  return result.rows[0];
}

export async function create(data) {
  const dup = await query('SELECT id FROM fournisseurs WHERE nom = $1', [data.nom]);
  if (dup.rows.length > 0) throw ApiError.conflict('Un fournisseur avec ce nom existe déjà');

  if (data.code) {
    const dupCode = await query('SELECT id FROM fournisseurs WHERE code = $1', [data.code]);
    if (dupCode.rows.length > 0) throw ApiError.conflict('Ce code fournisseur est déjà utilisé');
  }

  const result = await query(
    `INSERT INTO fournisseurs (nom, code, type, contact_nom, contact_prenom, contact_email, contact_telephone,
      adresse_ligne1, adresse_ligne2, code_postal, ville, pays, site_web,
      numero_compte_client, conditions_paiement, delai_livraison_jours, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING ${FIELDS}`,
    [
      data.nom,
      data.code || null,
      data.type || 'FOURNISSEUR',
      data.contact_nom || null,
      data.contact_prenom || null,
      data.contact_email || null,
      data.contact_telephone || null,
      data.adresse_ligne1 || null,
      data.adresse_ligne2 || null,
      data.code_postal || null,
      data.ville || null,
      data.pays || 'France',
      data.site_web || null,
      data.numero_compte_client || null,
      data.conditions_paiement || null,
      data.delai_livraison_jours != null ? parseInt(data.delai_livraison_jours) : null,
      data.notes || null,
    ]
  );
  return result.rows[0];
}

export async function update(id, data) {
  const existing = await query('SELECT id FROM fournisseurs WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Fournisseur non trouvé');

  if (data.nom) {
    const dup = await query('SELECT id FROM fournisseurs WHERE nom = $1 AND id != $2', [data.nom, id]);
    if (dup.rows.length > 0) throw ApiError.conflict('Un fournisseur avec ce nom existe déjà');
  }
  if (data.code) {
    const dup = await query('SELECT id FROM fournisseurs WHERE code = $1 AND id != $2', [data.code, id]);
    if (dup.rows.length > 0) throw ApiError.conflict('Ce code fournisseur est déjà utilisé');
  }

  const allowedFields = [
    'nom', 'code', 'type', 'contact_nom', 'contact_prenom', 'contact_email', 'contact_telephone',
    'adresse_ligne1', 'adresse_ligne2', 'code_postal', 'ville', 'pays', 'site_web',
    'numero_compte_client', 'conditions_paiement', 'delai_livraison_jours', 'notes', 'actif',
  ];
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
    `UPDATE fournisseurs SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${FIELDS}`,
    vals
  );
  return result.rows[0];
}

export async function softDelete(id) {
  const prodCount = await query('SELECT COUNT(*)::int AS count FROM catalogue_produits WHERE fournisseur_id = $1', [id]);
  if (prodCount.rows[0].count > 0) {
    throw ApiError.conflict(`Impossible de désactiver ce fournisseur : ${prodCount.rows[0].count} produit(s) y sont liés`);
  }

  const result = await query(
    `UPDATE fournisseurs SET actif = false, updated_at = NOW() WHERE id = $1 RETURNING ${FIELDS}`,
    [id]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Fournisseur non trouvé');
  return result.rows[0];
}
