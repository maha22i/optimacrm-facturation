import * as service from './champsConfig.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { MODULES } from '../../config/activityModules.js';
import { sendSuccess } from '../../utils/response.js';

// La saisie de valeurs se rattache au module de l'entité porteuse, pas aux paramètres.
const MODULE_PAR_ENTITE = {
  CLIENT: MODULES.CLIENTS,
  DEVIS: MODULES.DEVIS,
  CATALOGUE: MODULES.CATALOGUE,
  CONTRAT: MODULES.CONTRATS,
};

function logConfig(req, config, { action, description }) {
  return activityLog.logRequest(req, {
    action,
    module: MODULES.PARAMETRES,
    description,
    entityType: 'champ_personnalise',
    entityId: config?.id ?? null,
    entityLabel: config?.label ?? null,
    details: config ? { entite: config.entite, cle: config.cle, section: config.section } : undefined,
  });
}

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
    await logConfig(req, config, {
      action: 'champ_personnalise_cree',
      description: `Création du champ personnalisé « ${config.label} » sur ${config.entite}`,
    });
    sendSuccess(res, config, 'Champ personnalisé créé', 201);
  } catch (err) { next(err); }
}

export async function updateConfig(req, res, next) {
  try {
    const config = await service.updateConfig(parseInt(req.params.id), req.body);
    await logConfig(req, config, {
      action: 'champ_personnalise_modifie',
      description: `Modification du champ personnalisé « ${config.label} » sur ${config.entite}`,
    });
    sendSuccess(res, config, 'Champ personnalisé mis à jour');
  } catch (err) { next(err); }
}

export async function deleteConfig(req, res, next) {
  try {
    const config = await service.deleteConfig(parseInt(req.params.id));
    await logConfig(req, config, {
      action: 'champ_personnalise_supprime',
      description: `Suppression du champ personnalisé « ${config.label} » sur ${config.entite}`,
    });
    sendSuccess(res, null, 'Champ personnalisé supprimé');
  } catch (err) { next(err); }
}

export async function updateSectionOrdre(req, res, next) {
  try {
    const { entite } = req.params;
    await service.updateSectionOrdre(entite, req.body.sections);
    await activityLog.logRequest(req, {
      action: 'sections_champs_reordonnees',
      module: MODULES.PARAMETRES,
      description: `Réorganisation des sections de champs personnalisés sur ${entite.toUpperCase()}`,
      entityType: 'champ_personnalise_section',
      entityLabel: entite.toUpperCase(),
      details: { sections: (req.body.sections || []).map(s => s.section) },
    });
    sendSuccess(res, null, 'Ordre des sections mis à jour');
  } catch (err) { next(err); }
}

export async function renameSection(req, res, next) {
  try {
    const { entite } = req.params;
    const { oldName, newName } = req.body;
    const result = await service.renameSection(entite, oldName, newName);
    await activityLog.logRequest(req, {
      action: 'section_champs_renommee',
      module: MODULES.PARAMETRES,
      description: `Section de champs personnalisés « ${oldName} » renommée en « ${newName} » sur ${entite.toUpperCase()}`,
      entityType: 'champ_personnalise_section',
      entityLabel: newName,
      details: { entite: entite.toUpperCase(), ancien_nom: oldName, champs_impactes: result.updated },
    });
    sendSuccess(res, result, 'Section renommée');
  } catch (err) { next(err); }
}

export async function deleteSection(req, res, next) {
  try {
    const { entite, section } = req.params;
    const nomSection = decodeURIComponent(section);
    const result = await service.deleteSection(entite, nomSection);
    await activityLog.logRequest(req, {
      action: 'section_champs_supprimee',
      module: MODULES.PARAMETRES,
      description: `Suppression de la section « ${nomSection} » sur ${entite.toUpperCase()} (${result.deleted} champ(s))`,
      entityType: 'champ_personnalise_section',
      entityLabel: nomSection,
      details: { entite: entite.toUpperCase(), champs_supprimes: result.deleted },
    });
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
    const entiteMaj = entite.toUpperCase();
    await activityLog.logRequest(req, {
      action: 'champs_personnalises_enregistres',
      module: MODULE_PAR_ENTITE[entiteMaj] || MODULES.PARAMETRES,
      description: `Enregistrement des champs personnalisés sur ${entiteMaj} #${entiteId}`,
      entityType: entiteMaj.toLowerCase(),
      entityId: entiteId,
      details: { champs: (req.body.valeurs || []).map(v => v.cle ?? v.config_id) },
    });
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
