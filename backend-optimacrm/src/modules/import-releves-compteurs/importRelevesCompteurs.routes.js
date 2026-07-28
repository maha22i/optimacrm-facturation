import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './importRelevesCompteurs.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantMiddleware } from '../../middleware/tenantContext.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { requireModule } from '../../middleware/requireModule.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate);
router.use(requireModule('parc_machines'));
router.use(tenantMiddleware);

router.post('/parse', checkPermission('parc_import'), upload.single('file'), ctrl.parse);
router.post('/analyze', checkPermission('parc_import'), ctrl.analyze);
router.post('/execute', checkPermission('parc_import'), ctrl.execute);

export default router;
