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

// ── Admin & Admin Technique ─────────────────────────────────────────────────

router.post(
  '/users',
  authenticate,
  authorize('admin', 'admin_technique'),
  validate({
    email:      { required: true, type: 'email', label: 'Email' },
    password:   { required: true, minLength: 8, label: 'Password' },
    first_name: { required: true, minLength: 2, maxLength: 100, label: 'First name' },
    last_name:  { required: true, minLength: 2, maxLength: 100, label: 'Last name' },
    role:       { enum: ['admin', 'user', 'admin_technique', 'technicien'] },
  }),
  ctrl.createUser,
);

router.get('/users',     authenticate, authorize('admin', 'admin_technique'), ctrl.getAllUsers);
router.get('/users/:id', authenticate, authorize('admin', 'admin_technique'), ctrl.getUserById);

router.put(
  '/users/:id',
  authenticate,
  authorize('admin', 'admin_technique'),
  validate({
    first_name: { minLength: 2, maxLength: 100 },
    last_name:  { minLength: 2, maxLength: 100 },
    email:      { type: 'email' },
    role:       { enum: ['admin', 'user', 'admin_technique', 'technicien'] },
    is_active:  { type: 'boolean' },
  }),
  ctrl.updateUser,
);

router.delete('/users/:id', authenticate, authorize('admin'), ctrl.deleteUser);

router.post('/users/:id/reset-password-link', authenticate, authorize('admin', 'admin_technique'), ctrl.sendResetPasswordLink);

router.post(
  '/reset-password',
  validate({
    token:        { required: true, label: 'Token' },
    new_password: { required: true, minLength: 8, label: 'Nouveau mot de passe' },
  }),
  ctrl.resetPasswordWithToken,
);

export default router;
