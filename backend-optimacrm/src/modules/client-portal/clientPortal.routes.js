import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantMiddleware } from '../../middleware/tenantContext.js';
import { validate } from '../../middleware/validate.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { requireClientRole, clientContext } from './clientPortal.middleware.js';
import * as ctrl from './clientPortal.controller.js';

const router = Router();

// Endpoints publics sensibles (pas d'authentification en amont) : un
// limiteur par IP réduit le risque d'énumération de comptes via
// /auth/forgot-password (spam d'emails) et de bruteforce de token via
// /auth/reset-password. Fenêtres volontairement larges (15 min) pour ne pas
// gêner un usage légitime (plusieurs tentatives de saisie du mot de passe).
const forgotPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Trop de demandes de réinitialisation. Réessayez dans quelques minutes.',
});
const resetPasswordLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Trop de tentatives. Réessayez dans quelques minutes.',
});

// ── Auth client ─────────────────────────────────────────────────────────────
// Login utilise le même mécanisme que les internes (JWT en cookie) mais
// vérifie que le rôle est bien « client » après authentification.
router.post(
  '/auth/login',
  validate({
    email:    { required: true, type: 'email', label: 'Email' },
    password: { required: true, label: 'Mot de passe' },
  }),
  ctrl.login,
);

router.post('/auth/logout', ctrl.logout);

// Mot de passe oublié — self-service, public. Le message de réponse est
// toujours identique (voir clientPortal.controller.js) pour ne jamais
// révéler si un compte existe pour l'email fourni.
router.post(
  '/auth/forgot-password',
  forgotPasswordLimiter,
  validate({
    email: { required: true, type: 'email', label: 'Email' },
  }),
  ctrl.forgotPassword,
);

router.post(
  '/auth/reset-password',
  resetPasswordLimiter,
  validate({
    token:        { required: true, label: 'Token' },
    new_password: { required: true, minLength: 8, label: 'Nouveau mot de passe' },
  }),
  ctrl.resetPassword,
);

// ── Toutes les routes suivantes exigent un user authentifié de rôle client ──
router.use(authenticate);
router.use(requireClientRole);
router.use(tenantMiddleware);
router.use(clientContext);

// Profil
router.get('/auth/profile', ctrl.getProfile);
router.put(
  '/auth/change-password',
  validate({
    old_password: { required: true, label: 'Mot de passe actuel' },
    new_password: { required: true, minLength: 8, label: 'Nouveau mot de passe' },
  }),
  ctrl.changePassword,
);

// Branding (logo + couleur de la société, pour habiller le portail)
router.get('/branding', ctrl.getBranding);

// Types de contrats du client (pour menu adaptatif)
router.get('/contract-types', ctrl.getContractTypes);

// Dashboard
router.get('/dashboard', ctrl.getDashboard);

// Factures
router.get('/factures', ctrl.listFactures);
router.get('/factures/:id', ctrl.getFacture);
router.get('/factures/:id/pdf', ctrl.getFacturePdf);

// Tickets
router.get('/tickets', ctrl.listTickets);
router.get('/tickets/:id', ctrl.getTicket);
router.post(
  '/tickets',
  validate({
    sujet:       { required: true, minLength: 3, maxLength: 255, label: 'Sujet' },
    description: { required: true, minLength: 10, label: 'Description' },
  }),
  ctrl.createTicket,
);
router.post(
  '/tickets/:id/commentaires',
  validate({
    contenu: { required: true, minLength: 1, label: 'Commentaire' },
  }),
  ctrl.addTicketComment,
);

// Parc machines
router.get('/parc-machines', ctrl.listMachines);
router.get('/parc-machines/:id', ctrl.getMachine);

// Contrats
router.get('/contrats', ctrl.listContrats);
router.get('/contrats/:id', ctrl.getContrat);

export default router;
