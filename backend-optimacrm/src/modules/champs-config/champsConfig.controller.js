import * as service from './champsConfig.service.js';
import { sendSuccess } from '../../utils/response.js';

export async function listConfigs(req, res, next) {
  try {
    const { entite, section, actif } = req.query;
    const configs = await service.listConfigs({ entite, section, actif });
    sendSuccess(res, configs);
  } catch (err) { next(err); }
}

export async function getSections(req, res, next) {
  try {
    const { entite } = req.query;
    const sections = await service.getSections({ entite });
    sendSuccess(res, sections);
  } catch (err) { next(err); }
}

export async function getConfig(req, res, next) {
  try {
    const config = await service.getConfigById(parseInt(req.params.id));
    sendSuccess(res, config);
  } catch (err) { next(err); }
}

export async function createConfig(req, res, next) {
  try {
    const config = await service.createConfig(req.body);
    sendSuccess(res, config, 'Champ personnalisé créé', 201);
  } catch (err) { next(err); }
}

export async function updateConfig(req, res, next) {
  try {
    const config = await service.updateConfig(parseInt(req.params.id), req.body);
    sendSuccess(res, config, 'Champ personnalisé mis à jour');
  } catch (err) { next(err); }
}

export async function deleteConfig(req, res, next) {
  try {
    await service.deleteConfig(parseInt(req.params.id));
    sendSuccess(res, null, 'Champ personnalisé supprimé');
  } catch (err) { next(err); }
}

export async function updateSectionOrdre(req, res, next) {
  try {
    const { entite } = req.params;
    await service.updateSectionOrdre(entite, req.body.sections);
    sendSuccess(res, null, 'Ordre des sections mis à jour');
  } catch (err) { next(err); }
}

export async function renameSection(req, res, next) {
  try {
    const { entite } = req.params;
    const { oldName, newName } = req.body;
    const result = await service.renameSection(entite, oldName, newName);
    sendSuccess(res, result, 'Section renommée');
  } catch (err) { next(err); }
}

export async function deleteSection(req, res, next) {
  try {
    const { entite, section } = req.params;
    const result = await service.deleteSection(entite, decodeURIComponent(section));
    sendSuccess(res, result, 'Section supprimée');
  } catch (err) { next(err); }
}

export async function getValeurs(req, res, next) {
  try {
    const { entite, entiteId } = req.params;
    const valeurs = await service.getValeurs(entite, parseInt(entiteId));
    sendSuccess(res, valeurs);
  } catch (err) { next(err); }
}

export async function saveValeurs(req, res, next) {
  try {
    const { entite, entiteId } = req.params;
    const valeurs = await service.saveValeurs(entite, parseInt(entiteId), req.body.valeurs);
    sendSuccess(res, valeurs, 'Valeurs enregistrées');
  } catch (err) { next(err); }
}

export async function getConfigsWithValeurs(req, res, next) {
  try {
    const { entite, entiteId } = req.params;
    const data = await service.getConfigsWithValeurs(entite, parseInt(entiteId));
    sendSuccess(res, data);
  } catch (err) { next(err); }
}
