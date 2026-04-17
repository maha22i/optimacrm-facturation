import * as activityLogService from './activityLog.service.js';
import { sendSuccess } from '../../utils/response.js';

export async function listLogs(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const { module, action, user_id, statut, date_debut, date_fin, search } = req.query;

    const result = await activityLogService.listLogs({
      page,
      limit,
      module,
      action,
      user_id: user_id ? parseInt(user_id) : undefined,
      statut,
      date_debut,
      date_fin,
      search,
    });

    res.json({
      success: true,
      message: 'Success',
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) { next(err); }
}

export async function getStats(req, res, next) {
  try {
    const { module, date_debut, date_fin, search } = req.query;
    const stats = await activityLogService.getStats({ module, date_debut, date_fin, search });
    sendSuccess(res, stats);
  } catch (err) { next(err); }
}

export async function getEntityHistory(req, res, next) {
  try {
    const { entityType, entityId } = req.params;
    const logs = await activityLogService.getEntityHistory(entityType, parseInt(entityId));
    sendSuccess(res, logs);
  } catch (err) { next(err); }
}
