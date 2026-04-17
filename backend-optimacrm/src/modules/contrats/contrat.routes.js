import { Router } from 'express';
import * as ctrl from './contrat.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';

const router = Router();

router.use(authenticate);

// ── Stats ─────────────────────────────────────────────────────────────────
router.get('/stats', checkPermission('contrats_read'), ctrl.getStats);

// ── Contrats par client ───────────────────────────────────────────────────
router.get('/client/:clientId', checkPermission('contrats_read'), ctrl.getContratsByClient);

// ── Contrats CRUD ─────────────────────────────────────────────────────────

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
    statut:          { enum: ['Brouillon', 'Actif', 'Suspendu', 'Résilié', 'Échu', 'Renouvelé'] },
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
    statut:          { enum: ['Brouillon', 'Actif', 'Suspendu', 'Résilié', 'Échu', 'Renouvelé'] },
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
    categorie_ligne: { enum: [
      'Forfait Fixe', 'Forfait Mobile', 'Lien Internet', 'Location Matériel',
      'Services', 'Autre', 'Forfait Copie N&B', 'Forfait Copie Couleur',
      'Service Connectic', 'PLC', 'Hors Forfait',
    ]},
  }),
  ctrl.addLigne,
);

router.put(
  '/:id/lignes/:ligneId',
  checkPermission('contrats_write'),
  validate({
    categorie_ligne: { enum: [
      'Forfait Fixe', 'Forfait Mobile', 'Lien Internet', 'Location Matériel',
      'Services', 'Autre', 'Forfait Copie N&B', 'Forfait Copie Couleur',
      'Service Connectic', 'PLC', 'Hors Forfait',
    ]},
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
