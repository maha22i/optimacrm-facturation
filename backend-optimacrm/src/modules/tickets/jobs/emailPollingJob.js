import cron from 'node-cron';
import { fetchAndCreateTicketsAllTenants } from '../services/emailIngestService.js';
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
    await fetchAndCreateTicketsAllTenants();
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

  // Fail fast : la clé de chiffrement doit être valide avant de démarrer
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
