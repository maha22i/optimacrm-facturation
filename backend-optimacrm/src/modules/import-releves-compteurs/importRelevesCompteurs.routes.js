import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './importRelevesCompteurs.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate);

router.post('/parse', checkPermission('parc_import'), upload.single('file'), ctrl.parse);
router.post('/analyze', checkPermission('parc_import'), ctrl.analyze);
router.post('/execute', checkPermission('parc_import'), ctrl.execute);

export default router;
