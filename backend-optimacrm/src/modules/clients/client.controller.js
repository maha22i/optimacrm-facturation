import * as clientService from './client.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

// ---------------------------------------------------------------------------
// CLIENTS
// ---------------------------------------------------------------------------

export async function listClients(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const { statut, search } = req.query;

    const { clients, pagination } = await clientService.listClients({ page, limit, statut, search });
    sendPaginated(res, clients, pagination);
  } catch (err) { next(err); }
}

export async function getClient(req, res, next) {
  try {
    const client = await clientService.getClientById(parseInt(req.params.id));
    sendSuccess(res, client);
  } catch (err) { next(err); }
}

export async function createClient(req, res, next) {
  try {
    const client = await clientService.createClient(req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'client_cree',
        module: 'clients',
        description: `Création du client ${client.raison_sociale}`,
        entityType: 'client',
        entityId: client.id,
        entityLabel: client.raison_sociale,
        details: { numero_client: client.numero_client, raison_sociale: client.raison_sociale },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, client, 'Client créé avec succès', 201);
  } catch (err) { next(err); }
}

export async function updateClient(req, res, next) {
  try {
    const client = await clientService.updateClient(parseInt(req.params.id), req.body);
    try {
      const changedFields = Object.keys(req.body).filter(k => req.body[k] !== undefined);
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'client_modifie',
        module: 'clients',
        description: `Modification du client ${client.raison_sociale}`,
        entityType: 'client',
        entityId: client.id,
        entityLabel: client.raison_sociale,
        details: { champs_modifies: changedFields },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, client, 'Client mis à jour');
  } catch (err) { next(err); }
}

export async function deleteClient(req, res, next) {
  try {
    const client = await clientService.deleteClient(parseInt(req.params.id));
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'client_supprime',
        module: 'clients',
        description: `Suppression du client ${client.raison_sociale}`,
        entityType: 'client',
        entityId: client.id,
        entityLabel: client.raison_sociale,
        details: { raison_sociale: client.raison_sociale, numero_client: client.numero_client },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, client, 'Client passé en inactif');
  } catch (err) { next(err); }
}

export async function getClientStats(req, res, next) {
  try {
    const stats = await clientService.getClientStats(parseInt(req.params.id));
    sendSuccess(res, stats);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// ADRESSES
// ---------------------------------------------------------------------------

export async function listAdresses(req, res, next) {
  try {
    const adresses = await clientService.listAdresses(parseInt(req.params.id));
    sendSuccess(res, adresses);
  } catch (err) { next(err); }
}

export async function createAdresse(req, res, next) {
  try {
    const adresse = await clientService.createAdresse(parseInt(req.params.id), req.body);
    sendSuccess(res, adresse, 'Adresse ajoutée', 201);
  } catch (err) { next(err); }
}

export async function updateAdresse(req, res, next) {
  try {
    const adresse = await clientService.updateAdresse(
      parseInt(req.params.id),
      parseInt(req.params.adresseId),
      req.body,
    );
    sendSuccess(res, adresse, 'Adresse mise à jour');
  } catch (err) { next(err); }
}

export async function deleteAdresse(req, res, next) {
  try {
    await clientService.deleteAdresse(parseInt(req.params.id), parseInt(req.params.adresseId));
    sendSuccess(res, null, 'Adresse supprimée');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// CONTACTS
// ---------------------------------------------------------------------------

export async function listContacts(req, res, next) {
  try {
    const contacts = await clientService.listContacts(parseInt(req.params.id));
    sendSuccess(res, contacts);
  } catch (err) { next(err); }
}

export async function createContact(req, res, next) {
  try {
    const contact = await clientService.createContact(parseInt(req.params.id), req.body);
    sendSuccess(res, contact, 'Contact ajouté', 201);
  } catch (err) { next(err); }
}

export async function updateContact(req, res, next) {
  try {
    const contact = await clientService.updateContact(
      parseInt(req.params.id),
      parseInt(req.params.contactId),
      req.body,
    );
    sendSuccess(res, contact, 'Contact mis à jour');
  } catch (err) { next(err); }
}

export async function deleteContact(req, res, next) {
  try {
    await clientService.deleteContact(parseInt(req.params.id), parseInt(req.params.contactId));
    sendSuccess(res, null, 'Contact supprimé');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// DOCUMENTS
// ---------------------------------------------------------------------------

export async function listDocuments(req, res, next) {
  try {
    const docs = await clientService.listDocuments(parseInt(req.params.id));
    sendSuccess(res, docs);
  } catch (err) { next(err); }
}

export async function createDocument(req, res, next) {
  try {
    const doc = await clientService.createDocument(parseInt(req.params.id), req.body);
    sendSuccess(res, doc, 'Document ajouté', 201);
  } catch (err) { next(err); }
}

export async function deleteDocument(req, res, next) {
  try {
    await clientService.deleteDocument(parseInt(req.params.id), parseInt(req.params.documentId));
    sendSuccess(res, null, 'Document supprimé');
  } catch (err) { next(err); }
}
