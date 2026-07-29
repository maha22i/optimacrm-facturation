import rateLimit from 'express-rate-limit';

/**
 * Limiteur de requêtes générique basé sur l'IP cliente.
 *
 * Utilisé sur les endpoints publics sensibles (mot de passe oublié,
 * consommation de token de réinitialisation, etc.) où un attaquant sans
 * compte pourrait sinon spammer les envois d'email, tenter de deviner des
 * comptes existants (énumération) ou bruteforcer un token.
 *
 * `standardHeaders: true` expose les infos via les headers RateLimit-*
 * (RFC), `legacyHeaders: false` désactive les anciens X-RateLimit-* dépréciés.
 */
export function createRateLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message },
  });
}
