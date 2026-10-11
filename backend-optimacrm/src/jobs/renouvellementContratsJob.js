import { pool, runWithTenantContext } from '../config/database.js';
import { recalculerTousRenouvellements } from '../modules/contrats/renouvellement.service.js';

let intervalId = null;

/**
 * Fait avancer chaque jour la date de renouvellement des contrats copieur dont
 * l'échéance vient d'être dépassée, et répare celles qui manquent (contrat créé
 * avant la mise en place de la fonctionnalité, import sans durée exploitable au
 * moment de la reprise). Sans ce passage, un contrat en tacite reconduction
 * afficherait indéfiniment une échéance passée et sortirait de l'alerte.
 */
export function startRenouvellementContratsJob(intervalMs = 24 * 60 * 60 * 1000) {
  runRenouvellements();

  intervalId = setInterval(runRenouvellements, intervalMs);
  console.log('✓ Renouvellement contrats job started (every 24h)');
}

async function runRenouvellements() {
  try {
    const { rows: tenants } = await pool.query(
      "SELECT id FROM tenants WHERE statut = 'actif'",
    );

    for (const tenant of tenants) {
      try {
        const rapport = await runWithTenantContext(tenant.id, () => recalculerTousRenouvellements());
        if (rapport.contrats_traites > 0) {
          console.log(`[CRON] ${rapport.contrats_traites} renouvellement(s) recalculé(s) (tenant ${tenant.id})`);
        }
        for (const erreur of rapport.erreurs) {
          console.error(`[CRON] Renouvellement contrat ${erreur.contrat_id} échoué : ${erreur.message}`);
        }
      } catch (err) {
        console.error(`[CRON] Erreur renouvellement contrats (tenant ${tenant.id}):`, err.message);
      }
    }
  } catch (err) {
    console.error('[CRON] Erreur renouvellement contrats:', err.message);
  }
}

export function stopRenouvellementContratsJob() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
