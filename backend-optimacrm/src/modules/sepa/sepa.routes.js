import { Router } from 'express';
import * as ctrl from './sepa.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';

const router = Router();
router.use(authenticate);

// ── Créancier ─────────────────────────────────────────────────────────────────
router.get('/creancier', checkPermission('factures_read'), ctrl.getCreancier);
router.post('/creancier', checkPermission('factures_write'), ctrl.upsertCreancier);

// ── Factures éligibles ────────────────────────────────────────────────────────
router.get('/factures-eligibles', checkPermission('factures_read'), ctrl.getFacturesEligibles);

// ── Génération ────────────────────────────────────────────────────────────────
router.post('/generer', checkPermission('factures_write'), ctrl.genererRemise);

// ── Historique ────────────────────────────────────────────────────────────────
router.get('/remises', checkPermission('factures_read'), ctrl.listRemises);
router.get('/remises/:id', checkPermission('factures_read'), ctrl.getRemiseDetail);
router.get('/remises/:id/xml', checkPermission('factures_read'), ctrl.getRemiseXml);

export default router;
