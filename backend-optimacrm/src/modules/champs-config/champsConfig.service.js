import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

const CONFIG_FIELDS = `id, entite, section, section_ordre, label, cle, type, valeur_defaut, options_liste, obligatoire, ordre, actif, created_at, updated_at`;

// ---------------------------------------------------------------------------
// CONFIG — CRUD (sections + champs)
// ---------------------------------------------------------------------------

export async function listConfigs({ entite, section, actif }) {
  const conditions = [];
  const params = [];
  let i = 1;

  if (entite) {
    conditions.push(`entite = $${i++}`);
    params.push(entite.toUpperCase());
  }
  if (section) {
    conditions.push(`section = $${i++}`);
    params.push(section);
  }
  if (actif !== undefined) {
    conditions.push(`actif = $${i++}`);
    params.push(actif === 'true' || actif === true);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT ${CONFIG_FIELDS} FROM champs_personnalises_config ${where} ORDER BY section_ordre, section, ordre, label`,
    params
  );
  return result.rows;
}

export async function getSections({ entite }) {
  const conditions = [];
  const params = [];
  let i = 1;

  if (entite) {
    conditions.push(`entite = $${i++}`);
    params.push(entite.toUpperCase());
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT DISTINCT entite, section, MIN(section_ordre) as section_ordre
     FROM champs_personnalises_config ${where}
     GROUP BY entite, section
     ORDER BY MIN(section_ordre), section`,
    params
  );
  return result.rows;
}

export async function getConfigById(id) {
  const result = await query(`SELECT ${CONFIG_FIELDS} FROM champs_personnalises_config WHERE id = $1`, [id]);
  if (result.rows.length === 0) throw ApiError.notFound('Champ personnalisé non trouvé');
  return result.rows[0];
}

const NATIVE_CONTRAT_KEYS = new Set([
  'numero_contrat', 'type_contrat', 'type_facturation', 'client_id',
  'periodicite', 'date_signature', 'date_installation', 'date_debut',
  'date_echeance', 'date_prochaine_facture', 'date_renouvellement',
  'duree_contrat_mois', 'numero_dossier_financement', 'organisme_credit',
  'montant_finance', 'loyer_ht', 'location_interne', 'statut',
  'ftc', 'ect', 'notes', 'devis_id', 'terme_facturation',
]);

export async function createConfig(data) {
  if (data.entite?.toUpperCase() === 'CONTRAT' && NATIVE_CONTRAT_KEYS.has(data.cle)) {
    throw ApiError.conflict(`La clé "${data.cle}" est réservée (colonne native du contrat). Choisissez un autre identifiant.`);
  }

  const dupCle = await query(
    'SELECT id FROM champs_personnalises_config WHERE entite = $1 AND cle = $2',
    [data.entite.toUpperCase(), data.cle]
  );
  if (dupCle.rows.length > 0) throw ApiError.conflict('Un champ avec cette clé existe déjà pour cette entité');

  let maxOrdre = 0;
  const ordreRes = await query(
    'SELECT COALESCE(MAX(ordre), 0) as max_ordre FROM champs_personnalises_config WHERE entite = $1 AND section = $2',
    [data.entite.toUpperCase(), data.section]
  );
  maxOrdre = ordreRes.rows[0].max_ordre + 1;

  let sectionOrdre = data.section_ordre;
  if (sectionOrdre === undefined || sectionOrdre === null) {
    const soRes = await query(
      'SELECT COALESCE(MAX(section_ordre), -1) as max_so FROM champs_personnalises_config WHERE entite = $1',
      [data.entite.toUpperCase()]
    );
    const existingSection = await query(
      'SELECT section_ordre FROM champs_personnalises_config WHERE entite = $1 AND section = $2 LIMIT 1',
      [data.entite.toUpperCase(), data.section]
    );
    sectionOrdre = existingSection.rows.length > 0
      ? existingSection.rows[0].section_ordre
      : soRes.rows[0].max_so + 1;
  }

  const result = await query(
    `INSERT INTO champs_personnalises_config (entite, section, section_ordre, label, cle, type, valeur_defaut, options_liste, obligatoire, ordre, actif)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${CONFIG_FIELDS}`,
    [
      data.entite.toUpperCase(),
      data.section,
      sectionOrdre,
      data.label,
      data.cle,
      data.type || 'TEXTE',
      data.valeur_defaut || null,
      data.options_liste ? JSON.stringify(data.options_liste) : null,
      data.obligatoire ?? false,
      data.ordre ?? maxOrdre,
      data.actif ?? true,
    ]
  );
  return result.rows[0];
}

export async function updateConfig(id, data) {
  const existing = await query('SELECT id, entite FROM champs_personnalises_config WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Champ personnalisé non trouvé');

  if (data.cle) {
    const entite = data.entite?.toUpperCase() || existing.rows[0].entite;
    const dup = await query(
      'SELECT id FROM champs_personnalises_config WHERE entite = $1 AND cle = $2 AND id != $3',
      [entite, data.cle, id]
    );
    if (dup.rows.length > 0) throw ApiError.conflict('Un champ avec cette clé existe déjà pour cette entité');
  }

  const allowedFields = ['section', 'section_ordre', 'label', 'cle', 'type', 'valeur_defaut', 'options_liste', 'obligatoire', 'ordre', 'actif'];
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
    `UPDATE champs_personnalises_config SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${CONFIG_FIELDS}`,
    vals
  );
  return result.rows[0];
}

export async function deleteConfig(id) {
  const result = await query(
    'DELETE FROM champs_personnalises_config WHERE id = $1 RETURNING id',
    [id]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Champ personnalisé non trouvé');
}

export async function updateSectionOrdre(entite, sections) {
  for (const s of sections) {
    await query(
      'UPDATE champs_personnalises_config SET section_ordre = $1, updated_at = NOW() WHERE entite = $2 AND section = $3',
      [s.ordre, entite.toUpperCase(), s.section]
    );
  }
}

export async function renameSection(entite, oldName, newName) {
  const result = await query(
    'UPDATE champs_personnalises_config SET section = $1, updated_at = NOW() WHERE entite = $2 AND section = $3 RETURNING id',
    [newName, entite.toUpperCase(), oldName]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Section non trouvée');
  return { updated: result.rows.length };
}

export async function deleteSection(entite, section) {
  const result = await query(
    'DELETE FROM champs_personnalises_config WHERE entite = $1 AND section = $2 RETURNING id',
    [entite.toUpperCase(), section]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Section non trouvée');
  return { deleted: result.rows.length };
}

// ---------------------------------------------------------------------------
// VALEURS — CRUD
// ---------------------------------------------------------------------------

export async function getValeurs(entite, entiteId) {
  const result = await query(
    `SELECT v.id, v.config_id, v.entite_id, v.valeur, v.created_at, v.updated_at,
            c.label, c.cle, c.type, c.section, c.section_ordre, c.ordre, c.obligatoire, c.options_liste, c.valeur_defaut
     FROM champs_personnalises_valeurs v
     JOIN champs_personnalises_config c ON c.id = v.config_id
     WHERE c.entite = $1 AND v.entite_id = $2 AND c.actif = true
     ORDER BY c.section_ordre, c.section, c.ordre`,
    [entite.toUpperCase(), entiteId]
  );
  return result.rows;
}

export async function saveValeurs(entite, entiteId, valeurs) {
  const configs = await query(
    'SELECT id, cle, obligatoire FROM champs_personnalises_config WHERE entite = $1 AND actif = true',
    [entite.toUpperCase()]
  );
  const configMap = new Map(configs.rows.map(c => [c.cle, c]));

  const entries = Array.isArray(valeurs)
    ? valeurs
    : Object.entries(valeurs).map(([cle, valeur]) => ({ cle, valeur }));

  for (const v of entries) {
    const config = configMap.get(v.cle);
    if (!config) continue;

    if (config.obligatoire && (!v.valeur || String(v.valeur).trim() === '')) {
      throw ApiError.badRequest(`Le champ "${v.cle}" est obligatoire`);
    }

    await query(
      `INSERT INTO champs_personnalises_valeurs (config_id, entite_id, valeur)
       VALUES ($1, $2, $3)
       ON CONFLICT (config_id, entite_id)
       DO UPDATE SET valeur = $3, updated_at = NOW()`,
      [config.id, entiteId, v.valeur || null]
    );
  }

  return getValeurs(entite, entiteId);
}

export async function getConfigsWithValeurs(entite, entiteId) {
  const result = await query(
    `SELECT c.id as config_id, c.entite, c.section, c.section_ordre, c.label, c.cle, c.type,
            c.valeur_defaut, c.options_liste, c.obligatoire, c.ordre,
            v.id as valeur_id, v.valeur
     FROM champs_personnalises_config c
     LEFT JOIN champs_personnalises_valeurs v ON v.config_id = c.id AND v.entite_id = $2
     WHERE c.entite = $1 AND c.actif = true
     ORDER BY c.section_ordre, c.section, c.ordre`,
    [entite.toUpperCase(), entiteId]
  );
  return result.rows;
}
