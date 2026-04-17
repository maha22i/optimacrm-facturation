import * as catalogueService from './catalogue.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

export async function listProduits(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { categorie, search, actif, fournisseur_id } = req.query;

    const result = await catalogueService.listProduits({ page, limit, categorie, search, actif, fournisseur_id });
    sendPaginated(res, result.produits, result.pagination);
  } catch (err) { next(err); }
}

export async function getCategories(req, res, next) {
  try {
    const categories = await catalogueService.getCategories();
    sendSuccess(res, categories);
  } catch (err) { next(err); }
}

export async function getProduit(req, res, next) {
  try {
    const produit = await catalogueService.getProduitById(parseInt(req.params.id));
    sendSuccess(res, produit);
  } catch (err) { next(err); }
}

export async function createProduit(req, res, next) {
  try {
    const produit = await catalogueService.createProduit(req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'produit_cree',
        module: 'catalogue',
        description: `Création du produit ${produit.designation || produit.reference || ''}`,
        entityType: 'produit',
        entityId: produit.id,
        entityLabel: produit.designation || produit.reference,
        details: { reference: produit.reference, designation: produit.designation },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, produit, 'Produit créé', 201);
  } catch (err) { next(err); }
}

export async function updateProduit(req, res, next) {
  try {
    const produit = await catalogueService.updateProduit(parseInt(req.params.id), req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'produit_modifie',
        module: 'catalogue',
        description: `Modification du produit ${produit.designation || produit.reference || ''}`,
        entityType: 'produit',
        entityId: produit.id,
        entityLabel: produit.designation || produit.reference,
        details: { champs_modifies: Object.keys(req.body) },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, produit, 'Produit mis à jour');
  } catch (err) { next(err); }
}

export async function deleteProduit(req, res, next) {
  try {
    const produit = await catalogueService.deleteProduit(parseInt(req.params.id));
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'produit_supprime',
        module: 'catalogue',
        description: `Suppression du produit ${produit.designation || produit.reference || ''}`,
        entityType: 'produit',
        entityId: produit.id,
        entityLabel: produit.designation || produit.reference,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, produit, 'Produit désactivé');
  } catch (err) { next(err); }
}

export async function duplicateProduit(req, res, next) {
  try {
    const produit = await catalogueService.duplicateProduit(parseInt(req.params.id));
    sendSuccess(res, produit, 'Produit dupliqué', 201);
  } catch (err) { next(err); }
}

export async function listTarifsClients(req, res, next) {
  try {
    const tarifs = await catalogueService.listTarifsClients(parseInt(req.params.id));
    sendSuccess(res, tarifs);
  } catch (err) { next(err); }
}

export async function createTarifClient(req, res, next) {
  try {
    const tarif = await catalogueService.createTarifClient(parseInt(req.params.id), req.body);
    sendSuccess(res, tarif, 'Tarif client créé', 201);
  } catch (err) { next(err); }
}

export async function updateTarifClient(req, res, next) {
  try {
    const tarif = await catalogueService.updateTarifClient(
      parseInt(req.params.id),
      parseInt(req.params.tid),
      req.body
    );
    sendSuccess(res, tarif, 'Tarif client mis à jour');
  } catch (err) { next(err); }
}

export async function deleteTarifClient(req, res, next) {
  try {
    const result = await catalogueService.deleteTarifClient(
      parseInt(req.params.id),
      parseInt(req.params.tid)
    );
    sendSuccess(res, result, 'Tarif client supprimé');
  } catch (err) { next(err); }
}

export async function uploadImage(req, res, next) {
  try {
    if (!req.file) return sendSuccess(res, null, 'Aucun fichier envoyé', 400);
    const result = await catalogueService.uploadImage(parseInt(req.params.id), req.file);
    sendSuccess(res, result, 'Image uploadée');
  } catch (err) { next(err); }
}

export async function deleteImage(req, res, next) {
  try {
    const result = await catalogueService.deleteImage(parseInt(req.params.id));
    sendSuccess(res, result, 'Image supprimée');
  } catch (err) { next(err); }
}

export async function getAdjacentIds(req, res, next) {
  try {
    const result = await catalogueService.getAdjacentIds(parseInt(req.params.id));
    sendSuccess(res, result);
  } catch (err) { next(err); }
}
