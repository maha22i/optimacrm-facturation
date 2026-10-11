import { Router } from 'express';
import * as ctrl from './permissions.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { tenantMiddleware } from '../../middleware/tenantContext.js';

const router = Router();

// tenantMiddleware est indispensable sur les routes qui touchent
// `user_permissions` : la colonne tenant_id a pour DEFAULT
// current_setting('app.current_tenant_id')::uuid (migration 056), sans
// missing_ok. Hors contexte tenant l'INSERT échoue donc systématiquement
// (« unrecognized configuration parameter » sur une connexion neuve,
// « invalid input syntax for type uuid: "" » sur une connexion recyclée).
// Il rend aussi le DELETE + INSERT de setUserPermissions atomiques : sans
// transaction, le DELETE était committé puis l'INSERT échouait, ce qui vidait
// les permissions de l'utilisateur ciblé.
// Enfin il active la policy RLS (067/068) au lieu de son escape clause, donc
// un admin ne peut plus lire ni écrire les permissions d'un autre tenant.
router.get('/available', authenticate, authorize('admin'), ctrl.getAvailable);
router.get('/user/:userId', authenticate, tenantMiddleware, authorize('admin'), ctrl.getUserPermissions);
router.put('/user/:userId', authenticate, tenantMiddleware, authorize('admin'), ctrl.setUserPermissions);

export default router;
