import { Router } from 'express';
import * as ctrl from './parcMachine.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantMiddleware } from '../../middleware/tenantContext.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { requireModule } from '../../middleware/requireModule.js';
import { validate } from '../../middleware/validate.js';

const router = Router();

router.use(authenticate);
router.use(requireModule('parc_machines'));
router.use(tenantMiddleware);

// ── Stats ─────────────────────────────────────────────────────────────────
router.get('/stats', checkPermission('parc_read'), ctrl.getStats);

// ── Check numéro de série ─────────────────────────────────────────────────
router.get('/check-numero-serie', checkPermission('parc_read'), ctrl.checkNumeroSerie);

// ── Machines par client ───────────────────────────────────────────────────
router.get('/by-client/:clientId', checkPermission('parc_read'), ctrl.getMachinesByClient);

// ── Export ─────────────────────────────────────────────────────────────────
router.get('/export', checkPermission('parc_read'), ctrl.exportMachines);

// ── Machines CRUD ─────────────────────────────────────────────────────────

router.get('/', checkPermission('parc_read'), ctrl.listMachines);
router.get('/:id', checkPermission('parc_read'), ctrl.getMachine);

router.post(
  '/',
  checkPermission('parc_write'),
  validate({
    numero_serie: { required: true, minLength: 1, label: 'Numéro de série' },
    designation: { required: true, minLength: 1, label: 'Désignation' },
    categorie: { enum: ['Copieur', 'Téléphonie', 'Informatique'], label: 'Catégorie' },
    statut: { enum: ['En service', 'En stock', 'En SAV', 'Retourné', 'Hors service'], label: 'Statut' },
  }),
  ctrl.createMachine,
);

router.put(
  '/:id',
  checkPermission('parc_write'),
  validate({
    categorie: { enum: ['Copieur', 'Téléphonie', 'Informatique'], label: 'Catégorie' },
    statut: { enum: ['En service', 'En stock', 'En SAV', 'Retourné', 'Hors service'], label: 'Statut' },
  }),
  ctrl.updateMachine,
);

router.delete('/:id', checkPermission('parc_write'), ctrl.deleteMachine);
router.post('/:id/duplicate', checkPermission('parc_write'), ctrl.duplicateMachine);

// ── Relevés compteurs ─────────────────────────────────────────────────────

router.get('/:id/releves', checkPermission('parc_read'), ctrl.listReleves);

router.post(
  '/:id/releves',
  checkPermission('parc_write'),
  validate({
    date_releve: { required: true, label: 'Date du relevé' },
    compteur_nb: { required: true, label: 'Compteur N/B' },
    compteur_couleur: { required: true, label: 'Compteur Couleur' },
  }),
  ctrl.createReleve,
);

router.put('/:id/releves/:releveId', checkPermission('parc_write'), ctrl.updateReleve);
router.delete('/:id/releves/:releveId', checkPermission('parc_write'), ctrl.deleteReleve);

export default router;
