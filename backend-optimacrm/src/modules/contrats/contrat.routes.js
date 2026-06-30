import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './contrat.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import { ALL_CATEGORIES } from '../../config/contratCategories.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const uploadMulti = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }).fields([
  { name: 'file', maxCount: 1 },
  { name: 'logiciels', maxCount: 1 },
]);

router.use(authenticate);

// ── Catégories de lignes par type ─────────────────────────────────────────
router.get('/categories', ctrl.getCategories);

// ── Import contrats générique (paramétré par :type) ───────────────────────
router.post('/import/:type/preview', checkPermission('contrats_write'), upload.single('file'), ctrl.previewImportContrats);
router.post('/import/:type/execute', checkPermission('contrats_write'), uploadMulti, ctrl.importContratsExecute);

// ── Stats ─────────────────────────────────────────────────────────────────
router.get('/stats', checkPermission('contrats_read'), ctrl.getStats);

// ── Contrats par client ───────────────────────────────────────────────────
router.get('/client/:clientId', checkPermission('contrats_read'), ctrl.getContratsByClient);

// ── Export ─────────────────────────────────────────────────────────────────
router.get('/export', checkPermission('contrats_read'), ctrl.exportContrats);

// ── Contrats CRUD ─────────────────────────────────────────────────────────

router.delete('/all', checkPermission('contrats_write'), ctrl.deleteAllContrats);
router.post('/bulk-delete', checkPermission('contrats_write'), ctrl.bulkDeleteContrats);
router.post('/bulk-status', checkPermission('contrats_write'), ctrl.bulkUpdateStatut);

router.get('/', checkPermission('contrats_read'), ctrl.listContrats);
router.get('/:id', checkPermission('contrats_read'), ctrl.getContrat);

router.post(
  '/',
  checkPermission('contrats_write'),
  validate({
    type_contrat:    { required: true, enum: ['Copieur', 'Telephonie', 'Informatique', 'Securite'], label: 'Type de contrat' },
    client_id:       { required: true, label: 'Client' },
    date_debut:      { required: true, label: 'Date de début' },
    type_facturation: { enum: ['Unique', 'Periodique'] },
    periodicite:     { enum: ['Mensuel', 'Bimestriel', 'Trimestriel', 'Semestriel', 'Annuel'] },
    statut:          { enum: ['Brouillon', 'Actif', 'Suspendu', 'Résilié', 'Échu', 'Renouvelé', 'Inactif'] },
    terme_facturation: { enum: ['TAE', 'TEC'] },
  }),
  ctrl.createContrat,
);

router.put(
  '/:id',
  checkPermission('contrats_write'),
  validate({
    type_contrat:    { enum: ['Copieur', 'Telephonie', 'Informatique', 'Securite'], label: 'Type de contrat' },
    type_facturation: { enum: ['Unique', 'Periodique'] },
    periodicite:     { enum: ['Mensuel', 'Bimestriel', 'Trimestriel', 'Semestriel', 'Annuel'] },
    statut:          { enum: ['Brouillon', 'Actif', 'Suspendu', 'Résilié', 'Échu', 'Renouvelé', 'Inactif'] },
    terme_facturation: { enum: ['TAE', 'TEC'] },
  }),
  ctrl.updateContrat,
);

router.delete('/:id', checkPermission('contrats_write'), ctrl.deleteContrat);
router.post('/:id/duplicate', checkPermission('contrats_write'), ctrl.duplicateContrat);
router.post('/:id/generer-facture', checkPermission('factures_write'), ctrl.genererFacture);

// ── Lignes ────────────────────────────────────────────────────────────────

router.post(
  '/:id/lignes',
  checkPermission('contrats_write'),
  validate({
    designation: { required: true, minLength: 1, label: 'Désignation' },
    categorie_ligne: { enum: ALL_CATEGORIES },
  }),
  ctrl.addLigne,
);

router.put(
  '/:id/lignes/:ligneId',
  checkPermission('contrats_write'),
  validate({
    categorie_ligne: { enum: ALL_CATEGORIES },
  }),
  ctrl.updateLigne,
);

router.delete('/:id/lignes/:ligneId', checkPermission('contrats_write'), ctrl.deleteLigne);

// ── Machines ──────────────────────────────────────────────────────────────

router.post(
  '/:id/machines',
  checkPermission('contrats_write'),
  validate({
    numero_serie: { required: true, minLength: 1, label: 'Numéro de série' },
  }),
  ctrl.addMachine,
);

router.put('/:id/machines/:machineId', checkPermission('contrats_write'), ctrl.updateMachine);
router.delete('/:id/machines/:machineId', checkPermission('contrats_write'), ctrl.deleteMachine);

export default router;
