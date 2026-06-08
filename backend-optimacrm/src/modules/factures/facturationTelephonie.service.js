// Rétrocompatibilité : réexporte depuis le service abonnement générique
export {
  getContratsAbonnement as getContratsTelephonie,
  genererFacturesAbonnement as genererFacturesTelephonie,
  simulerFactureAbonnement as simulerFactureTelephonie,
} from './facturationAbonnement.service.js';
