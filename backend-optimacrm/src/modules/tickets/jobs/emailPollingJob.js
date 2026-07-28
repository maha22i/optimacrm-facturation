import cron from 'node-cron';
import { pool, runWithTenantContext } from '../../../config/database.js';
import { fetchAndCreateTickets } from '../services/emailIngestService.js';
import { getEncryptionKey } from '../utils/cryptoImap.js';

const LOG_PREFIX = '[EMAIL-INGEST]';
const DEFAULT_CRON = '*/5 * * * *';

let task = null;
let isRunning = false;

async function runPolling() {
  if (isRunning) {
    console.warn(`${LOG_PREFIX} Synchro précédente toujours en cours, exécution ignorée`);
    return;
  }
  isRunning = true;
  try {
    // IS DISTINCT FROM 'false' (et pas != 'false') : sémantique opt-out —
    // une clé "tickets" absente (modules_actifs->>'tickets' vaut NULL) doit
    // rester éligible. != avec NULL renvoie NULL (donc exclu par le WHERE),
    // ce qui casserait le polling pour tous les tenants à modules_actifs = {}.
    const { rows: tenants } = await pool.query(
      `SELECT id FROM tenants
       WHERE statut = 'actif'
         AND modules_actifs ->> 'tickets' IS DISTINCT FROM 'false'`,
    );

    for (const tenant of tenants) {
      try {
        const stats = await runWithTenantContext(tenant.id, () => fetchAndCreateTickets());
        if (stats.created > 0 || stats.errors > 0) {
          console.log(
            `${LOG_PREFIX} Synchro tenant ${tenant.id} : ${stats.created} créé(s), ${stats.skipped} ignoré(s), ${stats.errors} erreur(s)`,
          );
        }
      } catch (err) {
        console.error(`${LOG_PREFIX} Erreur (tenant ${tenant.id}):`, err.message);
      }
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Erreur inattendue du job :`, err.message);
  } finally {
    isRunning = false;
  }
}

export function startEmailPollingJob() {
  if (process.env.EMAIL_POLLING_ENABLED !== 'true') {
    console.log(`${LOG_PREFIX} Polling désactivé (EMAIL_POLLING_ENABLED !== 'true')`);
    return;
  }

  getEncryptionKey();

  const expression = process.env.EMAIL_POLL_CRON || DEFAULT_CRON;
  if (!cron.validate(expression)) {
    throw new Error(`${LOG_PREFIX} Expression EMAIL_POLL_CRON invalide : "${expression}"`);
  }

  task = cron.schedule(expression, runPolling);
  console.log(`✓ Email polling job started (cron: ${expression})`);
}

export function stopEmailPollingJob() {
  if (task) {
    task.stop();
    task = null;
  }
}
