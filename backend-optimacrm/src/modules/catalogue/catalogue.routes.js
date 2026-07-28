import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './catalogue.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantMiddleware } from '../../middleware/tenantContext.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { requireModule } from '../../middleware/requireModule.js';
import { validate } from '../../middleware/validate.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const router = Router();
router.use(authenticate);
router.use(requireModule('catalogue'));
router.use(tenantMiddleware);

router.get('/export', checkPermission('catalogue_read'), ctrl.exportProduits);

router.get('/', checkPermission('catalogue_read'), ctrl.listProduits);
router.get('/categories', checkPermission('catalogue_read'), ctrl.getCategories);
router.get('/:id', checkPermission('catalogue_read'), ctrl.getProduit);
router.get('/:id/adjacent', checkPermission('catalogue_read'), ctrl.getAdjacentIds);

router.post(
  '/',
  checkPermission('catalogue_write'),
  validate({
    reference:   { required: true, minLength: 1, maxLength: 50, label: 'Référence' },
    designation: { required: true, minLength: 2, maxLength: 255, label: 'Désignation' },
    taux_tva:    { enum: [20, 10, 5.5, 0] },
  }),
  ctrl.createProduit,
);

router.put(
  '/:id',
  checkPermission('catalogue_write'),
  validate({
    reference:   { minLength: 1, maxLength: 50, label: 'Référence' },
    designation: { minLength: 2, maxLength: 255, label: 'Désignation' },
    taux_tva:    { enum: [20, 10, 5.5, 0] },
    actif:       { type: 'boolean' },
  }),
  ctrl.updateProduit,
);

router.delete('/all', checkPermission('catalogue_write'), ctrl.deleteAllProduits);
router.delete('/:id', checkPermission('catalogue_write'), ctrl.deleteProduit);

router.post('/:id/duplicate', checkPermission('catalogue_write'), ctrl.duplicateProduit);

router.post('/:id/image', checkPermission('catalogue_write'), upload.single('image'), ctrl.uploadImage);
router.delete('/:id/image', checkPermission('catalogue_write'), ctrl.deleteImage);

router.get('/:id/tarifs-clients', checkPermission('catalogue_read'), ctrl.listTarifsClients);
router.post(
  '/:id/tarifs-clients',
  checkPermission('catalogue_write'),
  validate({
    client_id:  { required: true, label: 'Client' },
    prix_vente: { required: true, label: 'Prix de vente' },
  }),
  ctrl.createTarifClient,
);
router.put('/:id/tarifs-clients/:tid', checkPermission('catalogue_write'), ctrl.updateTarifClient);
router.delete('/:id/tarifs-clients/:tid', checkPermission('catalogue_write'), ctrl.deleteTarifClient);

export default router;
