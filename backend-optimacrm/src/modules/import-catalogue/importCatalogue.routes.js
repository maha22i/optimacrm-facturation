import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './importCatalogue.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const router = Router();
router.use(authenticate);
router.use(checkPermission('catalogue_import'));

router.post('/parse', upload.single('file'), ctrl.parse);
router.post('/validate', ctrl.validate);
router.post('/execute', ctrl.execute);

router.get('/mappings', ctrl.listMappings);
router.post('/mappings', ctrl.saveMapping);
router.delete('/mappings/:id', ctrl.deleteMapping);

export default router;
