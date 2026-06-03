import * as avoirService from './avoir.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

export async function listAvoirs(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const { statut, client_id, date_debut, date_fin, search } = req.query;
    const result = await avoirService.listAvoirs({ page, limit, statut, client_id, date_debut, date_fin, search });
    sendPaginated(res, result.avoirs, result.pagination);
  } catch (err) { next(err); }
}

export async function getAvoir(req, res, next) {
  try {
    const avoir = await avoirService.getAvoirById(parseInt(req.params.id));
    sendSuccess(res, avoir);
  } catch (err) { next(err); }
}

export async function getAvoirsPossibles(req, res, next) {
  try {
    const data = await avoirService.getAvoirsPossibles(parseInt(req.params.id));
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function createAvoir(req, res, next) {
  try {
    const avoir = await avoirService.createAvoir(req.body, req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'avoir_cree', module: 'Avoirs',
        description: `Avoir ${avoir.numero} créé (${avoir.type_avoir}) sur facture ${avoir.numero_facture}`,
        entityType: 'avoir', entityId: avoir.id, entityLabel: avoir.numero,
        details: { montant_ttc: avoir.montant_ttc, type: avoir.type_avoir },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, avoir, 'Avoir créé avec succès', 201);
  } catch (err) { next(err); }
}

export async function updateAvoir(req, res, next) {
  try {
    const avoir = await avoirService.updateAvoir(parseInt(req.params.id), req.body, req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'avoir_modifie', module: 'Avoirs',
        description: `Avoir ${avoir.numero} modifié`,
        entityType: 'avoir', entityId: avoir.id, entityLabel: avoir.numero,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, avoir, 'Avoir mis à jour');
  } catch (err) { next(err); }
}

export async function validerAvoir(req, res, next) {
  try {
    const avoir = await avoirService.validerAvoir(parseInt(req.params.id), req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'avoir_valide', module: 'Avoirs',
        description: `Avoir ${avoir.numero} validé`,
        entityType: 'avoir', entityId: avoir.id, entityLabel: avoir.numero,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, avoir, 'Avoir validé');
  } catch (err) { next(err); }
}

export async function utiliserAvoir(req, res, next) {
  try {
    const avoir = await avoirService.utiliserAvoir(parseInt(req.params.id), req.body, req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: `avoir_${avoir.mode_utilisation?.toLowerCase() || 'utilise'}`, module: 'Avoirs',
        description: `Avoir ${avoir.numero} — ${avoir.mode_utilisation === 'IMPUTATION' ? 'imputé sur ' + (avoir.facture_imputee_numero || '') : 'remboursé'}`,
        entityType: 'avoir', entityId: avoir.id, entityLabel: avoir.numero,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, avoir, `Avoir ${avoir.mode_utilisation === 'IMPUTATION' ? 'imputé' : 'remboursé'}`);
  } catch (err) { next(err); }
}

export async function annulerAvoir(req, res, next) {
  try {
    const avoir = await avoirService.annulerAvoir(parseInt(req.params.id), req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'avoir_annule', module: 'Avoirs',
        description: `Avoir ${avoir.numero} annulé`,
        entityType: 'avoir', entityId: avoir.id, entityLabel: avoir.numero,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, avoir, 'Avoir annulé');
  } catch (err) { next(err); }
}

export async function getAvoirsParFacture(req, res, next) {
  try {
    const data = await avoirService.getAvoirsParFacture(parseInt(req.params.id));
    sendSuccess(res, data);
  } catch (err) { next(err); }
}
