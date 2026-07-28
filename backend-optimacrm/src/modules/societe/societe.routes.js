import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './societe.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantMiddleware } from '../../middleware/tenantContext.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.use(authenticate);
router.use(tenantMiddleware);

router.get('/', checkPermission('parametres_societe'), ctrl.getConfig);

router.put(
  '/',
  checkPermission('parametres_societe'),
  validate({
    raison_sociale:         { maxLength: 255, label: 'Raison sociale' },
    forme_juridique:        { enum: ['SARL', 'SAS', 'EURL', 'SA', 'SCI', 'AUTO_ENTREPRENEUR', 'ASSOCIATION', 'AUTRE'] },
    siret:                  { minLength: 14, maxLength: 14, label: 'SIRET' },
    email_contact:          { type: 'email', label: 'Email contact' },
    email_facturation:      { type: 'email', label: 'Email facturation' },
    prefixe_devis:          { minLength: 2, maxLength: 6, label: 'Préfixe devis' },
    prefixe_facture:        { minLength: 2, maxLength: 6, label: 'Préfixe facture' },
    prefixe_client:         { minLength: 2, maxLength: 6, label: 'Préfixe client' },
    prefixe_bon_commande:   { minLength: 2, maxLength: 6, label: 'Préfixe bon de commande' },
    remise_a_zero_annuelle: { type: 'boolean', label: 'Remise à zéro annuelle' },
  }),
  ctrl.updateConfig,
);

router.post('/logo', checkPermission('parametres_societe'), upload.single('logo'), ctrl.uploadLogo);
router.delete('/logo', checkPermission('parametres_societe'), ctrl.deleteLogo);

export default router;
