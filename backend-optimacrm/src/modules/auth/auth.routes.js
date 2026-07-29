import { Router } from 'express';
import * as ctrl from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { tenantMiddleware } from '../../middleware/tenantContext.js';
import { ApiError } from '../../utils/ApiError.js';

const router = Router();

function rejectClientRole(req, _res, next) {
  if (req.user?.role === 'client') {
    return next(ApiError.forbidden('Accès réservé aux utilisateurs internes'));
  }
  next();
}

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
router.get('/profile', authenticate, rejectClientRole, ctrl.getProfile);

router.put(
  '/profile',
  authenticate,
  rejectClientRole,
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
  rejectClientRole,
  validate({
    old_password: { required: true, label: 'Current password' },
    new_password: { required: true, minLength: 8, label: 'New password' },
  }),
  ctrl.changePassword,
);

// ── Admin & Admin Technique ─────────────────────────────────────────────────
//
// tenantMiddleware AJOUTÉ ici volontairement : ces routes gèrent la liste
// d'utilisateurs d'un tenant (écran "Utilisateurs"). Sans ce middleware,
// la policy RLS de `users` (069_rls_users) tombe systématiquement dans son
// escape clause (aucun contexte posé) et renvoie TOUS les utilisateurs,
// tous tenants confondus — exactement le problème signalé.
//
// Placé APRÈS `authenticate` (qui a besoin de charger req.user sans contexte,
// cf. authenticate.js) et AVANT `authorize`/la validation, pour que le
// contexte tenant soit actif pendant tout le traitement de la requête.
//
// Pour un super_admin (tenant_id NULL), tenantMiddleware fait next() sans
// poser de contexte (cf. tenantMiddleware) : il continue donc de voir tous
// les utilisateurs de tous les tenants via l'escape clause — comportement
// voulu pour un rôle cross-tenant.

router.post(
  '/users',
  authenticate,
  tenantMiddleware,
  authorize('admin', 'admin_technique'),
  validate({
    email:      { required: true, type: 'email', label: 'Email' },
    password:   { required: true, minLength: 8, label: 'Password' },
    first_name: { required: true, minLength: 2, maxLength: 100, label: 'First name' },
    last_name:  { required: true, minLength: 2, maxLength: 100, label: 'Last name' },
    role:       { enum: ['admin', 'user', 'admin_technique', 'technicien', 'client'] },
  }),
  ctrl.createUser,
);

router.get('/users',     authenticate, tenantMiddleware, authorize('admin', 'admin_technique'), ctrl.getAllUsers);
router.get('/users/:id', authenticate, tenantMiddleware, authorize('admin', 'admin_technique'), ctrl.getUserById);

router.put(
  '/users/:id',
  authenticate,
  tenantMiddleware,
  authorize('admin', 'admin_technique'),
  validate({
    first_name: { minLength: 2, maxLength: 100 },
    last_name:  { minLength: 2, maxLength: 100 },
    email:      { type: 'email' },
    role:       { enum: ['admin', 'user', 'admin_technique', 'technicien', 'client'] },
    is_active:  { type: 'boolean' },
  }),
  ctrl.updateUser,
);

router.delete('/users/:id', authenticate, tenantMiddleware, authorize('admin'), ctrl.deleteUser);

router.post('/users/:id/reset-password-link', authenticate, tenantMiddleware, authorize('admin', 'admin_technique'), ctrl.sendResetPasswordLink);

router.post(
  '/reset-password',
  validate({
    token:        { required: true, label: 'Token' },
    new_password: { required: true, minLength: 8, label: 'Nouveau mot de passe' },
  }),
  ctrl.resetPasswordWithToken,
);

export default router;
