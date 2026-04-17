import { sendSuccess } from '../../utils/response.js';
import * as service from './importClients.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

export async function parse(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
    }
    const result = await service.parseFile(req.file);
    sendSuccess(res, result, 'Fichier parsé avec succès');
  } catch (err) { next(err); }
}

export async function validate(req, res, next) {
  try {
    const { file_id, mappings, options } = req.body;
    if (!file_id || !mappings) {
      return res.status(400).json({ success: false, message: 'file_id et mappings requis' });
    }
    const result = await service.validateData({ file_id, mappings, options });
    sendSuccess(res, result, 'Validation terminée');
  } catch (err) { next(err); }
}

export async function execute(req, res, next) {
  try {
    const { file_id, mappings, options } = req.body;
    if (!file_id || !mappings) {
      return res.status(400).json({ success: false, message: 'file_id et mappings requis' });
    }
    const result = await service.executeImport({
      file_id, mappings, options,
      user_id: req.user?.id,
    });
    try {
      const created = result.created || result.summary?.created || 0;
      const errors = result.errors?.length || result.summary?.errors || 0;
      const total = result.total || result.summary?.total || 0;
      await activityLog.log({
        userId: req.user?.id, userNom: activityLog.getUserName(req.user),
        action: 'clients_importes', module: 'clients',
        description: `Import de ${total} clients (${created} créés, ${errors} erreurs)`,
        details: { fichier: file_id, lignes_total: total, lignes_ok: created, lignes_erreur: errors },
        statut: errors > 0 ? 'partiel' : 'succes',
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, result, 'Import terminé avec succès');
  } catch (err) { next(err); }
}

export async function listMappings(req, res, next) {
  try {
    const mappings = await service.listSavedMappings();
    sendSuccess(res, mappings);
  } catch (err) { next(err); }
}

export async function saveMapping(req, res, next) {
  try {
    const { name, mapping } = req.body;
    if (!name || !mapping) {
      return res.status(400).json({ success: false, message: 'name et mapping requis' });
    }
    const result = await service.saveMappingConfig({
      name, mapping,
      user_id: req.user?.id,
    });
    sendSuccess(res, result, 'Mapping sauvegardé');
  } catch (err) { next(err); }
}

export async function deleteMapping(req, res, next) {
  try {
    await service.deleteSavedMapping(req.params.id);
    sendSuccess(res, null, 'Mapping supprimé');
  } catch (err) { next(err); }
}
