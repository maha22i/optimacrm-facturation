import { ApiError } from '../utils/ApiError.js';

// ── Filtrage par module optionnel (tickets, sepa, parc_machines) ────────────
//
// Sémantique "opt-out" : modules_actifs est une liste d'EXCEPTIONS (ce qui
// est désactivé pour ce tenant), pas une allowlist. Une clé absente ou toute
// valeur autre que `false` signifie "actif" — indispensable pour la
// compatibilité avec les tenants existants, tous à `{}` aujourd'hui. Ne
// jamais tester `=== true`, toujours `=== false` pour bloquer.
//
// Volontairement séparé de checkPermission/authorize : le bypass "admin
// voit tout" de checkPermission.js ne doit JAMAIS s'appliquer ici — un
// module désactivé bloque tout le monde dans le tenant, admin compris.
// Fusionner cette logique dans checkPermission serait le risque #1 de
// régression future ; garder les deux middlewares indépendants l'évite
// structurellement.
//
// Blocage total (lecture incluse) : "désactivé" = invisible, pas de
// distinction GET/POST. Les données restent en base et redeviennent
// accessibles à la réactivation.
//
// Placement : après `authenticate` (qui pose req.tenantModulesActifs via le
// LEFT JOIN sur `tenants`, coût nul), et AVANT `tenantMiddleware` — on
// rejette avant d'ouvrir une connexion PG + transaction pour une requête
// qui sera de toute façon refusée.
//
// Super-admin (tenant_id NULL) : bypass total, cross-tenant par nature —
// req.tenantModulesActifs vaut alors `undefined`/`null` (authenticate.js ne
// pose la valeur qu'à partir du LEFT JOIN, NULL pour un tenant_id NULL).
export function requireModule(moduleKey) {
  return (req, _res, next) => {
    if (!req.user?.tenant_id) return next();

    if (req.tenantModulesActifs?.[moduleKey] === false) {
      return next(ApiError.forbidden(`Le module "${moduleKey}" est désactivé pour votre organisation`));
    }

    next();
  };
}
