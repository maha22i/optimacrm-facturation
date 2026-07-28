import 'dotenv/config';
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

// Return DATE columns as raw YYYY-MM-DD strings to avoid timezone shift issues
pg.types.setTypeParser(1082, (val) => val);

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/optimacrm',
});

// ---------------------------------------------------------------------------
// AsyncLocalStorage — stocke { client } (le client PG transactionnel) par
// contexte asynchrone (requête HTTP ou job cron).
// Tant qu'aucun middleware/wrapper ne remplit le store, getStore() renvoie
// undefined et query() retombe sur pool.query() — comportement identique.
// ---------------------------------------------------------------------------
export const tenantStore = new AsyncLocalStorage();

/**
 * Exécute une requête SQL.
 * - Si un client transactionnel existe dans l'ALS (posé par le middleware ou
 *   par runWithTenantContext), la requête passe par ce client (qui a un
 *   SET LOCAL app.current_tenant_id actif dans sa transaction).
 * - Sinon, la requête passe par pool.query() (comportement historique).
 */
export const query = (text, params) => {
  const store = tenantStore.getStore();
  return store?.client ? store.client.query(text, params) : pool.query(text, params);
};

/**
 * Retourne le client PG transactionnel du contexte courant, ou undefined.
 * Utilitaire pour les blocs qui ont besoin du client brut (ex. SAVEPOINT).
 */
export function getClient() {
  return tenantStore.getStore()?.client;
}

/**
 * Exécute `fn` dans un contexte tenant isolé (pour les jobs cron / écritures
 * sans requête HTTP).
 *
 * Cycle complet :
 *   1. pool.connect()          → acquiert un client dédié
 *   2. BEGIN                   → ouvre une transaction
 *   3. set_config(…, true)     → pose le tenant_id LOCAL à cette transaction
 *   4. tenantStore.run(…, fn)  → rend le client disponible via l'ALS
 *   5. await fn()              → le code métier s'exécute ; query() utilise ce client
 *   6. COMMIT (ou ROLLBACK)    → clôt la transaction
 *   7. client.release()        → rend le client au pool (finally, garanti)
 *
 * @param {string} tenantId  UUID du tenant (texte)
 * @param {function} fn      Fonction async à exécuter dans le contexte
 * @returns {Promise<*>}     La valeur retournée par fn()
 */
export async function runWithTenantContext(tenantId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.current_tenant_id', $1, true)",
      [String(tenantId)],
    );

    const result = await tenantStore.run({ client }, fn);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
