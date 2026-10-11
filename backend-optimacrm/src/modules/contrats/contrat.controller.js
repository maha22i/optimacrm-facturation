import * as XLSX from 'xlsx';
import * as contratService from './contrat.service.js';
import * as augmentationService from './augmentationAnnuelle.service.js';
import * as renouvellementService from './renouvellement.service.js';
import * as factureService from '../factures/facture.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { MODULES } from '../../config/activityModules.js';
import { CONTRAT_CATEGORIES, getCategoriesForType } from '../../config/contratCategories.js';

// ---------------------------------------------------------------------------
// CONTRATS
// ---------------------------------------------------------------------------

export async function listContrats(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { type_contrat, statut, client_id, search, echeance_avant, prochaine_facture_avant } = req.query;

    const { contrats, pagination } = await contratService.listContrats({
      page, limit, type_contrat, statut, client_id, search, echeance_avant, prochaine_facture_avant,
    });
    sendPaginated(res, contrats, pagination);
  } catch (err) { next(err); }
}

export async function getContrat(req, res, next) {
  try {
    const contrat = await contratService.getContratById(parseInt(req.params.id));
    sendSuccess(res, contrat);
  } catch (err) { next(err); }
}

export async function getHistoriqueAugmentations(req, res, next) {
  try {
    const historique = await augmentationService.getHistoriqueAugmentations(parseInt(req.params.id));
    sendSuccess(res, historique);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// RENOUVELLEMENTS (contrats copieur à renouveler / resigner)
// ---------------------------------------------------------------------------

/** Nombre d'entrées dans la cloche : uniquement les alertes non traitées. */
const NB_ALERTES_CLOCHE = 6;

function parseHorizon(raw) {
  if (raw == null || raw === '') return null;
  const mois = parseInt(raw, 10);
  if (!Number.isFinite(mois) || mois < 0) return null;
  return Math.min(60, mois);
}

export async function listRenouvellements(req, res, next) {
  try {
    const contrats = await renouvellementService.listerRenouvellements({
      horizonMois: parseHorizon(req.query.horizon),
      inclureTraites: req.query.traites === '1',
    });
    const enAlerte = await renouvellementService.compterAlertesRenouvellement();
    sendSuccess(res, { contrats, en_alerte: enAlerte });
  } catch (err) { next(err); }
}

export async function getAlertesRenouvellement(req, res, next) {
  try {
    const total = await renouvellementService.compterAlertesRenouvellement();
    const contrats = total > 0
      ? await renouvellementService.listerRenouvellements({ limit: NB_ALERTES_CLOCHE })
      : [];
    sendSuccess(res, { total, contrats });
  } catch (err) { next(err); }
}

export async function marquerRenouvellementTraite(req, res, next) {
  try {
    const contrat = await renouvellementService.marquerTraite(parseInt(req.params.id), {
      userNom: activityLog.getUserName(req.user),
    });
    if (!contrat) return res.status(404).json({ success: false, message: 'Contrat introuvable ou sans date de renouvellement' });
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'contrat_renouvellement_traite',
        module: MODULES.CONTRATS,
        description: `Relance de renouvellement traitée pour le contrat ${contrat.numero_contrat} (échéance ${contrat.date_renouvellement})`,
        entityType: 'contrat',
        entityId: contrat.id,
        entityLabel: contrat.numero_contrat,
        details: { echeance: contrat.date_renouvellement },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, contrat, 'Relance marquée comme traitée');
  } catch (err) { next(err); }
}

export async function annulerRenouvellementTraite(req, res, next) {
  try {
    const contrat = await renouvellementService.annulerTraitement(parseInt(req.params.id));
    if (!contrat) return res.status(404).json({ success: false, message: 'Contrat introuvable' });
    await activityLog.logRequest(req, {
      action: 'renouvellement_remis_en_attente',
      module: MODULES.CONTRATS,
      description: `Relance de renouvellement remise en attente pour le contrat ${contrat.numero_contrat}`,
      entityType: 'contrat',
      entityId: contrat.id,
      entityLabel: contrat.numero_contrat,
    });
    sendSuccess(res, contrat, 'Relance remise en attente');
  } catch (err) { next(err); }
}

export async function createContrat(req, res, next) {
  try {
    const contrat = await contratService.createContrat(req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'contrat_cree',
        module: MODULES.CONTRATS,
        description: `Création du contrat ${contrat.numero_contrat || ''} pour ${contrat.client_raison_sociale || ''}`,
        entityType: 'contrat',
        entityId: contrat.id,
        entityLabel: contrat.numero_contrat,
        details: { numero_contrat: contrat.numero_contrat, client: contrat.client_raison_sociale },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, contrat, 'Contrat créé avec succès', 201);
  } catch (err) { next(err); }
}

export async function updateContrat(req, res, next) {
  try {
    // Même règle que la suppression : le rôle admin ne suffit pas, la
    // permission doit être cochée explicitement sur l'utilisateur.
    const allowNumeroChange = (req.user?.permissions || []).includes('contrats_renumber');
    const contrat = await contratService.updateContrat(
      parseInt(req.params.id),
      req.body,
      { allowNumeroChange },
    );
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'contrat_modifie',
        module: MODULES.CONTRATS,
        description: `Modification du contrat ${contrat.numero_contrat || ''}`,
        entityType: 'contrat',
        entityId: contrat.id,
        entityLabel: contrat.numero_contrat,
        details: { champs_modifies: Object.keys(req.body) },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, contrat, 'Contrat mis à jour');
  } catch (err) { next(err); }
}

export async function deleteContrat(req, res, next) {
  try {
    const contrat = await contratService.deleteContrat(parseInt(req.params.id));
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'contrat_supprime',
        module: MODULES.CONTRATS,
        description: `Suppression du contrat ${contrat.numero_contrat || ''}`,
        entityType: 'contrat',
        entityId: contrat.id,
        entityLabel: contrat.numero_contrat,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, contrat, 'Contrat supprimé');
  } catch (err) { next(err); }
}

export async function bulkDeleteContrats(req, res, next) {
  try {
    const { ids } = req.body;
    const result = await contratService.bulkDeleteContrats(ids);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'contrats_supprimes_en_masse',
        module: MODULES.CONTRATS,
        description: `Suppression de ${result.deletedCount} contrat(s) sélectionné(s)`,
        entityType: 'contrat',
        details: { ids, numeros: result.deleted.map(c => c.numero_contrat) },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, result, `${result.deletedCount} contrat(s) supprimé(s)`);
  } catch (err) { next(err); }
}

export async function bulkUpdateStatut(req, res, next) {
  try {
    const { ids, statut } = req.body;
    const result = await contratService.bulkUpdateStatut(ids, statut);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'contrats_statut_modifie_en_masse',
        module: MODULES.CONTRATS,
        description: `Passage de ${result.updatedCount} contrat(s) en statut "${statut}"`,
        entityType: 'contrat',
        details: { ids, statut, numeros: result.updated.map(c => c.numero_contrat) },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, result, `${result.updatedCount} contrat(s) mis à jour`);
  } catch (err) { next(err); }
}

export async function deleteAllContrats(req, res, next) {
  try {
    const result = await contratService.deleteAllContrats();
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'contrats_tous_supprimes',
        module: MODULES.CONTRATS,
        description: `Suppression de tous les contrats (${result.deletedCount})`,
        entityType: 'contrat',
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, result, `${result.deletedCount} contrat(s) supprimé(s)`);
  } catch (err) { next(err); }
}

export async function duplicateContrat(req, res, next) {
  try {
    const sourceId = parseInt(req.params.id);
    const contrat = await contratService.duplicateContrat(sourceId);
    await activityLog.logRequest(req, {
      action: 'contrat_duplique',
      module: MODULES.CONTRATS,
      description: `Duplication du contrat ${await contratService.getNumeroContrat(sourceId)} vers ${contrat.numero_contrat}`,
      entityType: 'contrat',
      entityId: contrat.id,
      entityLabel: contrat.numero_contrat,
      details: { contrat_source_id: sourceId },
    });
    sendSuccess(res, contrat, 'Contrat dupliqué avec succès', 201);
  } catch (err) { next(err); }
}

export async function getStats(req, res, next) {
  try {
    const stats = await contratService.getStats();
    sendSuccess(res, stats);
  } catch (err) { next(err); }
}

export async function getContratsByClient(req, res, next) {
  try {
    const contrats = await contratService.listContratsByClient(parseInt(req.params.clientId));
    sendSuccess(res, contrats);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function exportContrats(req, res, next) {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const includeLignes = req.query.lignes === '1';
    const includeMachines = req.query.machines === '1';
    const { type_contrat, statut, search } = req.query;

    const { contrats, lignes, machines } = await contratService.getContratsForExport({
      type_contrat, statut, search, includeLignes, includeMachines,
    });

    const wb = XLSX.utils.book_new();

    const contratRows = contrats.map(c => ({
      'N° Contrat': c.numero_contrat,
      'Type': c.type_contrat,
      'Facturation': c.type_facturation,
      'Client': c.client_raison_sociale,
      'Code client': c.client_code || '',
      'Email client': c.client_email || '',
      'Statut': c.statut,
      'Périodicité': c.periodicite,
      'Date signature': fmtDate(c.date_signature),
      'Date début': fmtDate(c.date_debut),
      'Date échéance': fmtDate(c.date_echeance),
      'Proch. facture': fmtDate(c.date_prochaine_facture),
      'Durée (mois)': c.duree_contrat_mois,
      'Loyer HT': c.loyer_ht,
      'Montant HT': parseFloat(c.montant_ht) || 0,
      'Location interne': c.location_interne ? 'Oui' : 'Non',
      'Calage': c.calage ? 'Oui' : 'Non',
      'Date calage': fmtDate(c.date_calage),
      'N° dossier financement': c.numero_dossier_financement || '',
      'Organisme crédit': c.organisme_credit || '',
      'Montant financé': c.montant_finance || 0,
      'FTC': c.ftc || 0,
      'ECT': c.ect || 0,
      'Machines': c.machines_resume || '',
      'Notes': c.notes || '',
      'Date création': fmtDate(c.created_at),
    }));

    const ws = XLSX.utils.json_to_sheet(contratRows);
    if (contratRows.length > 0) {
      ws['!cols'] = Object.keys(contratRows[0]).map(key => ({
        wch: Math.max(key.length, ...contratRows.map(r => String(r[key] || '').length).slice(0, 50)) + 2,
      }));
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Contrats');

    if (includeLignes && lignes.length > 0) {
      const contratMap = {};
      for (const c of contrats) contratMap[c.id] = c.numero_contrat;

      const ligneRows = lignes.map(l => ({
        'N° Contrat': contratMap[l.contrat_id] || l.contrat_id,
        'Ordre': l.ordre,
        'Catégorie': l.categorie_ligne || '',
        'Référence': l.reference || '',
        'Désignation': l.designation,
        'Complément': l.complement_info || '',
        'Quantité': l.quantite,
        'Prix unitaire HT': l.prix_unitaire_ht,
        'Remise (%)': l.remise_pourcentage,
        'TVA (%)': l.taux_tva,
        'Actif': l.actif ? 'Oui' : 'Non',
      }));
      const wsLignes = XLSX.utils.json_to_sheet(ligneRows);
      XLSX.utils.book_append_sheet(wb, wsLignes, 'Lignes');
    }

    if (includeMachines && machines.length > 0) {
      const contratMap = {};
      for (const c of contrats) contratMap[c.id] = c.numero_contrat;

      const machineRows = machines.map(m => ({
        'N° Contrat': contratMap[m.contrat_id] || m.contrat_id,
        'N° Série': m.numero_serie,
        'Modèle': m.modele || '',
        'Marque': m.marque || '',
        'Désignation': m.designation || '',
        'Coût copie N&B': m.cout_copie_nb,
        'Coût copie Couleur': m.cout_copie_couleur,
        'Forfait N&B': m.volume_forfait_nb,
        'Forfait Couleur': m.volume_forfait_couleur,
        'Dernier compteur N&B': m.dernier_compteur_nb,
        'Dernier compteur Couleur': m.dernier_compteur_couleur,
        'Date dernier relevé': fmtDate(m.date_dernier_releve),
        'Actif': m.actif ? 'Oui' : 'Non',
      }));
      const wsMachines = XLSX.utils.json_to_sheet(machineRows);
      XLSX.utils.book_append_sheet(wb, wsMachines, 'Machines');
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `contrats_export_${timestamp}`;

    if (format === 'xlsx') {
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      return res.send(Buffer.from(buf));
    }

    const csvContent = XLSX.utils.sheet_to_csv(ws, { FS: ';' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send('\ufeff' + csvContent);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// GÉNÉRATION FACTURE DEPUIS CONTRAT
// ---------------------------------------------------------------------------

export async function genererFacture(req, res, next) {
  try {
    const contratId = parseInt(req.params.id);
    const options = {
      periode_debut: req.body.periode_debut || undefined,
      periode_fin: req.body.periode_fin || undefined,
      releve_compteur_nb_id: req.body.releve_compteur_nb_id || undefined,
      releve_compteur_coul_id: req.body.releve_compteur_coul_id || undefined,
    };
    const facture = await factureService.genererDepuisContrat(contratId, req.user.id, options);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'facture_generee_contrat',
        module: MODULES.CONTRATS,
        description: `Facture ${facture.numero_facture} générée depuis contrat #${contratId}`,
        entityType: 'contrat',
        entityId: contratId,
        entityLabel: facture.numero_contrat,
        details: { facture_id: facture.id, numero_facture: facture.numero_facture },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, facture, 'Facture générée avec succès', 201);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// IMPORT CONTRATS (GÉNÉRIQUE — paramétré par type_contrat)
// ---------------------------------------------------------------------------

export async function getCategories(req, res, next) {
  try {
    const typeContrat = req.query.type_contrat;
    if (typeContrat) {
      sendSuccess(res, { type_contrat: typeContrat, categories: getCategoriesForType(typeContrat) });
    } else {
      sendSuccess(res, CONTRAT_CATEGORIES);
    }
  } catch (err) { next(err); }
}

export async function previewImportContrats(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
    const typeContrat = req.params.type || req.body.type_contrat || 'Telephonie';
    const preview = await contratService.previewImportContrats(req.file.buffer, typeContrat);
    sendSuccess(res, preview);
  } catch (err) { next(err); }
}

export async function importContratsExecute(req, res, next) {
  try {
    if (!req.file && !req.files?.file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
    const typeContrat = req.params.type || req.body.type_contrat || 'Telephonie';
    const mainFile = req.file || (req.files?.file && req.files.file[0]);
    const logicielsFile = req.files?.logiciels && req.files.logiciels[0];

    const result = await contratService.importContrats(
      mainFile.buffer,
      typeContrat,
      req.user?.id,
      activityLog.getUserName(req.user),
      activityLog.getClientIp(req),
      logicielsFile?.buffer || null,
    );
    sendSuccess(res, result, `${result.contrats_crees} contrats ${typeContrat} importés`);
  } catch (err) { next(err); }
}

// Rétro-compatibilité
export async function previewImportTelephonie(req, res, next) {
  req.params.type = 'Telephonie';
  return previewImportContrats(req, res, next);
}

export async function importContratsTelephonie(req, res, next) {
  req.params.type = 'Telephonie';
  return importContratsExecute(req, res, next);
}

// ---------------------------------------------------------------------------
// LIGNES
// ---------------------------------------------------------------------------

// Les lignes et machines sont journalisées sur le contrat porteur
// (entityType 'contrat') plutôt que sur elles-mêmes : c'est le contrat qu'on
// consulte pour reconstituer l'historique, et une ligne supprimée n'a plus
// d'écran où afficher le sien.
async function logSurContrat(req, contratId, { action, resume, details }) {
  const numero = await contratService.getNumeroContrat(contratId);
  await activityLog.logRequest(req, {
    action,
    module: MODULES.CONTRATS,
    description: `${resume} du contrat ${numero}`,
    entityType: 'contrat',
    entityId: contratId,
    entityLabel: numero,
    details,
  });
}

export async function addLigne(req, res, next) {
  try {
    const contratId = parseInt(req.params.id);
    const ligne = await contratService.addLigne(contratId, req.body);
    await logSurContrat(req, contratId, {
      action: 'contrat_ligne_ajoutee',
      resume: `Ajout de la ligne « ${ligne.designation || ligne.categorie_ligne} »`,
      details: {
        ligne_id: ligne.id,
        designation: ligne.designation,
        categorie: ligne.categorie_ligne,
        quantite: ligne.quantite,
        prix_unitaire_ht: ligne.prix_unitaire_ht,
      },
    });
    sendSuccess(res, ligne, 'Ligne ajoutée', 201);
  } catch (err) { next(err); }
}

export async function updateLigne(req, res, next) {
  try {
    const contratId = parseInt(req.params.id);
    const ligne = await contratService.updateLigne(
      contratId,
      parseInt(req.params.ligneId),
      req.body,
    );
    await logSurContrat(req, contratId, {
      action: 'contrat_ligne_modifiee',
      resume: `Modification de la ligne « ${ligne.designation || ligne.categorie_ligne} »`,
      details: {
        ligne_id: ligne.id,
        designation: ligne.designation,
        champs_modifies: Object.keys(req.body),
        prix_unitaire_ht: ligne.prix_unitaire_ht,
      },
    });
    sendSuccess(res, ligne, 'Ligne mise à jour');
  } catch (err) { next(err); }
}

export async function deleteLigne(req, res, next) {
  try {
    const contratId = parseInt(req.params.id);
    const ligne = await contratService.deleteLigne(contratId, parseInt(req.params.ligneId));
    await logSurContrat(req, contratId, {
      action: 'contrat_ligne_supprimee',
      resume: `Suppression de la ligne « ${ligne.designation || ligne.categorie_ligne} »`,
      details: {
        ligne_id: ligne.id,
        designation: ligne.designation,
        categorie: ligne.categorie_ligne,
        prix_unitaire_ht: ligne.prix_unitaire_ht,
      },
    });
    sendSuccess(res, null, 'Ligne supprimée');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// MACHINES
// ---------------------------------------------------------------------------

export async function addMachine(req, res, next) {
  try {
    const contratId = parseInt(req.params.id);
    const machine = await contratService.addMachine(contratId, req.body);
    await logSurContrat(req, contratId, {
      action: 'contrat_machine_ajoutee',
      resume: `Ajout de la machine ${machine.numero_serie}`,
      details: {
        machine_id: machine.id,
        numero_serie: machine.numero_serie,
        modele: machine.modele,
        cout_copie_nb: machine.cout_copie_nb,
        cout_copie_couleur: machine.cout_copie_couleur,
      },
    });
    sendSuccess(res, machine, 'Machine ajoutée', 201);
  } catch (err) { next(err); }
}

export async function updateMachine(req, res, next) {
  try {
    const contratId = parseInt(req.params.id);
    const machine = await contratService.updateMachine(
      contratId,
      parseInt(req.params.machineId),
      req.body,
    );
    await logSurContrat(req, contratId, {
      action: 'contrat_machine_modifiee',
      resume: `Modification de la machine ${machine.numero_serie}`,
      details: {
        machine_id: machine.id,
        numero_serie: machine.numero_serie,
        champs_modifies: Object.keys(req.body),
      },
    });
    sendSuccess(res, machine, 'Machine mise à jour');
  } catch (err) { next(err); }
}

export async function deleteMachine(req, res, next) {
  try {
    const contratId = parseInt(req.params.id);
    const machine = await contratService.deleteMachine(contratId, parseInt(req.params.machineId));
    await logSurContrat(req, contratId, {
      action: 'contrat_machine_supprimee',
      resume: `Suppression de la machine ${machine.numero_serie}`,
      details: {
        machine_id: machine.id,
        numero_serie: machine.numero_serie,
        modele: machine.modele,
      },
    });
    sendSuccess(res, null, 'Machine supprimée');
  } catch (err) { next(err); }
}
