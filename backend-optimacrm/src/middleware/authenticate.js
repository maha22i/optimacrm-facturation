import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';

export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization;
    const token = req.cookies?.token || (header?.startsWith('Bearer ') ? header.split(' ')[1] : null);

    if (!token) {
      throw ApiError.unauthorized('Access token required');
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // LEFT JOIN (pas INNER) : tenant_id est NULL pour un super_admin — un
    // INNER JOIN ferait disparaître sa ligne du résultat (donc "User not
    // found" à tort). tenant_statut/tenant_modules_actifs valent NULL pour
    // lui, ce qui désactive naturellement le contrôle de suspension et le
    // filtrage par module ci-dessous.
    // Un seul aller-retour DB (pas de requête supplémentaire), comme demandé
    // — modules_actifs ajouté à ce même JOIN, coût nul.
    const [userResult, permResult] = await Promise.all([
      query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.is_active, u.tenant_id,
                u.client_id,
                t.statut AS tenant_statut, t.modules_actifs AS tenant_modules_actifs
         FROM users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
         WHERE u.id = $1`,
        [decoded.userId],
      ),
      query(
        'SELECT permission FROM user_permissions WHERE user_id = $1',
        [decoded.userId],
      ),
    ]);

    if (userResult.rows.length === 0) {
      throw ApiError.unauthorized('User not found');
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      throw ApiError.forbidden('Account is deactivated');
    }

    // Un tenant suspendu bloque tous ses users, à chaque requête (pas
    // seulement au login) — un JWT déjà émis ne doit pas rester valide
    // pendant sa durée de vie complète après une suspension. Le super_admin
    // (tenant_id NULL) n'est jamais concerné.
    if (user.tenant_id && user.tenant_statut === 'suspendu') {
      throw ApiError.forbidden('Compte suspendu');
    }

    // Exposé séparément de req.user (pas une colonne de `users`, et on ne
    // veut pas polluer l'objet utilisateur renvoyé dans les réponses API
    // avec une donnée de jointure) — lu par le middleware requireModule().
    req.tenantModulesActifs = user.tenant_modules_actifs;

    delete user.tenant_statut; // champ de jointure, pas une colonne de `users`
    delete user.tenant_modules_actifs; // idem

    req.user = user;
    req.user.permissions = permResult.rows.map(r => r.permission);
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') return next(ApiError.unauthorized('Invalid token'));
    if (error.name === 'TokenExpiredError') return next(ApiError.unauthorized('Token expired'));
    next(error);
  }
}
