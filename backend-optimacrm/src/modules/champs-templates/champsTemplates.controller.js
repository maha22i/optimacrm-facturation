import * as templateService from './champsTemplates.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { MODULES } from '../../config/activityModules.js';
import { sendSuccess } from '../../utils/response.js';

function logTemplate(req, template, { action, description }) {
  return activityLog.logRequest(req, {
    action,
    module: MODULES.PARAMETRES,
    description,
    entityType: 'champ_personnalise_template',
    entityId: template?.id ?? null,
    entityLabel: template?.label ?? null,
    details: template ? { categorie: template.categorie } : undefined,
  });
}

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
    await logTemplate(req, template, {
      action: 'template_champ_cree',
      description: `Création du modèle de champ « ${template.label} »`,
    });
    sendSuccess(res, template, 'Template créé', 201);
  } catch (err) { next(err); }
}

export async function updateTemplate(req, res, next) {
  try {
    const template = await templateService.updateTemplate(parseInt(req.params.id), req.body);
    await logTemplate(req, template, {
      action: 'template_champ_modifie',
      description: `Modification du modèle de champ « ${template.label} »`,
    });
    sendSuccess(res, template, 'Template mis à jour');
  } catch (err) { next(err); }
}

export async function deleteTemplate(req, res, next) {
  try {
    const template = await templateService.deleteTemplate(parseInt(req.params.id));
    await logTemplate(req, template, {
      action: 'template_champ_supprime',
      description: `Suppression du modèle de champ « ${template.label} »`,
    });
    sendSuccess(res, null, 'Template supprimé');
  } catch (err) { next(err); }
}
