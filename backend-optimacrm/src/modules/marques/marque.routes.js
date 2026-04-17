import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './marque.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
const router = Router();
router.use(authenticate);

router.get('/', checkPermission('marques'), ctrl.list);

router.post(
  '/',
  checkPermission('marques'),
  validate({
    nom: { required: true, minLength: 1, maxLength: 255, label: 'Nom' },
  }),
  ctrl.create,
);

router.put(
  '/:id',
  checkPermission('marques'),
  validate({
    nom: { minLength: 1, maxLength: 255, label: 'Nom' },
    actif: { type: 'boolean' },
  }),
  ctrl.update,
);

router.delete('/:id', checkPermission('marques'), ctrl.softDelete);

router.post('/:id/logo', checkPermission('marques'), upload.single('logo'), ctrl.uploadLogo);

export default router;
