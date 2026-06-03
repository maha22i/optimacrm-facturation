import * as XLSX from 'xlsx';
import * as parcService from './parcMachine.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

// ---------------------------------------------------------------------------
// MACHINES
// ---------------------------------------------------------------------------

export async function listMachines(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { search, categorie, statut, client_id, alerte_compteur, sort, order } = req.query;

    const { machines, pagination } = await parcService.listMachines({
      page, limit, search, categorie, statut, client_id, alerte_compteur, sort, order,
    });
    sendPaginated(res, machines, pagination);
  } catch (err) { next(err); }
}

export async function getMachine(req, res, next) {
  try {
    const machine = await parcService.getMachineById(parseInt(req.params.id));
    sendSuccess(res, machine);
  } catch (err) { next(err); }
}

export async function getMachinesByClient(req, res, next) {
  try {
    const machines = await parcService.getMachinesByClient(parseInt(req.params.clientId));
    sendSuccess(res, machines);
  } catch (err) { next(err); }
}

export async function createMachine(req, res, next) {
  try {
    const machine = await parcService.createMachine(req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'machine_creee',
        module: 'parc_machines',
        description: `Création de la machine ${machine.numero_serie || ''}`,
        entityType: 'machine',
        entityId: machine.id,
        entityLabel: machine.numero_serie,
        details: { numero_serie: machine.numero_serie, modele: machine.modele },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, machine, 'Machine créée avec succès', 201);
  } catch (err) { next(err); }
}

export async function updateMachine(req, res, next) {
  try {
    const machine = await parcService.updateMachine(parseInt(req.params.id), req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'machine_modifiee',
        module: 'parc_machines',
        description: `Modification de la machine ${machine.numero_serie || ''}`,
        entityType: 'machine',
        entityId: machine.id,
        entityLabel: machine.numero_serie,
        details: { champs_modifies: Object.keys(req.body) },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, machine, 'Machine mise à jour');
  } catch (err) { next(err); }
}

export async function deleteMachine(req, res, next) {
  try {
    const machineId = parseInt(req.params.id);
    let machineLabel = `#${machineId}`;
    try { const m = await parcService.getMachineById(machineId); machineLabel = m.numero_serie || machineLabel; } catch (_) {}
    await parcService.deleteMachine(machineId);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'machine_supprimee',
        module: 'parc_machines',
        description: `Suppression de la machine ${machineLabel}`,
        entityType: 'machine',
        entityId: machineId,
        entityLabel: machineLabel,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, null, 'Machine supprimée');
  } catch (err) { next(err); }
}

export async function duplicateMachine(req, res, next) {
  try {
    const machine = await parcService.duplicateMachine(parseInt(req.params.id));
    sendSuccess(res, machine, 'Machine dupliquée avec succès', 201);
  } catch (err) { next(err); }
}

export async function getStats(req, res, next) {
  try {
    const stats = await parcService.getStats();
    sendSuccess(res, stats);
  } catch (err) { next(err); }
}

export async function checkNumeroSerie(req, res, next) {
  try {
    const { numero_serie, exclude_id } = req.query;
    const exists = await parcService.checkNumeroSerieExists(numero_serie, exclude_id ? parseInt(exclude_id) : null);
    sendSuccess(res, { exists });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function exportMachines(req, res, next) {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const { search, categorie, statut, client_id } = req.query;

    const machines = await parcService.getMachinesForExport({ search, categorie, statut, client_id });

    const rows = machines.map(m => ({
      'N° Série': m.numero_serie,
      'Matricule': m.matricule || '',
      'Désignation': m.designation,
      'Marque': m.marque || '',
      'Modèle': m.modele || '',
      'Catégorie': m.categorie,
      'Statut': m.statut,
      'Client': m.client_raison_sociale || '',
      'Code client': m.client_code || '',
      'Email client': m.client_email || '',
      'Site installation': m.site_installation || '',
      'N° Contrat': m.numero_contrat || '',
      'Date installation': fmtDate(m.date_installation),
      'Date fin garantie': fmtDate(m.date_fin_garantie),
      'Date retrait': fmtDate(m.date_retrait),
      'Compteur N&B': m.dernier_compteur_nb || 0,
      'Compteur Couleur': m.dernier_compteur_couleur || 0,
      'Date dernier relevé': fmtDate(m.date_dernier_releve),
      'Coût copie N&B': m.cout_copie_nb || '',
      'Coût copie Couleur': m.cout_copie_couleur || '',
      'Volume offert N&B': m.volume_offert_nb || 0,
      'Volume offert Couleur': m.volume_offert_couleur || 0,
      'Vitesse (ppm)': m.vitesse_ppm || '',
      'Format max': m.format_max || '',
      'Recto-verso': m.recto_verso ? 'Oui' : 'Non',
      'Réseau': m.reseau ? 'Oui' : 'Non',
      'Réf. produit': m.reference_produit || '',
      'Notes': m.notes || '',
      'Date création': fmtDate(m.created_at),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    if (rows.length > 0) {
      ws['!cols'] = Object.keys(rows[0]).map(key => ({
        wch: Math.max(key.length, ...rows.map(r => String(r[key] || '').length).slice(0, 50)) + 2,
      }));
    }
    XLSX.utils.book_append_sheet(wb, ws, 'Parc Machines');

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `parc_machines_export_${timestamp}`;

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
// RELEVÉS
// ---------------------------------------------------------------------------

export async function listReleves(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const { releves, pagination } = await parcService.listReleves(parseInt(req.params.id), { page, limit });
    sendPaginated(res, releves, pagination);
  } catch (err) { next(err); }
}

export async function createReleve(req, res, next) {
  try {
    const releve = await parcService.createReleve(parseInt(req.params.id), req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'releve_saisi',
        module: 'releves',
        description: `Saisie manuelle du relevé pour la machine #${req.params.id}`,
        entityType: 'machine',
        entityId: parseInt(req.params.id),
        entityLabel: `Machine #${req.params.id}`,
        details: { compteur_nb: req.body.compteur_nb, compteur_couleur: req.body.compteur_couleur },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, releve, 'Relevé enregistré avec succès', 201);
  } catch (err) { next(err); }
}

export async function updateReleve(req, res, next) {
  try {
    const releve = await parcService.updateReleve(
      parseInt(req.params.id),
      parseInt(req.params.releveId),
      req.body,
    );
    sendSuccess(res, releve, 'Relevé mis à jour');
  } catch (err) { next(err); }
}

export async function deleteReleve(req, res, next) {
  try {
    await parcService.deleteReleve(parseInt(req.params.id), parseInt(req.params.releveId));
    sendSuccess(res, null, 'Relevé supprimé');
  } catch (err) { next(err); }
}
