import * as superAdminService from './superAdmin.service.js';
import * as authService from '../auth/auth.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { runWithTenantContext } from '../../config/database.js';
import { sendSuccess } from '../../utils/response.js';

// Helper commun : logue une action super-admin liée à un tenant précis.
// tenantId explicite (bypass du DEFAULT current_setting sur activity_logs,
// cf. analyse de l'étape précédente) ; entityId volontairement omis
// (colonne INTEGER, incompatible avec les UUID de tenants.id / users.id).
async function logTenantAction(req, { action, description, details }) {
  try {
    await activityLog.log({
      userId: req.user.id,
      userNom: activityLog.getUserName(req.user),
      action,
      module: 'super-admin',
      description,
      entityType: 'tenant',
      details,
      tenantId: details.tenant_id,
      ipAddress: activityLog.getClientIp(req),
    });
  } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
}

export async function listTenants(req, res, next) {
  try {
    const tenants = await superAdminService.listTenants();
    sendSuccess(res, tenants);
  } catch (err) { next(err); }
}

export async function createTenant(req, res, next) {
  try {
    const { nom, slug, statut } = req.body;
    const tenant = await superAdminService.createTenant({ nom, slug, statut });

    await logTenantAction(req, {
      action: 'tenant_cree',
      description: `Création du tenant "${tenant.nom}" (${tenant.slug})`,
      details: { tenant_id: tenant.id, slug: tenant.slug, statut: tenant.statut },
    });

    sendSuccess(res, tenant, 'Tenant créé avec succès', 201);
  } catch (err) { next(err); }
}

export async function getTenantById(req, res, next) {
  try {
    const tenant = await superAdminService.getTenantById(req.params.id);
    sendSuccess(res, tenant);
  } catch (err) { next(err); }
}

export async function updateTenant(req, res, next) {
  try {
    const { nom, slug } = req.body;
    const tenant = await superAdminService.updateTenant(req.params.id, { nom, slug });

    await logTenantAction(req, {
      action: 'tenant_modifie',
      description: `Modification du tenant "${tenant.nom}" (${tenant.slug})`,
      details: { tenant_id: tenant.id, nom: tenant.nom, slug: tenant.slug },
    });

    sendSuccess(res, tenant, 'Tenant mis à jour');
  } catch (err) { next(err); }
}

export async function suspendTenant(req, res, next) {
  try {
    const tenant = await superAdminService.suspendTenant(req.params.id);

    await logTenantAction(req, {
      action: 'tenant_suspendu',
      description: `Suspension du tenant "${tenant.nom}"`,
      details: { tenant_id: tenant.id },
    });

    sendSuccess(res, tenant, 'Tenant suspendu');
  } catch (err) { next(err); }
}

export async function reactivateTenant(req, res, next) {
  try {
    const tenant = await superAdminService.reactivateTenant(req.params.id);

    await logTenantAction(req, {
      action: 'tenant_reactive',
      description: `Réactivation du tenant "${tenant.nom}"`,
      details: { tenant_id: tenant.id },
    });

    sendSuccess(res, tenant, 'Tenant réactivé');
  } catch (err) { next(err); }
}

export async function createTenantAdmin(req, res, next) {
  try {
    const tenantId = req.params.id;

    // 404 clair avant d'ouvrir une transaction pour rien si le tenant
    // n'existe pas (query directe, sans RLS puisque `tenants` n'en a pas).
    await superAdminService.ensureTenantExists(tenantId);

    const { email, password, first_name, last_name } = req.body;

    // runWithTenantContext englobe TOUT l'appel au service (pas requête par
    // requête) : authService.createUser() fait un SELECT de dédoublonnage
    // email + un INSERT users + un éventuel INSERT user_permissions selon
    // le rôle — tout doit tourner dans la même transaction / le même
    // contexte tenant pour que le WITH CHECK RLS de `users` matche la
    // branche normale (tenant_id = current_setting(...)::uuid) plutôt que
    // l'escape clause.
    //
    // role et tenant_id forcés ici, jamais lus depuis req.body : c'est
    // précisément le point demandé ("jamais depuis le body").
    const admin = await runWithTenantContext(tenantId, () =>
      authService.createUser({
        email,
        password,
        first_name,
        last_name,
        role: 'admin',
        tenant_id: tenantId,
      }),
    );

    await logTenantAction(req, {
      action: 'tenant_admin_cree',
      description: `Création de l'admin "${admin.email}" pour le tenant ${tenantId}`,
      details: { tenant_id: tenantId, user_id: admin.id, email: admin.email },
    });

    sendSuccess(res, admin, 'Administrateur créé avec succès', 201);
  } catch (err) { next(err); }
}

export async function updateModules(req, res, next) {
  try {
    const tenant = await superAdminService.updateModules(req.params.id, req.body);

    await logTenantAction(req, {
      action: 'tenant_modules_modifies',
      description: `Modification des modules actifs du tenant "${tenant.nom}"`,
      details: { tenant_id: tenant.id, modules_actifs: tenant.modules_actifs },
    });

    sendSuccess(res, tenant, 'Modules mis à jour');
  } catch (err) { next(err); }
}
