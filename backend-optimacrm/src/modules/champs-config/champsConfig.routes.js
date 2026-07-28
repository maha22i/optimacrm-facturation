import { Router } from 'express';
import * as ctrl from './champsConfig.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantMiddleware } from '../../middleware/tenantContext.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { requireModule } from '../../middleware/requireModule.js';
import { validate } from '../../middleware/validate.js';

const router = Router();
router.use(authenticate);
// tenantMiddleware TOUJOURS avant le routing (y compris pour les routes
// gatées par requireModule ci-dessous) : sans ça, une route de configuration
// qui matche (POST/PUT/DELETE, module actif) s'exécuterait sans aucun
// contexte RLS posé (pas de SET LOCAL app.current_tenant_id), et le DEFAULT
// current_setting(...) de la colonne tenant_id planterait en erreur brute
// ("unrecognized configuration parameter" ou "invalid input syntax for type
// uuid") au lieu de faire l'INSERT/UPDATE correctement. Bug réel observé :
// cf. revue du 27/07 — un sous-routeur monté AVANT tenantMiddleware saute la
// transaction pour toute requête qu'il traite lui-même, gatée ou non.
router.use(tenantMiddleware);

const ENTITE_ENUM = ['CLIENT', 'DEVIS', 'CATALOGUE', 'CONTRAT'];
const TYPE_ENUM = ['TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN'];

// requireModule appliqué route par route (jamais via .use() sur un
// sous-routeur) : un .use() sans restriction de méthode intercepte TOUTES
// les requêtes qui transitent par ce point du routeur, y compris les GET de
// lecture définis plus loin — bug réel observé : GET /sections renvoyait
// 403 "module désactivé" alors que la lecture doit rester ouverte (cf.
// commentaire plus bas). En l'attachant directement à chaque route
// POST/PUT/DELETE, il ne s'exécute que pour les méthodes+chemins réellement
// gatés, une fois qu'Express a déjà fait matcher route.
const requireChampsPerso = requireModule('champs_perso');

// ── Lecture (config + valeurs) — jamais bloquées par requireModule ────────
// Appelées par les pages Clients/Devis/Contrats à chaque affichage/
// enregistrement de fiche, y compris `saveValeurs` — bloquer cette dernière
// casserait l'enregistrement d'un client dès qu'il a une seule valeur de
// champ perso déjà saisie, un module désactivé ne doit jamais faire échouer
// une sauvegarde sur une page socle.
// Ordre important : /sections doit être déclaré avant /:id (même forme à un
// seul segment), sinon /:id matcherait /sections en premier.
router.get('/sections', checkPermission('champs_personnalises'), ctrl.getSections);

router.get('/valeurs/:entite/:entiteId', checkPermission('champs_personnalises'), ctrl.getConfigsWithValeurs);
router.put('/valeurs/:entite/:entiteId', checkPermission('champs_personnalises'), ctrl.saveValeurs);

router.get('/', checkPermission('champs_personnalises'), ctrl.listConfigs);

router.get('/:id', checkPermission('champs_personnalises'), ctrl.getConfig);

// ── Configuration (créer/modifier/supprimer une DÉFINITION) — gaté ────────

router.post(
  '/',
  requireChampsPerso,
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

router.put(
  '/:id',
  requireChampsPerso,
  checkPermission('champs_personnalises'),
  validate({
    label: { minLength: 1, maxLength: 255, label: 'Label' },
    cle:   { minLength: 1, maxLength: 100, label: 'Clé' },
    type:  { enum: TYPE_ENUM },
    actif: { type: 'boolean' },
  }),
  ctrl.updateConfig,
);

router.delete('/:id', requireChampsPerso, checkPermission('champs_personnalises'), ctrl.deleteConfig);

router.put('/sections/:entite/ordre', requireChampsPerso, checkPermission('champs_personnalises'), ctrl.updateSectionOrdre);
router.put('/sections/:entite/rename', requireChampsPerso, checkPermission('champs_personnalises'), ctrl.renameSection);
router.delete('/sections/:entite/:section', requireChampsPerso, checkPermission('champs_personnalises'), ctrl.deleteSection);

export default router;
