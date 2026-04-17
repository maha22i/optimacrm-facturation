import { Router } from 'express';
import * as ctrl from './champsTemplates.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';

const router = Router();
router.use(authenticate);

const TYPE_ENUM = ['TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN'];

router.get('/', checkPermission('champs_templates'), ctrl.listTemplates);
router.get('/categories', checkPermission('champs_templates'), ctrl.getCategories);
router.get('/:id', checkPermission('champs_templates'), ctrl.getTemplate);

router.post(
  '/',
  checkPermission('champs_templates'),
  validate({
    label: { required: true, minLength: 1, maxLength: 255, label: 'Label' },
    cle:   { required: true, minLength: 1, maxLength: 100, label: 'Clé' },
    type:  { enum: TYPE_ENUM },
  }),
  ctrl.createTemplate,
);

router.put(
  '/:id',
  checkPermission('champs_templates'),
  validate({
    label: { minLength: 1, maxLength: 255, label: 'Label' },
    cle:   { minLength: 1, maxLength: 100, label: 'Clé' },
    type:  { enum: TYPE_ENUM },
    actif: { type: 'boolean' },
  }),
  ctrl.updateTemplate,
);

router.delete('/:id', checkPermission('champs_templates'), ctrl.deleteTemplate);

export default router;
