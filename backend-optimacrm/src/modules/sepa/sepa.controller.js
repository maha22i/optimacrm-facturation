import * as sepaService from './sepa.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

// ── Créancier ─────────────────────────────────────────────────────────────────

export async function getCreancier(req, res, next) {
  try {
    const data = await sepaService.getCreancier();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function upsertCreancier(req, res, next) {
  try {
    const data = await sepaService.upsertCreancier(req.body);

    activityLog.log({
      userId: req.user?.id,
      userNom: activityLog.getUserName(req.user),
      action: 'UPSERT',
      module: 'SEPA',
      description: 'Mise à jour des paramètres créancier SEPA',
      entityType: 'sepa_creancier',
      entityId: data.id,
      entityLabel: data.ics,
      ipAddress: activityLog.getClientIp(req),
    });

    res.json({ success: true, data, message: 'Paramètres créancier sauvegardés' });
  } catch (err) { next(err); }
}

// ── Factures éligibles ────────────────────────────────────────────────────────

export async function getFacturesEligibles(req, res, next) {
  try {
    const data = await sepaService.getFacturesEligibles();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ── Génération du fichier SEPA ────────────────────────────────────────────────

export async function genererRemise(req, res, next) {
  try {
    const { facture_ids, date_prelevement } = req.body;
    const result = await sepaService.genererRemiseSepa({
      facture_ids,
      date_prelevement,
      user: req.user,
    });

    activityLog.log({
      userId: req.user?.id,
      userNom: activityLog.getUserName(req.user),
      action: 'GENERER',
      module: 'SEPA',
      description: `Génération remise SEPA : ${result.nb_transactions} prélèvements pour ${result.montant_total} €`,
      entityType: 'sepa_remise',
      entityId: result.remise_id,
      entityLabel: result.msg_id,
      details: {
        nb_transactions: result.nb_transactions,
        montant_total: result.montant_total,
        date_prelevement: result.date_prelevement,
      },
      ipAddress: activityLog.getClientIp(req),
    });

    res.json({
      success: true,
      data: result,
      message: `Remise SEPA générée : ${result.nb_transactions} prélèvement(s) pour ${result.montant_total} €`,
    });
  } catch (err) { next(err); }
}

// ── Historique des remises ────────────────────────────────────────────────────

export async function listRemises(req, res, next) {
  try {
    const data = await sepaService.listRemises();
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getRemiseXml(req, res, next) {
  try {
    const remise = await sepaService.getRemiseXml(parseInt(req.params.id));
    const dateStr = remise.date_prelevement
      ? new Date(remise.date_prelevement).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="prelevements_${dateStr}.xml"`);
    res.send(remise.fichier_xml);
  } catch (err) { next(err); }
}

export async function getRemiseDetail(req, res, next) {
  try {
    const data = await sepaService.getRemiseDetail(parseInt(req.params.id));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
