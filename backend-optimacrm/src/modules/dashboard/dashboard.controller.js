import * as dashboardService from './dashboard.service.js';
import { sendSuccess } from '../../utils/response.js';

export async function getStats(req, res, next) {
  try {
    // req.tenantModulesActifs posé par authenticate.js (LEFT JOIN tenants,
    // coût nul) — undefined pour un super_admin, ce qui laisse le service
    // tout calculer (bypass naturel, cf. parcActive !== false ci-dessous).
    const stats = await dashboardService.getDashboardStats(req.tenantModulesActifs);
    sendSuccess(res, stats);
  } catch (err) { next(err); }
}
