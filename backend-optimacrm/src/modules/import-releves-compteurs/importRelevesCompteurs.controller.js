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
    const { file_id, lignes, periode } = req.body;
    if (!lignes || !Array.isArray(lignes)) {
      return res.status(400).json({ success: false, message: 'lignes requis (tableau)' });
    }
    const result = await service.executeImport(lignes, periode || {});
    if (file_id) await service.cleanupTempFile(file_id);
    try {
      const total = result.total || lignes.length || 0;
      const depassements = result.depassements || result.summary?.depassements || 0;
      const montant = result.montant_total || result.summary?.montant_total || 0;
      const errors = result.errors?.length || result.summary?.errors || 0;
      await activityLog.log({
        userId: req.user?.id, userNom: activityLog.getUserName(req.user),
        action: 'releves_importes', module: 'releves',
        description: `Import de ${total} relevés compteurs${depassements ? ` (${depassements} dépassements détectés)` : ''}`,
        details: { lignes_total: total, depassements, montant_total: montant, lignes_erreur: errors },
        statut: errors > 0 ? 'partiel' : 'succes',
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, result, 'Import des relevés terminé');
  } catch (err) { next(err); }
}
