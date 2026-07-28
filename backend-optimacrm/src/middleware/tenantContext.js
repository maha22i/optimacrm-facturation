import onFinished from 'on-finished';
import { pool, tenantStore } from '../config/database.js';

/**
 * Middleware Express — ouvre une connexion PG transactionnelle avec
 * SET LOCAL app.current_tenant_id pour la durée de la requête HTTP.
 *
 * Placement : après authenticate (qui pose req.user.tenant_id),
 *             avant les handlers métier.
 *
 * Super-admin (tenant_id NULL) : passe directement à next() sans connexion
 * dédiée — les requêtes utilisent pool.query() comme aujourd'hui.
 *
 * Cycle :
 *   pool.connect() → BEGIN → set_config(tenant) → ALS.run → next()
 *   … handler s'exécute, query() passe par le client ALS …
 *   onFinished → COMMIT (ou ROLLBACK si 5xx) → client.release()
 */
export function tenantMiddleware(req, res, next) {
  const tenantId = req.user?.tenant_id;

  // Super-admin : pas de contexte tenant
  if (!tenantId) return next();

  (async () => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT set_config('app.current_tenant_id', $1, true)",
        [String(tenantId)],
      );
    } catch (err) {
      client.release();
      return next(err);
    }

    // --- Nettoyage garanti (finish, close, error) -----------------------
    //
    // on-finished couvre les 3 chemins de sortie d'une réponse Express :
    //   • finish  — réponse envoyée normalement
    //   • close   — client a coupé avant la fin
    //   • error   — erreur sur le socket
    // Il garantit un appel unique du callback.
    //
    // Le flag `released` est un garde supplémentaire contre le cas
    // théorique d'un double-appel (impossible en Node single-thread
    // mais défensif contre un futur refactoring).
    let released = false;

    onFinished(res, () => {
      if (released) return;
      released = true;
      const q = res.statusCode >= 500 ? 'ROLLBACK' : 'COMMIT';
      client.query(q).catch(() => {}).finally(() => client.release());
    });

    // --- Propager le client dans l'ALS pour toute la chaîne aval --------
    //
    // Point clé : tenantStore.run() exécute le callback de façon synchrone.
    // Appeler next() à l'intérieur fait que TOUS les middlewares et handlers
    // suivants (checkPermission, ctrl.listClients, etc.) s'exécutent dans
    // ce contexte ALS — y compris leurs opérations async (query(), etc.)
    // qui héritent automatiquement du store { client }.
    //
    // Le run() retourne dès que next() retourne (Express appelle le prochain
    // middleware de façon synchrone). Le travail async du handler continue
    // en arrière-plan mais reste dans le même contexte ALS.
    // Le nettoyage (COMMIT + release) est déclenché par onFinished quand
    // la réponse est effectivement terminée, bien après le retour de run().
    tenantStore.run({ client }, () => next());
  })().catch(next); // pool.connect() échoue → next(err)
}
