import { Router } from 'express';
import * as ctrl from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';

const router = Router();

// ── Public ──────────────────────────────────────────────────────────────────

router.post(
  '/register',
  validate({
    email:      { required: true, type: 'email', label: 'Email' },
    password:   { required: true, minLength: 8, label: 'Password' },
    first_name: { required: true, minLength: 2, maxLength: 100, label: 'First name' },
    last_name:  { required: true, minLength: 2, maxLength: 100, label: 'Last name' },
  }),
  ctrl.register,
);

router.post(
  '/login',
  validate({
    email:    { required: true, type: 'email', label: 'Email' },
    password: { required: true, label: 'Password' },
  }),
  ctrl.login,
);

// ── Authenticated ───────────────────────────────────────────────────────────

router.post('/logout', ctrl.logout);
router.get('/profile', authenticate, ctrl.getProfile);

router.put(
  '/profile',
  authenticate,
  validate({
    first_name: { minLength: 2, maxLength: 100 },
    last_name:  { minLength: 2, maxLength: 100 },
    email:      { type: 'email' },
  }),
  ctrl.updateProfile,
);

router.put(
  '/change-password',
  authenticate,
  validate({
    old_password: { required: true, label: 'Current password' },
    new_password: { required: true, minLength: 8, label: 'New password' },
  }),
  ctrl.changePassword,
);

// ── Admin only ──────────────────────────────────────────────────────────────

router.post(
  '/users',
  authenticate,
  authorize('admin'),
  validate({
    email:      { required: true, type: 'email', label: 'Email' },
    password:   { required: true, minLength: 8, label: 'Password' },
    first_name: { required: true, minLength: 2, maxLength: 100, label: 'First name' },
    last_name:  { required: true, minLength: 2, maxLength: 100, label: 'Last name' },
    role:       { enum: ['admin', 'user'] },
  }),
  ctrl.createUser,
);

router.get('/users',     authenticate, authorize('admin'), ctrl.getAllUsers);
router.get('/users/:id', authenticate, authorize('admin'), ctrl.getUserById);

router.put(
  '/users/:id',
  authenticate,
  authorize('admin'),
  validate({
    first_name: { minLength: 2, maxLength: 100 },
    last_name:  { minLength: 2, maxLength: 100 },
    email:      { type: 'email' },
    role:       { enum: ['admin', 'user'] },
    is_active:  { type: 'boolean' },
  }),
  ctrl.updateUser,
);

router.delete('/users/:id', authenticate, authorize('admin'), ctrl.deleteUser);

export default router;
