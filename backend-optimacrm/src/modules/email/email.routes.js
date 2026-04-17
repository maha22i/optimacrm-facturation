import { Router } from 'express';
import * as ctrl from './email.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';

const router = Router();
router.use(authenticate);

router.get('/config', checkPermission('parametres_societe'), ctrl.getConfig);
router.put('/config', checkPermission('parametres_societe'), ctrl.updateConfig);
router.post('/verify', checkPermission('parametres_societe'), ctrl.verifySmtp);
router.post('/test', checkPermission('parametres_societe'), ctrl.sendTest);
router.get('/logs', checkPermission('parametres_societe'), ctrl.getLogs);

export default router;
