// Rétrocompatibilité : délègue vers le contrôleur abonnement générique
import * as abonnementCtrl from './facturationAbonnement.controller.js';

export async function getContratsTelephonie(req, res, next) {
  req.query.type = 'Telephonie';
  return abonnementCtrl.getContratsAbonnement(req, res, next);
}

export async function genererFacturesTelephonie(req, res, next) {
  return abonnementCtrl.genererFacturesAbonnement(req, res, next);
}

export async function simulerFactureTelephonie(req, res, next) {
  return abonnementCtrl.simulerFactureAbonnement(req, res, next);
}
