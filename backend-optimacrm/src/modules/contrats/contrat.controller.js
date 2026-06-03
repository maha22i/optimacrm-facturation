import * as XLSX from 'xlsx';
import * as contratService from './contrat.service.js';
import * as factureService from '../factures/facture.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

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

export async function createContrat(req, res, next) {
  try {
    const contrat = await contratService.createContrat(req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'contrat_cree',
        module: 'contrats',
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
    const contrat = await contratService.updateContrat(parseInt(req.params.id), req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'contrat_modifie',
        module: 'contrats',
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
        module: 'contrats',
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

export async function duplicateContrat(req, res, next) {
  try {
    const contrat = await contratService.duplicateContrat(parseInt(req.params.id));
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
        module: 'contrats',
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
// LIGNES
// ---------------------------------------------------------------------------

export async function addLigne(req, res, next) {
  try {
    const ligne = await contratService.addLigne(parseInt(req.params.id), req.body);
    sendSuccess(res, ligne, 'Ligne ajoutée', 201);
  } catch (err) { next(err); }
}

export async function updateLigne(req, res, next) {
  try {
    const ligne = await contratService.updateLigne(
      parseInt(req.params.id),
      parseInt(req.params.ligneId),
      req.body,
    );
    sendSuccess(res, ligne, 'Ligne mise à jour');
  } catch (err) { next(err); }
}

export async function deleteLigne(req, res, next) {
  try {
    await contratService.deleteLigne(parseInt(req.params.id), parseInt(req.params.ligneId));
    sendSuccess(res, null, 'Ligne supprimée');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// MACHINES
// ---------------------------------------------------------------------------

export async function addMachine(req, res, next) {
  try {
    const machine = await contratService.addMachine(parseInt(req.params.id), req.body);
    sendSuccess(res, machine, 'Machine ajoutée', 201);
  } catch (err) { next(err); }
}

export async function updateMachine(req, res, next) {
  try {
    const machine = await contratService.updateMachine(
      parseInt(req.params.id),
      parseInt(req.params.machineId),
      req.body,
    );
    sendSuccess(res, machine, 'Machine mise à jour');
  } catch (err) { next(err); }
}

export async function deleteMachine(req, res, next) {
  try {
    await contratService.deleteMachine(parseInt(req.params.id), parseInt(req.params.machineId));
    sendSuccess(res, null, 'Machine supprimée');
  } catch (err) { next(err); }
}
