import * as societeService from './societe.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { MODULES } from '../../config/activityModules.js';
import { sendSuccess } from '../../utils/response.js';

export async function getConfig(req, res, next) {
  try {
    const config = await societeService.getConfig();
    sendSuccess(res, config);
  } catch (err) { next(err); }
}

export async function updateConfig(req, res, next) {
  try {
    const config = await societeService.updateConfig(req.body, req.user.id);
    await activityLog.logRequest(req, {
      action: 'societe_modifiee',
      module: MODULES.PARAMETRES,
      description: 'Modification des informations de la société',
      entityType: 'societe',
      entityLabel: config?.raison_sociale || null,
      details: { champs_modifies: Object.keys(req.body) },
    });
    sendSuccess(res, config, 'Configuration société mise à jour');
  } catch (err) { next(err); }
}

export async function uploadLogo(req, res, next) {
  try {
    const result = await societeService.uploadLogo(req.file);
    await activityLog.logRequest(req, {
      action: 'societe_logo_modifie',
      module: MODULES.PARAMETRES,
      description: 'Mise à jour du logo de la société',
      entityType: 'societe',
      details: { fichier: req.file?.originalname || null },
    });
    sendSuccess(res, result, 'Logo uploadé avec succès');
  } catch (err) { next(err); }
}

export async function deleteLogo(req, res, next) {
  try {
    await societeService.deleteLogo();
    await activityLog.logRequest(req, {
      action: 'societe_logo_supprime',
      module: MODULES.PARAMETRES,
      description: 'Suppression du logo de la société',
      entityType: 'societe',
    });
    sendSuccess(res, null, 'Logo supprimé');
  } catch (err) { next(err); }
}
