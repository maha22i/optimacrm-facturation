import { query } from '../../config/database.js';

/**
 * Log une activité. Ne doit JAMAIS bloquer l'action appelante.
 * Toujours envelopper l'appel dans un try/catch côté appelant.
 */
export async function log({
  userId = null,
  userNom = null,
  action,
  module: moduleName,
  description,
  entityType = null,
  entityId = null,
  entityLabel = null,
  details = {},
  statut = 'succes',
  ipAddress = null,
}) {
  try {
    await query(
      `INSERT INTO activity_logs
        (user_id, user_nom, action, module, description, entity_type, entity_id, entity_label, details, statut, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        userId,
        userNom,
        action,
        moduleName,
        description,
        entityType,
        entityId,
        entityLabel,
        JSON.stringify(details),
        statut,
        ipAddress,
      ],
    );
  } catch (err) {
    console.error('[ActivityLog] Échec écriture log :', err.message, '| Action:', action, '| Module:', moduleName, '| UserId:', userId);
  }
}

export async function listLogs({
  page = 1,
  limit = 50,
  module: moduleName,
  action,
  user_id,
  statut,
  date_debut,
  date_fin,
  search,
}) {
  const conditions = [];
  const params = [];
  let i = 1;

  if (moduleName) {
    conditions.push(`module = $${i++}`);
    params.push(moduleName);
  }
  if (action) {
    conditions.push(`action = $${i++}`);
    params.push(action);
  }
  if (user_id) {
    conditions.push(`user_id = $${i++}`);
    params.push(user_id);
  }
  if (statut) {
    conditions.push(`statut = $${i++}`);
    params.push(statut);
  }
  if (date_debut) {
    conditions.push(`created_at >= $${i++}`);
    params.push(date_debut);
  }
  if (date_fin) {
    conditions.push(`created_at <= ($${i++})::timestamptz + interval '1 day'`);
    params.push(date_fin);
  }
  if (search) {
    conditions.push(`(description ILIKE $${i} OR entity_label ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const countResult = await query(
    `SELECT COUNT(*) FROM activity_logs ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await query(
    `SELECT * FROM activity_logs ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
    [...params, limit, offset],
  );

  return {
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

export async function getStats({ module: moduleName, date_debut, date_fin, search } = {}) {
  const conditions = [];
  const params = [];
  let i = 1;

  if (moduleName) {
    conditions.push(`module = $${i++}`);
    params.push(moduleName);
  }
  if (date_debut) {
    conditions.push(`created_at >= $${i++}`);
    params.push(date_debut);
  }
  if (date_fin) {
    conditions.push(`created_at <= ($${i++})::timestamptz + interval '1 day'`);
    params.push(date_fin);
  }
  if (search) {
    conditions.push(`(description ILIKE $${i} OR entity_label ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalR = await query(`SELECT COUNT(*) FROM activity_logs ${where}`, params);
  const todayR = await query(
    `SELECT COUNT(*) FROM activity_logs ${where} ${conditions.length ? 'AND' : 'WHERE'} created_at >= CURRENT_DATE`,
    params,
  );
  const weekR = await query(
    `SELECT COUNT(*) FROM activity_logs ${where} ${conditions.length ? 'AND' : 'WHERE'} created_at >= date_trunc('week', CURRENT_DATE)`,
    params,
  );
  const monthR = await query(
    `SELECT COUNT(*) FROM activity_logs ${where} ${conditions.length ? 'AND' : 'WHERE'} created_at >= date_trunc('month', CURRENT_DATE)`,
    params,
  );

  const byModuleR = await query(
    `SELECT module, COUNT(*)::int AS count FROM activity_logs ${where} GROUP BY module ORDER BY count DESC`,
    params,
  );

  const par_module = {};
  for (const r of byModuleR.rows) par_module[r.module] = r.count;

  return {
    total: parseInt(totalR.rows[0].count, 10),
    aujourd_hui: parseInt(todayR.rows[0].count, 10),
    cette_semaine: parseInt(weekR.rows[0].count, 10),
    ce_mois: parseInt(monthR.rows[0].count, 10),
    par_module,
  };
}

export async function getEntityHistory(entityType, entityId) {
  const result = await query(
    `SELECT * FROM activity_logs WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC`,
    [entityType, entityId],
  );
  return result.rows;
}

export function getUserName(user) {
  if (!user) return 'Système';
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Utilisateur';
}

export function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
}
