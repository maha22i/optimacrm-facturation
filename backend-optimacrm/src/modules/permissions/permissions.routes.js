import { Router } from 'express';
import * as ctrl from './permissions.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

router.get('/available', authenticate, authorize('admin'), ctrl.getAvailable);
router.get('/user/:userId', authenticate, authorize('admin'), ctrl.getUserPermissions);
router.put('/user/:userId', authenticate, authorize('admin'), ctrl.setUserPermissions);

export default router;
