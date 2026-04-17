import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

const FIELDS = `id, label, cle, type, valeur_defaut, options_liste, categorie, actif, afficher_sur_pdf, created_at, updated_at`;

export async function listTemplates({ categorie, actif }) {
  const conditions = [];
  const params = [];
  let i = 1;

  if (actif !== undefined) {
    conditions.push(`actif = $${i++}`);
    params.push(actif === 'true' || actif === true);
  }
  if (categorie) {
    conditions.push(`categorie = $${i++}`);
    params.push(categorie);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT ${FIELDS} FROM champs_personnalises_templates ${where} ORDER BY categorie, label`,
    params
  );
  return result.rows;
}

export async function getCategories() {
  const result = await query(
    'SELECT DISTINCT categorie FROM champs_personnalises_templates ORDER BY categorie'
  );
  return result.rows.map(r => r.categorie);
}

export async function getTemplateById(id) {
  const result = await query(`SELECT ${FIELDS} FROM champs_personnalises_templates WHERE id = $1`, [id]);
  if (result.rows.length === 0) throw ApiError.notFound('Template non trouvé');
  return result.rows[0];
}

export async function createTemplate(data) {
  const dupCle = await query('SELECT id FROM champs_personnalises_templates WHERE cle = $1', [data.cle]);
  if (dupCle.rows.length > 0) throw ApiError.conflict('Un template avec cette clé existe déjà');

  const result = await query(
    `INSERT INTO champs_personnalises_templates (label, cle, type, valeur_defaut, options_liste, categorie, afficher_sur_pdf)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${FIELDS}`,
    [
      data.label,
      data.cle,
      data.type || 'TEXTE',
      data.valeur_defaut || null,
      data.options_liste ? JSON.stringify(data.options_liste) : null,
      data.categorie || 'Général',
      data.afficher_sur_pdf ?? true,
    ]
  );
  return result.rows[0];
}

export async function updateTemplate(id, data) {
  const existing = await query('SELECT id FROM champs_personnalises_templates WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Template non trouvé');

  if (data.cle) {
    const dup = await query('SELECT id FROM champs_personnalises_templates WHERE cle = $1 AND id != $2', [data.cle, id]);
    if (dup.rows.length > 0) throw ApiError.conflict('Un template avec cette clé existe déjà');
  }

  const allowedFields = ['label', 'cle', 'type', 'valeur_defaut', 'options_liste', 'categorie', 'actif', 'afficher_sur_pdf'];
  const sets = [];
  const vals = [];
  let i = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${i++}`);
      vals.push(field === 'options_liste' ? JSON.stringify(data[field]) : data[field]);
    }
  }

  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  sets.push('updated_at = NOW()');
  vals.push(id);

  const result = await query(
    `UPDATE champs_personnalises_templates SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${FIELDS}`,
    vals
  );
  return result.rows[0];
}

export async function deleteTemplate(id) {
  const result = await query(
    'DELETE FROM champs_personnalises_templates WHERE id = $1 RETURNING id',
    [id]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Template non trouvé');
}
