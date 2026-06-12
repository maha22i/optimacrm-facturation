import { Router } from 'express';
import * as ctrl from './ticket.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';

const router = Router();

router.use(authenticate);

// ── Stats (avant /:id pour éviter conflit) ──────────────────────────────────
router.get('/stats', checkPermission('tickets_read'), ctrl.getStats);

// ── Catégories ──────────────────────────────────────────────────────────────
router.get('/categories', checkPermission('tickets_read'), ctrl.listCategories);

router.post(
  '/categories',
  checkPermission('tickets_admin'),
  validate({
    nom: { required: true, minLength: 2, maxLength: 100, label: 'Nom' },
  }),
  ctrl.createCategorie,
);

router.put(
  '/categories/:id',
  checkPermission('tickets_admin'),
  ctrl.updateCategorie,
);

router.delete('/categories/:id', checkPermission('tickets_admin'), ctrl.deleteCategorie);

// ── Règles SLA ──────────────────────────────────────────────────────────────
router.get('/sla-rules', checkPermission('tickets_read'), ctrl.listSlaRules);
router.put('/sla-rules/:id', checkPermission('tickets_admin'), ctrl.updateSlaRule);

// ── Tickets CRUD ────────────────────────────────────────────────────────────
router.get('/', checkPermission('tickets_read'), ctrl.listTickets);
router.get('/:id', checkPermission('tickets_read'), ctrl.getTicket);

router.post(
  '/',
  checkPermission('tickets_write'),
  validate({
    sujet:     { required: true, minLength: 2, maxLength: 255, label: 'Sujet' },
    client_id: { required: true, label: 'Client' },
    priorite:  { enum: ['basse', 'normale', 'haute', 'urgente'] },
  }),
  ctrl.createTicket,
);

router.put(
  '/:id',
  checkPermission('tickets_write'),
  validate({
    sujet:    { minLength: 2, maxLength: 255, label: 'Sujet' },
    priorite: { enum: ['basse', 'normale', 'haute', 'urgente'] },
  }),
  ctrl.updateTicket,
);

router.delete('/:id', checkPermission('tickets_admin'), ctrl.deleteTicket);

// ── Statut & Assignation ────────────────────────────────────────────────────
router.put(
  '/:id/statut',
  checkPermission('tickets_write'),
  validate({
    statut: { required: true, enum: ['nouveau', 'assigne', 'en_cours', 'en_attente', 'resolu'], label: 'Statut' },
  }),
  ctrl.changeStatut,
);

router.put('/:id/assigner', checkPermission('tickets_admin'), ctrl.assignerTechnicien);

// ── Commentaires ────────────────────────────────────────────────────────────
router.get('/:id/commentaires', checkPermission('tickets_read'), ctrl.listCommentaires);

router.post(
  '/:id/commentaires',
  checkPermission('tickets_write'),
  validate({
    contenu: { required: true, minLength: 1, label: 'Contenu' },
  }),
  ctrl.createCommentaire,
);

// ── Historique ──────────────────────────────────────────────────────────────
router.get('/:id/historique', checkPermission('tickets_read'), ctrl.listHistorique);

export default router;
