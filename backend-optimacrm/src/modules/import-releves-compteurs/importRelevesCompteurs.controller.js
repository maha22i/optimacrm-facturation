import * as service from './importRelevesCompteurs.service.js';
import { sendSuccess } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

export async function parse(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
    const result = await service.parseFile(req.file.buffer, req.file.originalname);
    sendSuccess(res, result, 'Fichier analysé avec succès');
  } catch (err) { next(err); }
}

export async function analyze(req, res, next) {
  try {
    const { file_id, mapping, periode } = req.body;
    if (!file_id || !mapping) {
      return res.status(400).json({ success: false, message: 'file_id et mapping requis' });
    }
    const result = await service.analyzeReleves(file_id, mapping, periode || {});
    sendSuccess(res, result, 'Analyse terminée');
  } catch (err) { next(err); }
}

export async function execute(req, res, next) {
  try {
    const { file_id, lignes, periode, file_meta } = req.body;
    if (!lignes || !Array.isArray(lignes)) {
      return res.status(400).json({ success: false, message: 'lignes requis (tableau)' });
    }

    // Recover file metadata from temp if available
    let fileMeta = file_meta || {};
    if (file_id && !fileMeta.hash) {
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const tempPath = path.default.resolve('uploads/import-temp', `${file_id}.json`);
        const raw = JSON.parse(await fs.default.readFile(tempPath, 'utf-8'));
        if (raw.file_meta) fileMeta = raw.file_meta;
      } catch { /* noop */ }
    }

    const result = await service.executeImport(lignes, periode || {}, fileMeta, req.user);
    if (file_id) await service.cleanupTempFile(file_id);
    try {
      await activityLog.log({
        userId: req.user?.id, userNom: activityLog.getUserName(req.user),
        action: 'releves_importes', module: 'imports_releves',
        description: `Import ${result.numero_batch || ''} — ${result.imported} relevé(s) importé(s)${result.depassements ? ` (${result.depassements} dépassements)` : ''}`,
        entityType: 'import_releves',
        entityId: result.import_id,
        entityLabel: result.numero_batch,
        details: {
          lignes_total: result.total,
          imported: result.imported,
          ignored: result.ignored,
          depassements: result.depassements,
          montant_total: result.montant_total_depassement_ht,
          lignes_erreur: result.errors,
        },
        statut: result.errors > 0 ? 'partiel' : 'succes',
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, result, 'Import des relevés terminé');
  } catch (err) { next(err); }
}
