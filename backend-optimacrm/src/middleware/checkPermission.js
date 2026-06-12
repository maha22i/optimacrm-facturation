import { ApiError } from '../utils/ApiError.js';

export function checkPermission(...requiredPermissions) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    // Admin bypass toutes les permissions
    if (req.user.role === 'admin') {
      return next();
    }

    // Admin technique bypass les permissions tickets_*
    if (req.user.role === 'admin_technique') {
      const allTicketsPerms = requiredPermissions.every(p => 
        p.startsWith('tickets_') || p === 'clients_read' || p === 'parc_read'
      );
      if (allTicketsPerms) return next();
    }

    const userPerms = req.user.permissions || [];
    const hasPermission = requiredPermissions.some(p => userPerms.includes(p));

    if (!hasPermission) {
      return next(ApiError.forbidden('Vous n\'avez pas accès à cette fonctionnalité'));
    }

    next();
  };
}
