import { Router } from 'express';
import * as ctrl from './importsReleves.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantMiddleware } from '../../middleware/tenantContext.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { requireModule } from '../../middleware/requireModule.js';

const router = Router();
router.use(authenticate);
router.use(requireModule('parc_machines'));
router.use(tenantMiddleware);

router.get('/stats', checkPermission('parc_read'), ctrl.getImportsStats);
router.get('/', checkPermission('parc_read'), ctrl.listImports);
router.post('/check-duplicate', checkPermission('parc_import'), ctrl.checkDuplicate);
router.get('/:id', checkPermission('parc_read'), ctrl.getImport);
router.get('/:id/releves', checkPermission('parc_read'), ctrl.getImportReleves);
router.get('/:id/factures', checkPermission('parc_read'), ctrl.getImportFactures);
router.get('/:id/rapport', checkPermission('parc_read'), ctrl.getImportRapport);
router.delete('/:id', checkPermission('parc_write'), ctrl.annulerImport);

export default router;
