import * as permService from './permissions.service.js';
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
    const permissions = await permService.setUserPermissions(req.params.userId, req.body.permissions);
    sendSuccess(res, permissions, 'Permissions updated');
  } catch (err) { next(err); }
}
