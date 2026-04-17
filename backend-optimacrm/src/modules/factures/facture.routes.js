import { Router } from 'express';
import * as ctrl from './facture.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import { generateFacturePdf } from './pdf.service.js';

const router = Router();
router.use(authenticate);

// ── Factures — CRUD ──────────────────────────────────────────────────────

router.get('/', checkPermission('factures_read'), ctrl.listFactures);
router.get('/stats', checkPermission('factures_read'), ctrl.getFacturesStats);
router.get('/contrats-a-facturer', checkPermission('factures_write'), ctrl.getContratsAFacturer);
router.get('/releves-disponibles/:contratId', checkPermission('factures_read'), ctrl.getRelevesDisponibles);

router.get('/:id/pdf', checkPermission('factures_read'), async (req, res, next) => {
  try {
    const { pdf, facture } = await generateFacturePdf(parseInt(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="facture-${facture.numero_facture}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

router.get('/:id', checkPermission('factures_read'), ctrl.getFacture);

router.post(
  '/',
  checkPermission('factures_write'),
  validate({ client_id: { required: true, label: 'Client' } }),
  ctrl.createFacture,
);

router.put('/:id', checkPermission('factures_write'), ctrl.updateFacture);
router.delete('/:id', checkPermission('factures_write'), ctrl.deleteFacture);

// ── Actions workflow ─────────────────────────────────────────────────────

router.post('/:id/valider', checkPermission('factures_write'), ctrl.validerFacture);
router.post('/:id/envoyer', checkPermission('factures_write'), ctrl.envoyerFacture);
router.post('/:id/envoyer-email', checkPermission('factures_write'), ctrl.envoyerFactureEmail);
router.get('/:id/email-template', checkPermission('factures_read'), ctrl.getFactureEmailTemplate);
router.post('/:id/annuler', checkPermission('factures_write'), ctrl.annulerFacture);
router.post('/:id/dupliquer', checkPermission('factures_write'), ctrl.dupliquerFacture);

// ── Génération ───────────────────────────────────────────────────────────

router.post('/generer-depuis-contrat/:contratId', checkPermission('factures_write'), ctrl.genererDepuisContrat);
router.post('/generer-depuis-devis/:devisId', checkPermission('factures_write'), ctrl.genererDepuisDevis);
router.post('/generer-lot', checkPermission('factures_write'), ctrl.executerGenerationLot);

export default router;
