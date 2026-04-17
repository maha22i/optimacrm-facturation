import * as contratService from './contrat.service.js';
import * as factureService from '../factures/facture.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

// ---------------------------------------------------------------------------
// CONTRATS
// ---------------------------------------------------------------------------

export async function listContrats(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { type_contrat, statut, client_id, search, echeance_avant, prochaine_facture_avant } = req.query;

    const { contrats, pagination } = await contratService.listContrats({
      page, limit, type_contrat, statut, client_id, search, echeance_avant, prochaine_facture_avant,
    });
    sendPaginated(res, contrats, pagination);
  } catch (err) { next(err); }
}

export async function getContrat(req, res, next) {
  try {
    const contrat = await contratService.getContratById(parseInt(req.params.id));
    sendSuccess(res, contrat);
  } catch (err) { next(err); }
}

export async function createContrat(req, res, next) {
  try {
    const contrat = await contratService.createContrat(req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'contrat_cree',
        module: 'contrats',
        description: `Création du contrat ${contrat.numero_contrat || ''} pour ${contrat.client_raison_sociale || ''}`,
        entityType: 'contrat',
        entityId: contrat.id,
        entityLabel: contrat.numero_contrat,
        details: { numero_contrat: contrat.numero_contrat, client: contrat.client_raison_sociale },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, contrat, 'Contrat créé avec succès', 201);
  } catch (err) { next(err); }
}

export async function updateContrat(req, res, next) {
  try {
    const contrat = await contratService.updateContrat(parseInt(req.params.id), req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'contrat_modifie',
        module: 'contrats',
        description: `Modification du contrat ${contrat.numero_contrat || ''}`,
        entityType: 'contrat',
        entityId: contrat.id,
        entityLabel: contrat.numero_contrat,
        details: { champs_modifies: Object.keys(req.body) },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, contrat, 'Contrat mis à jour');
  } catch (err) { next(err); }
}

export async function deleteContrat(req, res, next) {
  try {
    const contrat = await contratService.deleteContrat(parseInt(req.params.id));
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'contrat_supprime',
        module: 'contrats',
        description: `Suppression du contrat ${contrat.numero_contrat || ''}`,
        entityType: 'contrat',
        entityId: contrat.id,
        entityLabel: contrat.numero_contrat,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, contrat, 'Contrat supprimé');
  } catch (err) { next(err); }
}

export async function duplicateContrat(req, res, next) {
  try {
    const contrat = await contratService.duplicateContrat(parseInt(req.params.id));
    sendSuccess(res, contrat, 'Contrat dupliqué avec succès', 201);
  } catch (err) { next(err); }
}

export async function getStats(req, res, next) {
  try {
    const stats = await contratService.getStats();
    sendSuccess(res, stats);
  } catch (err) { next(err); }
}

export async function getContratsByClient(req, res, next) {
  try {
    const contrats = await contratService.listContratsByClient(parseInt(req.params.clientId));
    sendSuccess(res, contrats);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// GÉNÉRATION FACTURE DEPUIS CONTRAT
// ---------------------------------------------------------------------------

export async function genererFacture(req, res, next) {
  try {
    const contratId = parseInt(req.params.id);
    const options = {
      periode_debut: req.body.periode_debut || undefined,
      periode_fin: req.body.periode_fin || undefined,
      releve_compteur_nb_id: req.body.releve_compteur_nb_id || undefined,
      releve_compteur_coul_id: req.body.releve_compteur_coul_id || undefined,
    };
    const facture = await factureService.genererDepuisContrat(contratId, req.user.id, options);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'facture_generee_contrat',
        module: 'contrats',
        description: `Facture ${facture.numero_facture} générée depuis contrat #${contratId}`,
        entityType: 'contrat',
        entityId: contratId,
        entityLabel: facture.numero_contrat,
        details: { facture_id: facture.id, numero_facture: facture.numero_facture },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, facture, 'Facture générée avec succès', 201);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// LIGNES
// ---------------------------------------------------------------------------

export async function addLigne(req, res, next) {
  try {
    const ligne = await contratService.addLigne(parseInt(req.params.id), req.body);
    sendSuccess(res, ligne, 'Ligne ajoutée', 201);
  } catch (err) { next(err); }
}

export async function updateLigne(req, res, next) {
  try {
    const ligne = await contratService.updateLigne(
      parseInt(req.params.id),
      parseInt(req.params.ligneId),
      req.body,
    );
    sendSuccess(res, ligne, 'Ligne mise à jour');
  } catch (err) { next(err); }
}

export async function deleteLigne(req, res, next) {
  try {
    await contratService.deleteLigne(parseInt(req.params.id), parseInt(req.params.ligneId));
    sendSuccess(res, null, 'Ligne supprimée');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// MACHINES
// ---------------------------------------------------------------------------

export async function addMachine(req, res, next) {
  try {
    const machine = await contratService.addMachine(parseInt(req.params.id), req.body);
    sendSuccess(res, machine, 'Machine ajoutée', 201);
  } catch (err) { next(err); }
}

export async function updateMachine(req, res, next) {
  try {
    const machine = await contratService.updateMachine(
      parseInt(req.params.id),
      parseInt(req.params.machineId),
      req.body,
    );
    sendSuccess(res, machine, 'Machine mise à jour');
  } catch (err) { next(err); }
}

export async function deleteMachine(req, res, next) {
  try {
    await contratService.deleteMachine(parseInt(req.params.id), parseInt(req.params.machineId));
    sendSuccess(res, null, 'Machine supprimée');
  } catch (err) { next(err); }
}
