import * as templateService from './champsTemplates.service.js';
import { sendSuccess } from '../../utils/response.js';

export async function listTemplates(req, res, next) {
  try {
    const { categorie, actif } = req.query;
    const templates = await templateService.listTemplates({ categorie, actif });
    sendSuccess(res, templates);
  } catch (err) { next(err); }
}

export async function getCategories(req, res, next) {
  try {
    const categories = await templateService.getCategories();
    sendSuccess(res, categories);
  } catch (err) { next(err); }
}

export async function getTemplate(req, res, next) {
  try {
    const template = await templateService.getTemplateById(parseInt(req.params.id));
    sendSuccess(res, template);
  } catch (err) { next(err); }
}

export async function createTemplate(req, res, next) {
  try {
    const template = await templateService.createTemplate(req.body);
    sendSuccess(res, template, 'Template créé', 201);
  } catch (err) { next(err); }
}

export async function updateTemplate(req, res, next) {
  try {
    const template = await templateService.updateTemplate(parseInt(req.params.id), req.body);
    sendSuccess(res, template, 'Template mis à jour');
  } catch (err) { next(err); }
}

export async function deleteTemplate(req, res, next) {
  try {
    await templateService.deleteTemplate(parseInt(req.params.id));
    sendSuccess(res, null, 'Template supprimé');
  } catch (err) { next(err); }
}
