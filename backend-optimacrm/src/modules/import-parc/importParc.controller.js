import * as importService from './importParc.service.js';
import { sendSuccess } from '../../utils/response.js';

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
    const result = await importService.saveMappingTemplate(entity_type || 'PARC_MACHINES', name, mapping);
    sendSuccess(res, result, 'Mapping sauvegardé');
  } catch (err) { next(err); }
}

export async function deleteMapping(req, res, next) {
  try {
    await importService.deleteSavedMapping(parseInt(req.params.id));
    sendSuccess(res, null, 'Mapping supprimé');
  } catch (err) { next(err); }
}
