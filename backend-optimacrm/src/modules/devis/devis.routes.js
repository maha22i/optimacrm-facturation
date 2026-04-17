import { Router } from 'express';
import * as ctrl from './devis.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';
import { generateDevisPdf } from './pdf.service.js';

const router = Router();
router.use(authenticate);

const STATUT_ENUM = ['BROUILLON', 'ENVOYE', 'ACCEPTE', 'REFUSE', 'EXPIRE', 'FACTURE'];
const CONDITIONS_ENUM = ['COMPTANT', '15_JOURS', '30_JOURS', '45_JOURS_FIN_MOIS', '60_JOURS'];
const MODE_PAIEMENT_ENUM = ['VIREMENT', 'PRELEVEMENT_SEPA', 'CHEQUE', 'CARTE', 'ESPECES'];
const REMISE_TYPE_ENUM = ['POURCENTAGE', 'MONTANT_FIXE'];
const LIGNE_TYPE_ENUM = ['PRODUIT', 'SERVICE', 'COMMENTAIRE', 'SAUT_DE_LIGNE', 'SOUS_TOTAL'];
const CHAMP_TYPE_ENUM = ['TEXTE', 'NOMBRE', 'DATE', 'LISTE', 'BOOLEEN'];

// ── Devis ─────────────────────────────────────────────────────────────────

router.get('/', checkPermission('devis_read'), ctrl.listDevis);
router.get('/stats', checkPermission('devis_read'), ctrl.getDevisStats);

router.get('/:id/pdf', checkPermission('devis_read'), async (req, res, next) => {
  try {
    const { html } = await generateDevisPdf(parseInt(req.params.id));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
});

router.get('/:id', checkPermission('devis_read'), ctrl.getDevis);

router.post(
  '/',
  checkPermission('devis_write'),
  validate({
    client_id:            { required: true, label: 'Client' },
    objet:                { required: true, minLength: 2, maxLength: 500, label: 'Objet' },
    conditions_paiement:  { enum: CONDITIONS_ENUM },
    mode_paiement:        { enum: MODE_PAIEMENT_ENUM },
    remise_globale_type:  { enum: REMISE_TYPE_ENUM },
  }),
  ctrl.createDevis,
);

router.put(
  '/:id',
  checkPermission('devis_write'),
  validate({
    objet:                { minLength: 2, maxLength: 500, label: 'Objet' },
    conditions_paiement:  { enum: CONDITIONS_ENUM },
    mode_paiement:        { enum: MODE_PAIEMENT_ENUM },
    remise_globale_type:  { enum: REMISE_TYPE_ENUM },
  }),
  ctrl.updateDevis,
);

router.delete('/:id', checkPermission('devis_write'), ctrl.deleteDevis);

// ── Actions workflow ──────────────────────────────────────────────────────

router.post('/:id/envoyer', checkPermission('devis_write'), ctrl.envoyerDevis);
router.post('/:id/accepter', checkPermission('devis_write'), ctrl.accepterDevis);
router.post('/:id/refuser', checkPermission('devis_write'), ctrl.refuserDevis);
router.post('/:id/dupliquer', checkPermission('devis_write'), ctrl.dupliquerDevis);
router.post('/:id/transformer-facture', checkPermission('devis_write'), ctrl.transformerEnFacture);
router.post('/:id/transformer-bc', checkPermission('devis_write'), ctrl.transformerEnBC);

// ── Lignes ────────────────────────────────────────────────────────────────

router.post(
  '/:id/lignes',
  checkPermission('devis_write'),
  validate({
    type: { enum: LIGNE_TYPE_ENUM },
  }),
  ctrl.ajouterLigne,
);

router.put('/:id/lignes/reorder', checkPermission('devis_write'), ctrl.reorderLignes);

router.put(
  '/:id/lignes/:ligneId',
  checkPermission('devis_write'),
  validate({
    type: { enum: LIGNE_TYPE_ENUM },
    remise_ligne_type: { enum: REMISE_TYPE_ENUM },
  }),
  ctrl.modifierLigne,
);

router.delete('/:id/lignes/:ligneId', checkPermission('devis_write'), ctrl.supprimerLigne);

// ── Champs personnalisés ─────────────────────────────────────────────────

router.get('/:id/champs', checkPermission('devis_read'), ctrl.listChamps);

router.post(
  '/:id/champs',
  checkPermission('devis_write'),
  validate({
    cle:   { required: true, minLength: 1, maxLength: 100, label: 'Clé' },
    label: { required: true, minLength: 1, maxLength: 255, label: 'Label' },
    type:  { enum: CHAMP_TYPE_ENUM },
  }),
  ctrl.ajouterChamp,
);

router.put(
  '/:id/champs/:champId',
  checkPermission('devis_write'),
  validate({
    type: { enum: CHAMP_TYPE_ENUM },
  }),
  ctrl.modifierChamp,
);

router.post('/:id/champs/depuis-template/:templateId', checkPermission('devis_write'), ctrl.ajouterChampDepuisTemplate);
router.delete('/:id/champs/:champId', checkPermission('devis_write'), ctrl.supprimerChamp);

export default router;
