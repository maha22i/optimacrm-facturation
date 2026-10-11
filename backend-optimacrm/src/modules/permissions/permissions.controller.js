import * as permService from './permissions.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { MODULES } from '../../config/activityModules.js';
import { sendSuccess } from '../../utils/response.js';

export async function getAvailable(_req, res, next) {
  try {
    const permissions = permService.getAvailablePermissions();
    sendSuccess(res, permissions);
  } catch (err) { next(err); }
}

export async function getUserPermissions(req, res, next) {
  try {
    const permissions = await permService.getUserPermissions(req.params.userId);
    sendSuccess(res, permissions);
  } catch (err) { next(err); }
}

export async function setUserPermissions(req, res, next) {
  try {
    const avant = await permService.getUserPermissions(req.params.userId).catch(() => []);
    const permissions = await permService.setUserPermissions(req.params.userId, req.body.permissions);

    // Action sensible : on garde l'avant/après complet, la liste des droits
    // reste courte et c'est exactement ce qu'un audit vient chercher.
    const apres = Array.isArray(permissions) ? permissions : req.body.permissions || [];
    await activityLog.logRequest(req, {
      action: 'permissions_modifiees',
      module: MODULES.UTILISATEURS,
      description: `Modification des permissions de l'utilisateur ${req.params.userId}`,
      entityType: 'utilisateur',
      entityId: req.params.userId,
      details: {
        ajoutees: apres.filter(p => !avant.includes(p)),
        retirees: avant.filter(p => !apres.includes(p)),
      },
    });

    sendSuccess(res, permissions, 'Permissions updated');
  } catch (err) { next(err); }
}
