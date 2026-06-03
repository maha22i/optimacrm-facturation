import { Router } from 'express';
import multer from 'multer';
import * as ctrl from './client.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { checkPermission } from '../../middleware/checkPermission.js';
import { validate } from '../../middleware/validate.js';

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.use(authenticate);

// ── Clients ────────────────────────────────────────────────────────────────

router.get('/export', checkPermission('clients_read'), ctrl.exportClients);

router.get('/', checkPermission('clients_read'), ctrl.listClients);
router.get('/:id', checkPermission('clients_read'), ctrl.getClient);
router.get('/:id/stats', checkPermission('clients_read'), ctrl.getClientStats);

router.post(
  '/',
  checkPermission('clients_write'),
  validate({
    raison_sociale:    { required: true, minLength: 2, maxLength: 255, label: 'Raison sociale' },
    email_principal:   { required: true, type: 'email', label: 'Email principal' },
    forme_juridique:   { enum: ['SARL','SAS','EURL','SA','SCI','AUTO_ENTREPRENEUR','ASSOCIATION','AUTRE'] },
    siret:             { minLength: 14, maxLength: 14, label: 'SIRET' },
    statut:            { enum: ['ACTIF','INACTIF','BLOQUE','PROSPECT'] },
    taux_tva_defaut:   { enum: [20, 10, 5.5, 0] },
    delai_paiement:    { enum: ['COMPTANT','15_JOURS','30_JOURS','45_JOURS_FIN_MOIS','60_JOURS'] },
    mode_paiement_prefere: { enum: ['VIREMENT','PRELEVEMENT_SEPA','CHEQUE','CARTE','ESPECES'] },
  }),
  ctrl.createClient,
);

router.put(
  '/:id',
  checkPermission('clients_write'),
  validate({
    raison_sociale:    { minLength: 2, maxLength: 255, label: 'Raison sociale' },
    email_principal:   { type: 'email', label: 'Email principal' },
    forme_juridique:   { enum: ['SARL','SAS','EURL','SA','SCI','AUTO_ENTREPRENEUR','ASSOCIATION','AUTRE'] },
    siret:             { minLength: 14, maxLength: 14, label: 'SIRET' },
    statut:            { enum: ['ACTIF','INACTIF','BLOQUE','PROSPECT'] },
    taux_tva_defaut:   { enum: [20, 10, 5.5, 0] },
    delai_paiement:    { enum: ['COMPTANT','15_JOURS','30_JOURS','45_JOURS_FIN_MOIS','60_JOURS'] },
    mode_paiement_prefere: { enum: ['VIREMENT','PRELEVEMENT_SEPA','CHEQUE','CARTE','ESPECES'] },
  }),
  ctrl.updateClient,
);

router.delete('/all', checkPermission('clients_write'), ctrl.deleteAllClients);
router.delete('/:id', checkPermission('clients_write'), ctrl.deleteClient);

// ── Adresses ───────────────────────────────────────────────────────────────

router.get('/:id/adresses', checkPermission('clients_read'), ctrl.listAdresses);

router.post(
  '/:id/adresses',
  checkPermission('clients_write'),
  validate({
    ligne1:      { required: true, minLength: 2, label: 'Adresse ligne 1' },
    code_postal: { required: true, minLength: 3, maxLength: 10, label: 'Code postal' },
    ville:       { required: true, minLength: 2, label: 'Ville' },
    type:        { enum: ['FACTURATION','LIVRAISON','SIEGE'] },
    est_defaut:  { type: 'boolean' },
  }),
  ctrl.createAdresse,
);

router.put(
  '/:id/adresses/:adresseId',
  checkPermission('clients_write'),
  validate({
    ligne1:      { minLength: 2, label: 'Adresse ligne 1' },
    code_postal: { minLength: 3, maxLength: 10, label: 'Code postal' },
    ville:       { minLength: 2, label: 'Ville' },
    type:        { enum: ['FACTURATION','LIVRAISON','SIEGE'] },
    est_defaut:  { type: 'boolean' },
  }),
  ctrl.updateAdresse,
);

router.delete('/:id/adresses/:adresseId', checkPermission('clients_write'), ctrl.deleteAdresse);

// ── Contacts ───────────────────────────────────────────────────────────────

router.get('/:id/contacts', checkPermission('clients_read'), ctrl.listContacts);

router.post(
  '/:id/contacts',
  checkPermission('clients_write'),
  validate({
    nom:    { required: true, minLength: 2, maxLength: 100, label: 'Nom' },
    prenom: { required: true, minLength: 2, maxLength: 100, label: 'Prénom' },
    role:   { enum: ['PRINCIPAL','COMPTABILITE','TECHNIQUE','AUTRE'] },
    email:  { type: 'email', label: 'Email' },
    est_principal: { type: 'boolean' },
  }),
  ctrl.createContact,
);

router.put(
  '/:id/contacts/:contactId',
  checkPermission('clients_write'),
  validate({
    nom:    { minLength: 2, maxLength: 100, label: 'Nom' },
    prenom: { minLength: 2, maxLength: 100, label: 'Prénom' },
    role:   { enum: ['PRINCIPAL','COMPTABILITE','TECHNIQUE','AUTRE'] },
    email:  { type: 'email', label: 'Email' },
    est_principal: { type: 'boolean' },
  }),
  ctrl.updateContact,
);

router.delete('/:id/contacts/:contactId', checkPermission('clients_write'), ctrl.deleteContact);

// ── Documents ──────────────────────────────────────────────────────────────

router.get('/:id/documents', checkPermission('clients_read'), ctrl.listDocuments);

router.post(
  '/:id/documents',
  checkPermission('clients_write'),
  uploadDoc.single('file'),
  ctrl.createDocument,
);

router.delete('/:id/documents/:documentId', checkPermission('clients_write'), ctrl.deleteDocument);

export default router;
