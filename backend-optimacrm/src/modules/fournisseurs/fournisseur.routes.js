import { Router } from 'express';
import * as ctrl from './fournisseur.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';

const router = Router();
router.use(authenticate);

router.get('/', checkPermission('fournisseurs'), ctrl.list);
router.get('/:id', checkPermission('fournisseurs'), ctrl.getById);

router.post(
  '/',
  checkPermission('fournisseurs'),
  validate({
    nom: { required: true, minLength: 1, maxLength: 255, label: 'Nom' },
    type: { enum: ['FOURNISSEUR', 'OPERATEUR_TELECOM', 'CONSTRUCTEUR', 'DISTRIBUTEUR', 'AUTRE'] },
  }),
  ctrl.create,
);

router.put(
  '/:id',
  checkPermission('fournisseurs'),
  validate({
    nom: { minLength: 1, maxLength: 255, label: 'Nom' },
    type: { enum: ['FOURNISSEUR', 'OPERATEUR_TELECOM', 'CONSTRUCTEUR', 'DISTRIBUTEUR', 'AUTRE'] },
    actif: { type: 'boolean' },
  }),
  ctrl.update,
);

router.delete('/:id', checkPermission('fournisseurs'), ctrl.softDelete);

export default router;
