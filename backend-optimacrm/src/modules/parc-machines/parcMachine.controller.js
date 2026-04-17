import * as parcService from './parcMachine.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

// ---------------------------------------------------------------------------
// MACHINES
// ---------------------------------------------------------------------------

export async function listMachines(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { search, categorie, statut, client_id, alerte_compteur, sort, order } = req.query;

    const { machines, pagination } = await parcService.listMachines({
      page, limit, search, categorie, statut, client_id, alerte_compteur, sort, order,
    });
    sendPaginated(res, machines, pagination);
  } catch (err) { next(err); }
}

export async function getMachine(req, res, next) {
  try {
    const machine = await parcService.getMachineById(parseInt(req.params.id));
    sendSuccess(res, machine);
  } catch (err) { next(err); }
}

export async function getMachinesByClient(req, res, next) {
  try {
    const machines = await parcService.getMachinesByClient(parseInt(req.params.clientId));
    sendSuccess(res, machines);
  } catch (err) { next(err); }
}

export async function createMachine(req, res, next) {
  try {
    const machine = await parcService.createMachine(req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'machine_creee',
        module: 'parc_machines',
        description: `Création de la machine ${machine.numero_serie || ''}`,
        entityType: 'machine',
        entityId: machine.id,
        entityLabel: machine.numero_serie,
        details: { numero_serie: machine.numero_serie, modele: machine.modele },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, machine, 'Machine créée avec succès', 201);
  } catch (err) { next(err); }
}

export async function updateMachine(req, res, next) {
  try {
    const machine = await parcService.updateMachine(parseInt(req.params.id), req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'machine_modifiee',
        module: 'parc_machines',
        description: `Modification de la machine ${machine.numero_serie || ''}`,
        entityType: 'machine',
        entityId: machine.id,
        entityLabel: machine.numero_serie,
        details: { champs_modifies: Object.keys(req.body) },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, machine, 'Machine mise à jour');
  } catch (err) { next(err); }
}

export async function deleteMachine(req, res, next) {
  try {
    const machineId = parseInt(req.params.id);
    let machineLabel = `#${machineId}`;
    try { const m = await parcService.getMachineById(machineId); machineLabel = m.numero_serie || machineLabel; } catch (_) {}
    await parcService.deleteMachine(machineId);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'machine_supprimee',
        module: 'parc_machines',
        description: `Suppression de la machine ${machineLabel}`,
        entityType: 'machine',
        entityId: machineId,
        entityLabel: machineLabel,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, null, 'Machine supprimée');
  } catch (err) { next(err); }
}

export async function duplicateMachine(req, res, next) {
  try {
    const machine = await parcService.duplicateMachine(parseInt(req.params.id));
    sendSuccess(res, machine, 'Machine dupliquée avec succès', 201);
  } catch (err) { next(err); }
}

export async function getStats(req, res, next) {
  try {
    const stats = await parcService.getStats();
    sendSuccess(res, stats);
  } catch (err) { next(err); }
}

export async function checkNumeroSerie(req, res, next) {
  try {
    const { numero_serie, exclude_id } = req.query;
    const exists = await parcService.checkNumeroSerieExists(numero_serie, exclude_id ? parseInt(exclude_id) : null);
    sendSuccess(res, { exists });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// RELEVÉS
// ---------------------------------------------------------------------------

export async function listReleves(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const { releves, pagination } = await parcService.listReleves(parseInt(req.params.id), { page, limit });
    sendPaginated(res, releves, pagination);
  } catch (err) { next(err); }
}

export async function createReleve(req, res, next) {
  try {
    const releve = await parcService.createReleve(parseInt(req.params.id), req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'releve_saisi',
        module: 'releves',
        description: `Saisie manuelle du relevé pour la machine #${req.params.id}`,
        entityType: 'machine',
        entityId: parseInt(req.params.id),
        entityLabel: `Machine #${req.params.id}`,
        details: { compteur_nb: req.body.compteur_nb, compteur_couleur: req.body.compteur_couleur },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, releve, 'Relevé enregistré avec succès', 201);
  } catch (err) { next(err); }
}

export async function updateReleve(req, res, next) {
  try {
    const releve = await parcService.updateReleve(
      parseInt(req.params.id),
      parseInt(req.params.releveId),
      req.body,
    );
    sendSuccess(res, releve, 'Relevé mis à jour');
  } catch (err) { next(err); }
}

export async function deleteReleve(req, res, next) {
  try {
    await parcService.deleteReleve(parseInt(req.params.id), parseInt(req.params.releveId));
    sendSuccess(res, null, 'Relevé supprimé');
  } catch (err) { next(err); }
}
