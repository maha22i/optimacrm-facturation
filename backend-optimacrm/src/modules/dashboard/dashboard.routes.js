import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { getStats } from './dashboard.controller.js';

const router = Router();

router.get('/stats', authenticate, checkPermission('dashboard'), getStats);

export default router;
