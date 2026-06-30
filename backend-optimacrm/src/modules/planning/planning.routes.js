import { Router } from 'express';
import * as ctrl from './planning.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';

const router = Router();

router.use(authenticate);

router.get('/', checkPermission('tickets_read'), ctrl.listCreneaux);
router.get('/tickets-disponibles', checkPermission('tickets_read'), ctrl.listTicketsDisponibles);
router.post('/', checkPermission('tickets_write'), ctrl.createCreneau);
router.put('/:id', checkPermission('tickets_write'), ctrl.updateCreneau);
router.delete('/:id', checkPermission('tickets_write'), ctrl.deleteCreneau);

export default router;
