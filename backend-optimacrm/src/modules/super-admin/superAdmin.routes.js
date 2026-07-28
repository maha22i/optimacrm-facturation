import { Router } from 'express';
import * as ctrl from './superAdmin.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';

// ── Portail super-admin ──────────────────────────────────────────────────
//
// Volontairement SANS tenantMiddleware : le super-admin est cross-tenant
// par nature (tenant_id NULL). Poser un contexte tenant ici n'aurait pas de
// sens — ces routes doivent voir/gérer TOUS les tenants. Les requêtes de
// service passent donc par pool.query() (via query() sans contexte ALS) et
// retombent sur l'escape clause RLS ("aucun contexte posé" = tout visible)
// pour tenants/users/clients/factures — filtrage explicite par tenant_id
// fait à la main dans superAdmin.service.js où c'est nécessaire.
//
// Exception : POST /tenants/:id/admin, qui enveloppe explicitement l'appel
// service dans runWithTenantContext() pour l'INSERT dans `users` (cf.
// analyse dans superAdmin.controller.js).
//
// authorize('super_admin') suffit tel quel (cf. plan validé) : c'est un
// simple contrôle de rôle, agnostique du tenant.

const router = Router();

router.use(authenticate);
router.use(authorize('super_admin'));

router.get('/tenants', ctrl.listTenants);

router.post(
  '/tenants',
  validate({
    nom:    { required: true, minLength: 2, maxLength: 255, label: 'Nom' },
    slug:   { required: true, minLength: 2, maxLength: 100, label: 'Slug' },
    statut: { enum: ['actif', 'suspendu', 'inactif'] },
  }),
  ctrl.createTenant,
);

router.get('/tenants/:id', ctrl.getTenantById);

router.put(
  '/tenants/:id',
  validate({
    nom:  { minLength: 2, maxLength: 255, label: 'Nom' },
    slug: { minLength: 2, maxLength: 100, label: 'Slug' },
  }),
  ctrl.updateTenant,
);

router.post('/tenants/:id/suspend', ctrl.suspendTenant);
router.post('/tenants/:id/reactivate', ctrl.reactivateTenant);

router.post(
  '/tenants/:id/admin',
  validate({
    email:      { required: true, type: 'email', label: 'Email' },
    password:   { required: true, minLength: 8, label: 'Mot de passe' },
    first_name: { required: true, minLength: 2, maxLength: 100, label: 'Prénom' },
    last_name:  { required: true, minLength: 2, maxLength: 100, label: 'Nom' },
  }),
  ctrl.createTenantAdmin,
);

// Pas de validate() ici : le body EST directement l'objet modules_actifs
// (ex. { "sepa": true, "planning": false }), sa forme est vérifiée dans
// superAdmin.service.js (objet JSON non-null, non-array).
router.put('/tenants/:id/modules', ctrl.updateModules);

export default router;
