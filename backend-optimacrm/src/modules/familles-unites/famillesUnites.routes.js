import { Router } from 'express';
import * as ctrl from './famillesUnites.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';

const router = Router();
router.use(authenticate);

// ── Familles ─────────────────────────────────────────────────────────────────

router.get('/familles', checkPermission('familles_unites'), ctrl.listFamilles);

router.post(
  '/familles',
  checkPermission('familles_unites'),
  validate({
    nom: { required: true, minLength: 1, maxLength: 255, label: 'Nom' },
    categorie: { required: true, enum: ['COPIEUR', 'TELEPHONIE', 'INFORMATIQUE', 'SECURITE'], label: 'Catégorie' },
  }),
  ctrl.createFamille,
);

router.put(
  '/familles/:id',
  checkPermission('familles_unites'),
  validate({
    nom: { minLength: 1, maxLength: 255, label: 'Nom' },
    categorie: { enum: ['COPIEUR', 'TELEPHONIE', 'INFORMATIQUE', 'SECURITE'], label: 'Catégorie' },
    actif: { type: 'boolean' },
  }),
  ctrl.updateFamille,
);

router.delete('/familles/:id', checkPermission('familles_unites'), ctrl.deleteFamille);

// ── Unités ───────────────────────────────────────────────────────────────────

router.get('/unites', checkPermission('familles_unites'), ctrl.listUnites);

router.post(
  '/unites',
  checkPermission('familles_unites'),
  validate({
    nom: { required: true, minLength: 1, maxLength: 50, label: 'Nom' },
  }),
  ctrl.createUnite,
);

router.delete('/unites/:id', checkPermission('familles_unites'), ctrl.deleteUnite);

export default router;
