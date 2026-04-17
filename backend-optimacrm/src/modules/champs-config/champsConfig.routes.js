import { Router } from 'express';
import * as ctrl from './champsConfig.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';

const router = Router();
router.use(authenticate);

const ENTITE_ENUM = ['CLIENT', 'DEVIS', 'CATALOGUE', 'CONTRAT'];
const TYPE_ENUM = ['TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN'];

router.get('/sections', checkPermission('champs_personnalises'), ctrl.getSections);

router.put('/sections/:entite/ordre', checkPermission('champs_personnalises'), ctrl.updateSectionOrdre);
router.put('/sections/:entite/rename', checkPermission('champs_personnalises'), ctrl.renameSection);
router.delete('/sections/:entite/:section', checkPermission('champs_personnalises'), ctrl.deleteSection);

router.get('/valeurs/:entite/:entiteId', checkPermission('champs_personnalises'), ctrl.getConfigsWithValeurs);
router.put('/valeurs/:entite/:entiteId', checkPermission('champs_personnalises'), ctrl.saveValeurs);

router.get('/', checkPermission('champs_personnalises'), ctrl.listConfigs);

router.post(
  '/',
  checkPermission('champs_personnalises'),
  validate({
    entite:  { required: true, enum: ENTITE_ENUM, label: 'Entité' },
    section: { required: true, minLength: 1, maxLength: 100, label: 'Section' },
    label:   { required: true, minLength: 1, maxLength: 255, label: 'Label' },
    cle:     { required: true, minLength: 1, maxLength: 100, label: 'Clé' },
    type:    { enum: TYPE_ENUM },
  }),
  ctrl.createConfig,
);

router.get('/:id', checkPermission('champs_personnalises'), ctrl.getConfig);

router.put(
  '/:id',
  checkPermission('champs_personnalises'),
  validate({
    label: { minLength: 1, maxLength: 255, label: 'Label' },
    cle:   { minLength: 1, maxLength: 100, label: 'Clé' },
    type:  { enum: TYPE_ENUM },
    actif: { type: 'boolean' },
  }),
  ctrl.updateConfig,
);

router.delete('/:id', checkPermission('champs_personnalises'), ctrl.deleteConfig);

export default router;
