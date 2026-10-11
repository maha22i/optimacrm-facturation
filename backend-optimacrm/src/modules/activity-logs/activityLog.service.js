import { query } from '../../config/database.js';
import { MODULES } from '../../config/activityModules.js';

/**
 * Log une activité. Ne doit JAMAIS bloquer l'action appelante.
 * Toujours envelopper l'appel dans un try/catch côté appelant.
 *
 * @param {string|null} tenantId - À fournir UNIQUEMENT pour les actions
 *   effectuées sans contexte tenant posé sur la connexion (super-admin,
 *   cf. module super-admin). Dans ce cas, la colonne tenant_id est incluse
 *   explicitement dans l'INSERT pour contourner son DEFAULT
 *   (current_setting('app.current_tenant_id')::uuid, cf. migration 056) :
 *   ce DEFAULT lève une erreur "unrecognized configuration parameter" sur
 *   une connexion où aucun SET LOCAL n'a jamais été fait — exactement le
 *   cas du super-admin (pas de tenantMiddleware). Pour tout appel normal
 *   (dans le contexte d'un tenant), ne pas passer ce paramètre : le
 *   comportement reste identique à avant (colonne omise, DEFAULT résolu
 *   par le contexte de la requête).
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
  tenantId = null,
}) {
  try {
    const columns = ['user_id', 'user_nom', 'action', 'module', 'description', 'entity_type', 'entity_id', 'entity_label', 'details', 'statut', 'ip_address'];
    const values = [userId, userNom, action, moduleName, description, entityType, entityId, entityLabel, JSON.stringify(details), statut, ipAddress];

    if (tenantId) {
      columns.push('tenant_id');
      values.push(tenantId);
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(',');
    await query(
      `INSERT INTO activity_logs (${columns.join(', ')}) VALUES (${placeholders})`,
      values,
    );
  } catch (err) {
    console.error('[ActivityLog] Échec écriture log :', err.message, '| Action:', action, '| Module:', moduleName, '| UserId:', userId);
  }
}

/**
 * Variante de `log()` qui déduit l'auteur et l'IP de la requête Express.
 *
 * `log()` avale déjà ses propres erreurs : pas besoin d'envelopper l'appel dans
 * un try/catch côté appelant, contrairement aux premiers appels du projet qui
 * le faisaient par précaution.
 *
 * @param {import('express').Request} req
 */
export async function logRequest(req, entry) {
  await log({
    userId: req?.user?.id ?? null,
    userNom: getUserName(req?.user),
    ipAddress: getClientIp(req),
    ...entry,
  });
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
  // Filtre explicite, réservé à l'usage cross-tenant du super-admin (cf.
  // superAdmin.service.js#getTenantActivityLogs). Le chemin normal
  // (/api/activity-logs, avec tenantMiddleware) ne le passe jamais : le
  // filtrage y est déjà assuré par la RLS via le contexte tenant posé sur
  // la connexion. Ici au contraire, aucun contexte n'est posé (le
  // super-admin n'a pas de tenantMiddleware), donc l'escape clause RLS
  // renverrait TOUT sans ce filtre manuel — indispensable pour l'isolation.
  tenantId = null,
  // Les actions du super-admin (suspension d'un tenant, activation de modules,
  // création de comptes...) sont estampillées avec le tenant_id de la société
  // ciblée, pour que la console super-admin puisse les filtrer par client. La
  // RLS les rendrait donc visibles dans le journal de ce tenant : elles sont
  // exclues par défaut, et ne sont réintégrées que pour la console super-admin.
  inclureSuperAdmin = false,
  // false pour un lecteur non-admin : l'auteur est retiré des lignes, et ni
  // le filtre `user_id` ni la recherche ne portent sur lui (sinon on pourrait
  // déduire qui a fait quoi en filtrant).
  voirAuteur = true,
}) {
  const conditions = [];
  const params = [];
  let i = 1;

  if (tenantId) {
    conditions.push(`a.tenant_id = $${i++}`);
    params.push(tenantId);
  }
  if (!inclureSuperAdmin) {
    conditions.push(`a.module <> $${i++}`);
    params.push(MODULES.SUPER_ADMIN);
  }
  if (moduleName) {
    conditions.push(`a.module = $${i++}`);
    params.push(moduleName);
  }
  if (action) {
    // ILIKE partiel (pas d'égalité stricte) : contrairement à `module`
    // (sélectionné via un dropdown fermé, donc valeur exacte connue),
    // `action` reste un champ texte libre côté super-admin — taper "email"
    // doit trouver "notification_email", "facture_envoyee_email", etc.
    conditions.push(`a.action ILIKE $${i++}`);
    params.push(`%${action}%`);
  }
  if (user_id && voirAuteur) {
    conditions.push(`a.user_id = $${i++}`);
    params.push(user_id);
  }
  if (statut) {
    conditions.push(`a.statut = $${i++}`);
    params.push(statut);
  }
  if (date_debut) {
    conditions.push(`a.created_at >= $${i++}`);
    params.push(date_debut);
  }
  if (date_fin) {
    conditions.push(`a.created_at <= ($${i++})::timestamptz + interval '1 day'`);
    params.push(date_fin);
  }
  if (search) {
    conditions.push(searchCondition(i, voirAuteur));
    params.push(`%${search}%`);
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const countResult = await query(
    `SELECT COUNT(*) FROM activity_logs a ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await query(
    `SELECT a.*, u.email AS user_email, u.role AS user_role
     FROM activity_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY a.created_at DESC LIMIT $${i++} OFFSET $${i++}`,
    [...params, limit, offset],
  );

  return {
    data: voirAuteur ? dataResult.rows : dataResult.rows.map(masquerAuteur),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

// Toujours appelé depuis le journal d'un tenant : les actions super-admin en
// sont exclues, sans quoi les compteurs contrediraient la liste affichée.
export async function getStats({ module: moduleName, user_id, date_debut, date_fin, search, voirAuteur = true } = {}) {
  const conditions = [`a.module <> $1`];
  const params = [MODULES.SUPER_ADMIN];
  let i = 2;

  if (moduleName) {
    conditions.push(`a.module = $${i++}`);
    params.push(moduleName);
  }
  if (user_id && voirAuteur) {
    conditions.push(`a.user_id = $${i++}`);
    params.push(user_id);
  }
  if (date_debut) {
    conditions.push(`a.created_at >= $${i++}`);
    params.push(date_debut);
  }
  if (date_fin) {
    conditions.push(`a.created_at <= ($${i++})::timestamptz + interval '1 day'`);
    params.push(date_fin);
  }
  if (search) {
    conditions.push(searchCondition(i, voirAuteur));
    params.push(`%${search}%`);
    i++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalR = await query(`SELECT COUNT(*) FROM activity_logs a ${where}`, params);
  const todayR = await query(
    `SELECT COUNT(*) FROM activity_logs a ${where} ${conditions.length ? 'AND' : 'WHERE'} a.created_at >= CURRENT_DATE`,
    params,
  );
  const weekR = await query(
    `SELECT COUNT(*) FROM activity_logs a ${where} ${conditions.length ? 'AND' : 'WHERE'} a.created_at >= date_trunc('week', CURRENT_DATE)`,
    params,
  );
  const monthR = await query(
    `SELECT COUNT(*) FROM activity_logs a ${where} ${conditions.length ? 'AND' : 'WHERE'} a.created_at >= date_trunc('month', CURRENT_DATE)`,
    params,
  );

  const byModuleR = await query(
    `SELECT a.module, COUNT(*)::int AS count FROM activity_logs a ${where} GROUP BY a.module ORDER BY count DESC`,
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

// Modules distincts réellement présents pour un tenant donné — alimente le
// dropdown de filtre du portail super-admin. Requête dynamique plutôt qu'une
// liste statique de modules connus : ne propose jamais un module vide pour
// ce tenant, et reste à jour automatiquement si de nouveaux modules
  // apparaissent (ex. activation d'un module optionnel).
export async function listDistinctModules(tenantId) {
  const result = await query(
    `SELECT DISTINCT module FROM activity_logs WHERE tenant_id = $1 ORDER BY module`,
    [tenantId],
  );
  return result.rows.map((r) => r.module);
}

// Historique affiché sur la fiche d'une entité, côté tenant : même exclusion
// des actions super-admin que dans listLogs().
export async function getEntityHistory(entityType, entityId, { voirAuteur = true } = {}) {
  const result = await query(
    `SELECT * FROM activity_logs
     WHERE entity_type = $1 AND entity_id = $2 AND module <> $3
     ORDER BY created_at DESC`,
    [entityType, entityId, MODULES.SUPER_ADMIN],
  );
  return voirAuteur ? result.rows : result.rows.map(masquerAuteur);
}

// Auteurs distincts présents dans le journal du tenant courant, avec le nom
// le plus récent enregistré pour chacun — alimente le filtre « Utilisateur ».
export async function listAuteurs() {
  const result = await query(
    `SELECT DISTINCT ON (a.user_id) a.user_id, a.user_nom, u.role AS user_role
     FROM activity_logs a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.user_id IS NOT NULL AND a.module <> $1
     ORDER BY a.user_id, a.created_at DESC`,
    [MODULES.SUPER_ADMIN],
  );
  return result.rows.sort((x, y) => (x.user_nom || '').localeCompare(y.user_nom || '', 'fr'));
}

// Savoir qui a fait quoi est réservé aux administrateurs du tenant.
export function peutVoirAuteur(user) {
  return user?.role === 'admin' || user?.role === 'super_admin';
}

export function masquerAuteur(row) {
  const { user_id, user_nom, user_email, user_role, ip_address, ...reste } = row;
  return reste;
}

function searchCondition(i, voirAuteur) {
  const champs = ['a.description', 'a.entity_label'];
  if (voirAuteur) champs.push('a.user_nom');
  return `(${champs.map((c) => `${c} ILIKE $${i}`).join(' OR ')})`;
}

export function getUserName(user) {
  if (!user) return 'Système';
  return `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Utilisateur';
}

export function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
}
