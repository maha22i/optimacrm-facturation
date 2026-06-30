import { Router } from 'express';
import * as ctrl from './devis.public.controller.js';

/**
 * Routes PUBLIQUES de signature de devis — montées sans le middleware
 * d'authentification JWT. Le devis est identifié uniquement par son
 * token_public (64 caractères hex, généré à l'envoi du devis).
 */
const router = Router();

router.get('/:token', ctrl.getDevisPublic);
router.post('/:token/demander-code', ctrl.demanderCode);
router.post('/:token/verifier-code', ctrl.verifierCode);
router.post('/:token/signer', ctrl.signerDevis);

export default router;
