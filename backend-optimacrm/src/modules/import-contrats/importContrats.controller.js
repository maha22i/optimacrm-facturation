import { sendSuccess } from '../../utils/response.js';
import * as service from './importContrats.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

export async function parse(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
    }
    const typeContrat = req.query.type_contrat || req.body?.type_contrat || null;
    const result = await service.parseFile(req.file, typeContrat);
    sendSuccess(res, result, 'Fichier parsé avec succès');
  } catch (err) { next(err); }
}

export async function validate(req, res, next) {
  try {
    const { file_id, mappings, options, type_contrat } = req.body;
    if (!file_id || !mappings) {
      return res.status(400).json({ success: false, message: 'file_id et mappings requis' });
    }
    const result = await service.validateData({ file_id, mappings, options, typeContrat: type_contrat || null });
    sendSuccess(res, result, 'Validation terminée');
  } catch (err) { next(err); }
}

export async function execute(req, res, next) {
  try {
    const { file_id, mappings, options, type_contrat } = req.body;
    if (!file_id || !mappings) {
      return res.status(400).json({ success: false, message: 'file_id et mappings requis' });
    }
    const result = await service.executeImport({
      file_id, mappings, options,
      user_id: req.user?.id,
      typeContrat: type_contrat || null,
    });
    try {
      await activityLog.log({
        userId: req.user?.id, userNom: activityLog.getUserName(req.user),
        action: 'contrats_importes', module: 'contrats',
        description: `Import ${type_contrat || 'contrats'} : ${result.contrats_created} créés, ${result.contrats_updated} mis à jour, ${result.lignes_created} lignes`,
        details: {
          fichier: file_id,
          type_contrat: type_contrat,
          format: result.format,
          contrats_crees: result.contrats_created,
          contrats_maj: result.contrats_updated,
          machines_creees: result.machines_created,
          lignes_creees: result.lignes_created,
          erreurs: result.errors,
        },
        statut: result.errors > 0 ? 'partiel' : 'succes',
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, result, 'Import terminé avec succès');
  } catch (err) { next(err); }
}

export async function listMappings(req, res, next) {
  try {
    const typeContrat = req.query.type_contrat || null;
    const mappings = await service.listSavedMappings(typeContrat);
    sendSuccess(res, mappings);
  } catch (err) { next(err); }
}

export async function saveMapping(req, res, next) {
  try {
    const { name, mapping, type_contrat } = req.body;
    if (!name || !mapping) {
      return res.status(400).json({ success: false, message: 'name et mapping requis' });
    }
    const result = await service.saveMappingConfig({
      name, mapping,
      user_id: req.user?.id,
      typeContrat: type_contrat || null,
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
