import { Router } from 'express';
import * as ctrl from './avoir.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { generateAvoirPdf } from './avoir.pdf.service.js';

const router = Router();
router.use(authenticate);

router.get('/', checkPermission('factures_read'), ctrl.listAvoirs);

router.get('/:id/pdf', checkPermission('factures_read'), async (req, res, next) => {
  try {
    const { pdf, avoir } = await generateAvoirPdf(parseInt(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="avoir-${avoir.numero}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
});

router.get('/:id', checkPermission('factures_read'), ctrl.getAvoir);

router.post('/', checkPermission('factures_write'), ctrl.createAvoir);
router.put('/:id', checkPermission('factures_write'), ctrl.updateAvoir);

router.post('/:id/valider', checkPermission('factures_write'), ctrl.validerAvoir);
router.post('/:id/utiliser', checkPermission('factures_write'), ctrl.utiliserAvoir);
router.post('/:id/annuler', checkPermission('factures_write'), ctrl.annulerAvoir);

export default router;
