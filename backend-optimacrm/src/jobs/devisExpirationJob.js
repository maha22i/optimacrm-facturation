import { pool, runWithTenantContext } from '../config/database.js';
import { expirerDevisObsoletes } from '../modules/devis/devis.service.js';

let intervalId = null;

export function startExpirationJob(intervalMs = 24 * 60 * 60 * 1000) {
  runExpiration();

  intervalId = setInterval(runExpiration, intervalMs);
  console.log('✓ Devis expiration job started (every 24h)');
}

async function runExpiration() {
  try {
    const { rows: tenants } = await pool.query(
      "SELECT id FROM tenants WHERE statut = 'actif'",
    );

    for (const tenant of tenants) {
      try {
        const count = await runWithTenantContext(tenant.id, () => expirerDevisObsoletes());
        if (count > 0) {
          console.log(`[CRON] ${count} devis expiré(s) (tenant ${tenant.id})`);
        }
      } catch (err) {
        console.error(`[CRON] Erreur expiration devis (tenant ${tenant.id}):`, err.message);
      }
    }
  } catch (err) {
    console.error('[CRON] Erreur expiration devis:', err.message);
  }
}

export function stopExpirationJob() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
