import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import * as ctrl from './activityLog.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', checkPermission('activity_logs'), ctrl.listLogs);
router.get('/stats', checkPermission('activity_logs'), ctrl.getStats);
router.get('/:entityType/:entityId', checkPermission('activity_logs'), ctrl.getEntityHistory);

export default router;
