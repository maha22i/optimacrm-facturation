import { ApiError } from '../utils/ApiError.js';
import { isDeletePermission } from '../modules/permissions/permissions.service.js';

export function checkPermission(...requiredPermissions) {
  // Une permission destructive (suppression, modification du numéro de
  // contrat) n'est jamais héritée d'un rôle : ni `admin`, ni `admin_technique`
  // ne la reçoivent implicitement. Elle doit avoir été cochée explicitement
  // sur l'utilisateur (cf. PERMISSIONS.destructive).
  const isDestructive = requiredPermissions.some(isDeletePermission);

  return (req, _res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (!isDestructive) {
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
    }

    const userPerms = req.user.permissions || [];
    const hasPermission = requiredPermissions.some(p => userPerms.includes(p));

    if (!hasPermission) {
      if (isDestructive) {
        return next(ApiError.forbidden(
          'La suppression requiert une permission dédiée, qui doit vous être accordée par un administrateur.',
        ));
      }
      return next(ApiError.forbidden('Vous n\'avez pas accès à cette fonctionnalité'));
    }

    next();
  };
}
