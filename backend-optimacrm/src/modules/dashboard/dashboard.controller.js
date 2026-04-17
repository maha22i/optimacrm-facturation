import * as dashboardService from './dashboard.service.js';
import { sendSuccess } from '../../utils/response.js';

export async function getStats(req, res, next) {
  try {
    const stats = await dashboardService.getDashboardStats();
    sendSuccess(res, stats);
  } catch (err) { next(err); }
}
