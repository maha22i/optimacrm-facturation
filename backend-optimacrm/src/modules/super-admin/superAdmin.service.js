import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

const TENANT_FIELDS = 'id, nom, slug, statut, modules_actifs, created_at, updated_at';

// Format URL-safe : minuscules, chiffres, tirets simples, pas d'espace,
// pas de tiret en début/fin ni doublé.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

async function getTenantOrThrow(id) {
  const result = await query(`SELECT ${TENANT_FIELDS} FROM tenants WHERE id = $1`, [id]);
  if (result.rows.length === 0) throw ApiError.notFound('Tenant non trouvé');
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Stats par tenant — approche N+1 (peu de tenants au départ, cf. plan validé).
// Requêtes explicitement filtrées par tenant_id : le super-admin n'a aucun
// contexte tenant posé (pas de tenantMiddleware sur ce module), donc la RLS
// de `users`/`clients`/`factures` retombe sur son escape clause et renverrait
// TOUT sans ce WHERE explicite.
// ---------------------------------------------------------------------------
async function getTenantStats(tenantId) {
  const [usersRes, clientsRes, facturesRes] = await Promise.all([
    query('SELECT COUNT(*)::int AS count FROM users WHERE tenant_id = $1', [tenantId]),
    query('SELECT COUNT(*)::int AS count FROM clients WHERE tenant_id = $1', [tenantId]),
    query('SELECT COUNT(*)::int AS count FROM factures WHERE tenant_id = $1', [tenantId]),
  ]);

  return {
    users: usersRes.rows[0].count,
    clients: clientsRes.rows[0].count,
    factures: facturesRes.rows[0].count,
  };
}

export async function listTenants() {
  const tenantsRes = await query(
    `SELECT ${TENANT_FIELDS} FROM tenants ORDER BY created_at DESC`,
  );

  const tenants = await Promise.all(
    tenantsRes.rows.map(async (tenant) => ({
      ...tenant,
      stats: await getTenantStats(tenant.id),
    })),
  );

  return tenants;
}

export async function createTenant({ nom, slug, statut = 'actif' }) {
  if (!SLUG_RE.test(slug)) {
    throw ApiError.badRequest(
      'Slug invalide : uniquement minuscules, chiffres et tirets simples (ex. "mon-client")',
    );
  }

  const dup = await query('SELECT id FROM tenants WHERE slug = $1', [slug]);
  if (dup.rows.length > 0) {
    throw ApiError.conflict('Ce slug est déjà utilisé par un autre tenant');
  }

  const result = await query(
    `INSERT INTO tenants (nom, slug, statut)
     VALUES ($1, $2, $3)
     RETURNING ${TENANT_FIELDS}`,
    [nom, slug, statut],
  );

  return result.rows[0];
}

export async function getTenantById(id) {
  const tenant = await getTenantOrThrow(id);

  const [stats, usersRes] = await Promise.all([
    getTenantStats(id),
    query(
      `SELECT id, email, first_name, last_name, role, is_active
       FROM users WHERE tenant_id = $1 ORDER BY created_at`,
      [id],
    ),
  ]);

  return {
    ...tenant,
    stats,
    users: usersRes.rows,
  };
}

export async function ensureTenantExists(id) {
  return getTenantOrThrow(id);
}

export async function updateTenant(id, { nom, slug }) {
  await getTenantOrThrow(id);

  if (slug !== undefined) {
    if (!SLUG_RE.test(slug)) {
      throw ApiError.badRequest(
        'Slug invalide : uniquement minuscules, chiffres et tirets simples (ex. "mon-client")',
      );
    }
    const dup = await query('SELECT id FROM tenants WHERE slug = $1 AND id != $2', [slug, id]);
    if (dup.rows.length > 0) {
      throw ApiError.conflict('Ce slug est déjà utilisé par un autre tenant');
    }
  }

  const sets = [];
  const vals = [];
  let i = 1;

  if (nom !== undefined)  { sets.push(`nom = $${i++}`);  vals.push(nom); }
  if (slug !== undefined) { sets.push(`slug = $${i++}`); vals.push(slug); }

  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  sets.push('updated_at = NOW()');
  vals.push(id);

  const result = await query(
    `UPDATE tenants SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${TENANT_FIELDS}`,
    vals,
  );
  return result.rows[0];
}

// setStatut() est interne : les controllers passent par suspendTenant()/
// reactivateTenant() (actions dédiées, cf. routes) pour que l'action loguée
// dans activity_logs soit explicite ('tenant_suspendu' / 'tenant_reactive'),
// plutôt qu'un générique "modifié" qui masquerait le changement d'état.
async function setStatut(id, statut) {
  await getTenantOrThrow(id);
  const result = await query(
    `UPDATE tenants SET statut = $1, updated_at = NOW() WHERE id = $2 RETURNING ${TENANT_FIELDS}`,
    [statut, id],
  );
  return result.rows[0];
}

export async function suspendTenant(id) {
  return setStatut(id, 'suspendu');
}

export async function reactivateTenant(id) {
  return setStatut(id, 'actif');
}

// Rôles dont TOUT le périmètre frontend (menu + ALLOWED_PATHS_BY_ROLE dans
// (dashboard)/layout.tsx) dépend du module tickets — technicien n'a accès
// qu'à /dashboard/tickets et /dashboard/planning, admin_technique a un menu
// centré sur les tickets. Désactiver ce module pour un tenant qui en a
// activement laisserait ces users sans aucune page accessible : leur
// redirection de rôle (getRedirectForRole) les renvoie systématiquement vers
// /dashboard/tickets, que MODULE_PATH_PATTERNS bloquerait à son tour vers
// /dashboard, qui les renvoie de nouveau vers /dashboard/tickets — boucle de
// redirection infinie côté front, sans échappatoire pour l'utilisateur.
const TICKETS_DEPENDENT_ROLES = ['technicien', 'admin_technique'];

async function assertTicketsModuleDeactivatable(tenantId) {
  const result = await query(
    `SELECT role, COUNT(*)::int AS count
     FROM users
     WHERE tenant_id = $1 AND is_active = true AND role = ANY($2::text[])
     GROUP BY role`,
    [tenantId, TICKETS_DEPENDENT_ROLES],
  );

  if (result.rows.length === 0) return;

  const total = result.rows.reduce((sum, r) => sum + r.count, 0);
  const detail = result.rows.map(r => `${r.count} ${r.role}`).join(', ');

  throw ApiError.conflict(
    `Impossible de désactiver le module Tickets : ce tenant a ${total} utilisateur(s) actif(s) dont le rôle dépend des tickets (${detail}). Changez leur rôle ou désactivez leur compte d'abord.`,
  );
}

export async function updateModules(id, modulesActifs) {
  if (
    typeof modulesActifs !== 'object' ||
    modulesActifs === null ||
    Array.isArray(modulesActifs)
  ) {
    throw ApiError.badRequest('modules_actifs doit être un objet JSON (ex. { "sepa": true })');
  }

  await getTenantOrThrow(id);

  if (modulesActifs.tickets === false) {
    await assertTicketsModuleDeactivatable(id);
  }

  // Merge JSONB (pas overwrite) : chaque appel peut n'envoyer qu'une seule
  // clé (ex. { tickets: false }) sans écraser les autres exceptions déjà
  // enregistrées pour ce tenant. COALESCE défensif si modules_actifs valait
  // NULL en base (le || Postgres renvoie NULL si un des deux opérandes est
  // NULL, ce qui effacerait tout).
  const result = await query(
    `UPDATE tenants
     SET modules_actifs = COALESCE(modules_actifs, '{}'::jsonb) || $1::jsonb, updated_at = NOW()
     WHERE id = $2
     RETURNING ${TENANT_FIELDS}`,
    [JSON.stringify(modulesActifs), id],
  );
  return result.rows[0];
}
