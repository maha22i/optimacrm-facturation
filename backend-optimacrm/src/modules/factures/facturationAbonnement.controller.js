import * as service from './facturationAbonnement.service.js';
import { sendSuccess } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

export async function getContratsAbonnement(req, res, next) {
  try {
    const date = req.query.date || undefined;
    const typeFilter = req.query.type || undefined;
    const result = await service.getContratsAbonnement(date, typeFilter);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function genererFacturesAbonnement(req, res, next) {
  try {
    const { date_facturation, contrat_ids } = req.body;

    if (!contrat_ids || !Array.isArray(contrat_ids) || contrat_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Le champ contrat_ids est requis (tableau non vide)' });
    }

    const rapport = await service.genererFacturesAbonnement(date_facturation, contrat_ids, req.user.id);

    const typesFactures = [...new Set(rapport.factures.map(f => f.type_contrat))];
    const typeLabel = typesFactures.length === 1 ? typesFactures[0].toLowerCase() : 'abonnement';

    try {
      await activityLog.log({
        userId: req.user.id,
        userNom: activityLog.getUserName(req.user),
        action: 'facturation_periodique_abonnement',
        module: 'factures',
        description: `Génération facturation périodique ${typeLabel} : ${rapport.factures_creees} facture(s) créée(s) pour ${rapport.montant_total_ht.toLocaleString('fr-FR')} € HT`,
        entityType: 'facture',
        details: {
          factures_creees: rapport.factures_creees,
          montant_total_ht: rapport.montant_total_ht,
          montant_total_ttc: rapport.montant_total_ttc,
          date_facturation: date_facturation,
          types_contrat: typesFactures,
          numeros_factures: rapport.factures.map(f => f.numero_facture),
          augmentations: rapport.augmentations.length > 0 ? rapport.augmentations : undefined,
        },
        statut: 'succes',
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

    sendSuccess(res, rapport, `${rapport.factures_creees} facture(s) ${typeLabel} générée(s) en brouillon`);
  } catch (err) { next(err); }
}

export async function simulerFactureAbonnement(req, res, next) {
  try {
    const contratId = parseInt(req.params.contratId);
    const date = req.query.date || undefined;
    const simulation = await service.simulerFactureAbonnement(contratId, date);
    sendSuccess(res, simulation);
  } catch (err) { next(err); }
}
