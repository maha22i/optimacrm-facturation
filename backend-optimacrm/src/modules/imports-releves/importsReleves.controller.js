import * as service from './importsReleves.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

function sendSuccess(res, data, message = 'OK') {
  res.json({ success: true, message, data });
}

export async function listImports(req, res, next) {
  try {
    const result = await service.listImports({
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      statut: req.query.statut,
      user_id: req.query.user_id,
      date_debut: req.query.date_debut,
      date_fin: req.query.date_fin,
      search: req.query.search,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function getImport(req, res, next) {
  try {
    const data = await service.getImportById(req.params.id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function getImportReleves(req, res, next) {
  try {
    const data = await service.getImportReleves(req.params.id, {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    });
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function getImportFactures(req, res, next) {
  try {
    const data = await service.getImportFactures(req.params.id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function getImportRapport(req, res, next) {
  try {
    const importData = await service.getImportRapport(req.params.id);
    const erreurs = importData.rapport_erreurs || [];

    if (req.query.format === 'csv') {
      const header = 'Ligne;Matricule;Type erreur;Detail\n';
      const body = erreurs.map(e =>
        `${e.ligne || ''};${e.matricule || ''};${e.type_erreur || ''};${(e.detail || '').replace(/;/g, ',')}`
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="rapport_${importData.numero_batch}.csv"`);
      return res.send('\uFEFF' + header + body);
    }

    sendSuccess(res, importData);
  } catch (err) { next(err); }
}

export async function checkDuplicate(req, res, next) {
  try {
    const { hash } = req.body;
    if (!hash) return res.status(400).json({ success: false, message: 'Hash requis' });
    const existing = await service.checkDuplicate(hash);
    sendSuccess(res, { duplicate: !!existing, existing_import: existing });
  } catch (err) { next(err); }
}

export async function getImportsStats(req, res, next) {
  try {
    const data = await service.getImportsStats();
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

export async function annulerImport(req, res, next) {
  try {
    const { motif } = req.body;
    if (!motif) return res.status(400).json({ success: false, message: 'Motif obligatoire' });

    const result = await service.annulerImport(req.params.id, motif, req.user.id);

    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'import_releves_annule',
        module: 'imports_releves',
        description: `Annulation import ${result.numero_batch} — ${result.nb_releves_crees} relevé(s) supprimé(s)`,
        entityType: 'import_releves',
        entityId: result.id,
        entityLabel: result.numero_batch,
        details: { motif, nb_releves_supprimes: result.nb_releves_crees },
        statut: 'succes',
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

    sendSuccess(res, result, 'Import annulé avec succès');
  } catch (err) {
    if (err.errorCode === 'IMPORT_HAS_INVOICES') {
      return res.status(409).json({
        success: false,
        error: 'IMPORT_HAS_INVOICES',
        message: err.message,
        factures: err.factures,
      });
    }
    next(err);
  }
}

export async function getMachineTimeline(req, res, next) {
  try {
    const data = await service.getMachineTimeline(req.params.id);
    sendSuccess(res, data);
  } catch (err) { next(err); }
}
