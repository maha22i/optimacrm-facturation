import { ApiError } from '../../utils/ApiError.js';

/**
 * Vérifie que l'utilisateur authentifié a le rôle « client ».
 * À monter sur toutes les routes /api/client/*.
 */
export function requireClientRole(req, _res, next) {
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required'));
  }
  if (req.user.role !== 'client') {
    return next(ApiError.forbidden('Accès réservé aux comptes clients'));
  }
  next();
}

/**
 * Injecte req.clientId à partir du user authentifié (role=client).
 * À monter après requireClientRole + tenantMiddleware.
 */
export function clientContext(req, _res, next) {
  const clientId = req.user?.client_id;
  if (!clientId) {
    return next(ApiError.forbidden('Aucun client rattaché à ce compte'));
  }
  req.clientId = clientId;
  next();
}
