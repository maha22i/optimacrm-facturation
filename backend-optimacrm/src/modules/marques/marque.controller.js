import * as marqueService from './marque.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { MODULES } from '../../config/activityModules.js';
import { sendSuccess } from '../../utils/response.js';

// Les référentiels du catalogue n'ont pas d'onglet propre dans le journal :
// ils sont rangés sous `catalogue`, avec un entityType qui les distingue.
function logMarque(req, marque, { action, description }) {
  return activityLog.logRequest(req, {
    action,
    module: MODULES.CATALOGUE,
    description,
    entityType: 'marque',
    entityId: marque?.id ?? null,
    entityLabel: marque?.nom ?? null,
  });
}

export async function list(req, res, next) {
  try {
    const { search, actif } = req.query;
    const marques = await marqueService.list({ search, actif });
    sendSuccess(res, marques);
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const marque = await marqueService.create(req.body);
    await logMarque(req, marque, {
      action: 'marque_creee',
      description: `Création de la marque ${marque.nom}`,
    });
    sendSuccess(res, marque, 'Marque créée', 201);
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const marque = await marqueService.update(parseInt(req.params.id), req.body);
    await logMarque(req, marque, {
      action: 'marque_modifiee',
      description: `Modification de la marque ${marque.nom}`,
    });
    sendSuccess(res, marque, 'Marque mise à jour');
  } catch (err) { next(err); }
}

export async function softDelete(req, res, next) {
  try {
    const marque = await marqueService.softDelete(parseInt(req.params.id));
    await logMarque(req, marque, {
      action: 'marque_desactivee',
      description: `Désactivation de la marque ${marque.nom}`,
    });
    sendSuccess(res, marque, 'Marque désactivée');
  } catch (err) { next(err); }
}

export async function uploadLogo(req, res, next) {
  try {
    const marqueId = parseInt(req.params.id);
    const result = await marqueService.uploadLogo(marqueId, req.file);
    await logMarque(req, { id: marqueId, nom: result?.nom }, {
      action: 'marque_logo_modifie',
      description: `Mise à jour du logo de la marque #${marqueId}`,
    });
    sendSuccess(res, result, 'Logo uploadé');
  } catch (err) { next(err); }
}
