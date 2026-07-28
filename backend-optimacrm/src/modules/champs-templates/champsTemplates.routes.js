import { Router } from 'express';
import * as ctrl from './champsTemplates.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantMiddleware } from '../../middleware/tenantContext.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { requireModule } from '../../middleware/requireModule.js';
import { validate } from '../../middleware/validate.js';

const router = Router();
router.use(authenticate);
// tenantMiddleware TOUJOURS avant le routing : cf. champsConfig.routes.js
// pour l'explication détaillée du bug (contexte RLS sauté si une route
// gatée est traitée par un sous-routeur monté avant tenantMiddleware).
router.use(tenantMiddleware);

const TYPE_ENUM = ['TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN'];

// requireModule appliqué route par route, jamais via .use() sur un
// sous-routeur — cf. champsConfig.routes.js pour l'explication du bug
// (un .use() sans restriction de méthode bloquerait aussi les GET de
// lecture ci-dessous, alors qu'ils doivent rester ouverts).
const requireChampsPerso = requireModule('champs_perso');

// ── Lecture — jamais bloquée par requireModule ─────────────────────────────
// Utilisée par les pages Devis pour peupler le sélecteur de champ perso à
// l'ajout d'une ligne — la bloquer casserait une fonctionnalité socle
// (création de devis) pour un simple toggle de module admin.
// Ordre important : /categories doit être déclaré avant /:id (même forme à
// un seul segment), sinon /:id matcherait /categories en premier.
router.get('/', checkPermission('champs_templates'), ctrl.listTemplates);
router.get('/categories', checkPermission('champs_templates'), ctrl.getCategories);
router.get('/:id', checkPermission('champs_templates'), ctrl.getTemplate);

// ── Gestion des DÉFINITIONS de templates (créer/modifier/supprimer) — gaté ─
// Utilisée par la page admin « Champs devis ».
router.post(
  '/',
  requireChampsPerso,
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
  requireChampsPerso,
  checkPermission('champs_templates'),
  validate({
    label: { minLength: 1, maxLength: 255, label: 'Label' },
    cle:   { minLength: 1, maxLength: 100, label: 'Clé' },
    type:  { enum: TYPE_ENUM },
    actif: { type: 'boolean' },
  }),
  ctrl.updateTemplate,
);

router.delete('/:id', requireChampsPerso, checkPermission('champs_templates'), ctrl.deleteTemplate);

export default router;
