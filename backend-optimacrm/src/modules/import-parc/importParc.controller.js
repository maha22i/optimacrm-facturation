import * as importService from './importParc.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { MODULES } from '../../config/activityModules.js';
import { sendSuccess } from '../../utils/response.js';

// Les étapes parse/validate ne sont que des prévisualisations : seule
// l'exécution, qui écrit en base, est journalisée.

// ── Machines ──────────────────────────────────────────────────────────────

export async function parseMachines(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
    const result = await importService.parseMachines(req.file.buffer, req.file.originalname);
    sendSuccess(res, result, 'Fichier analysé avec succès');
  } catch (err) { next(err); }
}

export async function validateMachines(req, res, next) {
  try {
    const { file_id, mappings, options } = req.body;
    if (!file_id || !mappings) return res.status(400).json({ success: false, message: 'file_id et mappings requis' });
    const result = await importService.validateMachines(file_id, mappings, options);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function executeMachines(req, res, next) {
  try {
    const { file_id, mappings, options } = req.body;
    if (!file_id || !mappings) return res.status(400).json({ success: false, message: 'file_id et mappings requis' });
    const result = await importService.executeMachines(file_id, mappings, options);
    await activityLog.logRequest(req, {
      action: 'import_machines_execute',
      module: MODULES.PARC_MACHINES,
      description: `Import du parc machines : ${result.imported} créée(s), ${result.updated} mise(s) à jour, ${result.errors} erreur(s) sur ${result.total} ligne(s)`,
      entityType: 'import_parc',
      details: {
        total: result.total,
        importees: result.imported,
        mises_a_jour: result.updated,
        erreurs: result.errors,
        ignorees: result.skipped,
      },
      statut: result.errors > 0 ? 'partiel' : 'succes',
    });
    sendSuccess(res, result, 'Import terminé');
  } catch (err) { next(err); }
}

// ── Relevés ───────────────────────────────────────────────────────────────

export async function parseReleves(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
    const result = await importService.parseReleves(req.file.buffer, req.file.originalname);
    sendSuccess(res, result, 'Fichier analysé avec succès');
  } catch (err) { next(err); }
}

export async function validateReleves(req, res, next) {
  try {
    const { file_id, mappings } = req.body;
    if (!file_id || !mappings) return res.status(400).json({ success: false, message: 'file_id et mappings requis' });
    const result = await importService.validateReleves(file_id, mappings);
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export async function executeReleves(req, res, next) {
  try {
    const { file_id, mappings } = req.body;
    if (!file_id || !mappings) return res.status(400).json({ success: false, message: 'file_id et mappings requis' });
    const result = await importService.executeReleves(file_id, mappings);
    await activityLog.logRequest(req, {
      action: 'import_releves_execute',
      module: MODULES.RELEVES,
      description: `Import de relevés de compteurs : ${result.imported} relevé(s) importé(s), ${result.errors} erreur(s) sur ${result.total} ligne(s)`,
      entityType: 'import_releves',
      details: {
        total: result.total,
        importes: result.imported,
        erreurs: result.errors,
        ignores: result.skipped,
      },
      statut: result.errors > 0 ? 'partiel' : 'succes',
    });
    sendSuccess(res, result, 'Import des relevés terminé');
  } catch (err) { next(err); }
}

// ── Mappings sauvegardés ──────────────────────────────────────────────────

export async function getMappings(req, res, next) {
  try {
    const entity = req.query.entity || 'PARC_MACHINES';
    const mappings = await importService.getSavedMappings(entity);
    sendSuccess(res, mappings);
  } catch (err) { next(err); }
}

export async function saveMapping(req, res, next) {
  try {
    const { name, mapping, entity_type } = req.body;
    if (!name || !mapping) return res.status(400).json({ success: false, message: 'name et mapping requis' });
    const entityType = entity_type || 'PARC_MACHINES';
    const result = await importService.saveMappingTemplate(entityType, name, mapping);
    await activityLog.logRequest(req, {
      action: 'mapping_import_enregistre',
      module: MODULES.PARC_MACHINES,
      description: `Enregistrement du mapping d'import « ${name} » (${entityType})`,
      entityType: 'mapping_import',
      entityId: result?.id ?? null,
      entityLabel: name,
      details: { entity_type: entityType },
    });
    sendSuccess(res, result, 'Mapping sauvegardé');
  } catch (err) { next(err); }
}

export async function deleteMapping(req, res, next) {
  try {
    const mapping = await importService.deleteSavedMapping(parseInt(req.params.id));
    await activityLog.logRequest(req, {
      action: 'mapping_import_supprime',
      module: MODULES.PARC_MACHINES,
      description: `Suppression du mapping d'import « ${mapping.name || `#${mapping.id}`} »`,
      entityType: 'mapping_import',
      entityId: mapping.id,
      entityLabel: mapping.name ?? null,
      details: { entity_type: mapping.entity_type },
    });
    sendSuccess(res, null, 'Mapping supprimé');
  } catch (err) { next(err); }
}
