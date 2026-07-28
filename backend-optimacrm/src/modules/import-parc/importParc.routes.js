import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './importParc.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantMiddleware } from '../../middleware/tenantContext.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { requireModule } from '../../middleware/requireModule.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(authenticate);
router.use(requireModule('parc_machines'));
router.use(tenantMiddleware);

// ── Import Machines ───────────────────────────────────────────────────────
router.post('/machines/parse', checkPermission('parc_import'), upload.single('file'), ctrl.parseMachines);
router.post('/machines/validate', checkPermission('parc_import'), ctrl.validateMachines);
router.post('/machines/execute', checkPermission('parc_import'), ctrl.executeMachines);

// ── Import Relevés ────────────────────────────────────────────────────────
router.post('/releves/parse', checkPermission('parc_import'), upload.single('file'), ctrl.parseReleves);
router.post('/releves/validate', checkPermission('parc_import'), ctrl.validateReleves);
router.post('/releves/execute', checkPermission('parc_import'), ctrl.executeReleves);

// ── Mappings sauvegardés ──────────────────────────────────────────────────
router.get('/mappings', checkPermission('parc_import'), ctrl.getMappings);
router.post('/mappings', checkPermission('parc_import'), ctrl.saveMapping);
router.delete('/mappings/:id', checkPermission('parc_import'), ctrl.deleteMapping);

export default router;
