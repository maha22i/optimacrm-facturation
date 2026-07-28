import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantMiddleware } from '../../middleware/tenantContext.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { requireModule } from '../../middleware/requireModule.js';
import * as ctrl from './activityLog.controller.js';

const router = Router();

// Ce routeur n'expose que des routes de LECTURE (aucun POST/PUT ici) :
// requireModule('journal') ne bloque donc que la consultation. L'écriture
// des logs se fait via des appels de fonction directs à activityLog.service.js
// (log()) depuis les autres modules, jamais via ce routeur HTTP — elle n'est
// donc jamais affectée par ce middleware, quel que soit l'état du module.
router.use(authenticate);
router.use(requireModule('journal'));
router.use(tenantMiddleware);

router.get('/', checkPermission('activity_logs'), ctrl.listLogs);
router.get('/stats', checkPermission('activity_logs'), ctrl.getStats);
router.get('/:entityType/:entityId', checkPermission('activity_logs'), ctrl.getEntityHistory);

export default router;
