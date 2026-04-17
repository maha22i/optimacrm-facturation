import { ApiError } from '../utils/ApiError.js';

export function checkPermission(...requiredPermissions) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (req.user.role === 'admin') {
      return next();
    }

    const userPerms = req.user.permissions || [];
    const hasPermission = requiredPermissions.some(p => userPerms.includes(p));

    if (!hasPermission) {
      return next(ApiError.forbidden('Vous n\'avez pas accès à cette fonctionnalité'));
    }

    next();
  };
}
