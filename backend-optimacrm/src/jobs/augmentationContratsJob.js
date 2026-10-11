import { pool, runWithTenantContext } from '../config/database.js';
import { appliquerAugmentationsDuesTousContrats } from '../modules/contrats/augmentationAnnuelle.service.js';

let intervalId = null;

/**
 * Applique chaque jour les augmentations annuelles dont l'anniversaire est échu.
 * La facturation rattrape de son côté ce que le job aurait raté (app arrêtée,
 * facturation sur une date future) : l'historique par anniversaire garantit
 * qu'aucune augmentation n'est appliquée deux fois.
 */
export function startAugmentationContratsJob(intervalMs = 24 * 60 * 60 * 1000) {
  runAugmentations();

  intervalId = setInterval(runAugmentations, intervalMs);
  console.log('✓ Augmentation contrats job started (every 24h)');
}

async function runAugmentations() {
  try {
    const { rows: tenants } = await pool.query(
      "SELECT id FROM tenants WHERE statut = 'actif'",
    );

    for (const tenant of tenants) {
      try {
        const rapport = await runWithTenantContext(tenant.id, () => appliquerAugmentationsDuesTousContrats());
        if (rapport.contrats_traites > 0) {
          console.log(`[CRON] ${rapport.contrats_traites} contrat(s) augmenté(s) (tenant ${tenant.id})`);
        }
        for (const erreur of rapport.erreurs) {
          console.error(`[CRON] Augmentation contrat ${erreur.contrat_id} échouée : ${erreur.message}`);
        }
      } catch (err) {
        console.error(`[CRON] Erreur augmentation contrats (tenant ${tenant.id}):`, err.message);
      }
    }
  } catch (err) {
    console.error('[CRON] Erreur augmentation contrats:', err.message);
  }
}

export function stopAugmentationContratsJob() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
