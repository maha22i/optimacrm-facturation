import * as XLSX from 'xlsx';
import * as clientService from './client.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { MODULES } from '../../config/activityModules.js';

// ---------------------------------------------------------------------------
// CLIENTS
// ---------------------------------------------------------------------------

export async function listClients(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const { statut, search, type_contrat } = req.query;

    const { clients, pagination } = await clientService.listClients({ page, limit, statut, search, type_contrat });
    sendPaginated(res, clients, pagination);
  } catch (err) { next(err); }
}

export async function getClient(req, res, next) {
  try {
    const client = await clientService.getClientById(parseInt(req.params.id));
    sendSuccess(res, client);
  } catch (err) { next(err); }
}

export async function createClient(req, res, next) {
  try {
    const client = await clientService.createClient(req.body);
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'client_cree',
        module: MODULES.CLIENTS,
        description: `Création du client ${client.raison_sociale}`,
        entityType: 'client',
        entityId: client.id,
        entityLabel: client.raison_sociale,
        details: { numero_client: client.numero_client, raison_sociale: client.raison_sociale },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, client, 'Client créé avec succès', 201);
  } catch (err) { next(err); }
}

export async function updateClient(req, res, next) {
  try {
    const client = await clientService.updateClient(parseInt(req.params.id), req.body);
    try {
      const changedFields = Object.keys(req.body).filter(k => req.body[k] !== undefined);
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'client_modifie',
        module: MODULES.CLIENTS,
        description: `Modification du client ${client.raison_sociale}`,
        entityType: 'client',
        entityId: client.id,
        entityLabel: client.raison_sociale,
        details: { champs_modifies: changedFields },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    await logContratsResilies(req, client);
    sendSuccess(res, client, 'Client mis à jour');
  } catch (err) { next(err); }
}

async function logContratsResilies(req, client) {
  if (!client.contrats_resilies?.length) return;
  try {
    await activityLog.log({
      userId: req.user?.id,
      userNom: activityLog.getUserName(req.user),
      action: 'contrats_resilies_client_inactif',
      module: MODULES.CONTRATS,
      description: `${client.contrats_resilies.length} contrat(s) résilié(s) suite à la désactivation du client ${client.raison_sociale}`,
      entityType: 'client',
      entityId: client.id,
      entityLabel: client.raison_sociale,
      details: { contrats: client.contrats_resilies.map(c => c.numero_contrat) },
      ipAddress: activityLog.getClientIp(req),
    });
  } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
}

export async function deleteClient(req, res, next) {
  try {
    const client = await clientService.deleteClient(parseInt(req.params.id));
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'client_supprime',
        module: MODULES.CLIENTS,
        description: `Suppression du client ${client.raison_sociale}`,
        entityType: 'client',
        entityId: client.id,
        entityLabel: client.raison_sociale,
        details: { raison_sociale: client.raison_sociale, numero_client: client.numero_client },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    await logContratsResilies(req, client);
    sendSuccess(res, client, 'Client passé en inactif');
  } catch (err) { next(err); }
}

export async function deleteAllClients(req, res, next) {
  try {
    if (req.user?.role !== 'admin') {
      throw new Error('Seuls les administrateurs peuvent supprimer tous les clients');
    }
    const result = await clientService.deleteAllClients();
    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'clients_tous_supprimes',
        module: MODULES.CLIENTS,
        description: `Suppression de tous les clients (${result.deletedCount} supprimés)`,
        entityType: 'client',
        entityId: null,
        entityLabel: 'Tous les clients',
        details: { deleted_count: result.deletedCount },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, result, `${result.deletedCount} client(s) supprimé(s) définitivement`);
  } catch (err) { next(err); }
}

export async function getClientStats(req, res, next) {
  try {
    // req.tenantModulesActifs posé par authenticate.js (LEFT JOIN tenants,
    // cf. dashboard.controller.js) — "désactivé = invisible" jusque dans
    // le calcul, pas seulement dans l'affichage.
    const stats = await clientService.getClientStats(parseInt(req.params.id), req.tenantModulesActifs);
    sendSuccess(res, stats);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

const STATUT_LABELS = { ACTIF: 'Actif', INACTIF: 'Inactif', BLOQUE: 'Bloqué', PROSPECT: 'Prospect' };
const FORME_LABELS = { SARL: 'SARL', SAS: 'SAS', EURL: 'EURL', SA: 'SA', SCI: 'SCI', AUTO_ENTREPRENEUR: 'Auto-entrepreneur', ASSOCIATION: 'Association', AUTRE: 'Autre' };
const DELAI_LABELS = { COMPTANT: 'Comptant', '15_JOURS': '15 jours', '30_JOURS': '30 jours', '45_JOURS_FIN_MOIS': '45 jours fin de mois', '60_JOURS': '60 jours' };
const MODE_LABELS = { VIREMENT: 'Virement', PRELEVEMENT_SEPA: 'Prélèvement SEPA', CHEQUE: 'Chèque', CARTE: 'Carte', ESPECES: 'Espèces' };

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function exportClients(req, res, next) {
  try {
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const includeAdresses = req.query.adresses === '1';
    const includeContacts = req.query.contacts === '1';
    const { statut, search, type_contrat } = req.query;

    const { clients, adresses, contacts } = await clientService.getClientsForExport({
      statut,
      search,
      type_contrat,
      includeAdresses,
      includeContacts,
    });

    const adressesByClient = {};
    for (const a of adresses) {
      if (!adressesByClient[a.client_id]) adressesByClient[a.client_id] = [];
      adressesByClient[a.client_id].push(a);
    }

    const contactsByClient = {};
    for (const c of contacts) {
      if (!contactsByClient[c.client_id]) contactsByClient[c.client_id] = [];
      contactsByClient[c.client_id].push(c);
    }

    const rows = [];

    for (const client of clients) {
      const row = {
        'Numéro client': client.numero_client,
        'Raison sociale': client.raison_sociale,
        'Forme juridique': FORME_LABELS[client.forme_juridique] || client.forme_juridique,
        'Statut': STATUT_LABELS[client.statut] || client.statut,
        'SIRET': client.siret || '',
        'SIREN': client.siren || '',
        'TVA intracommunautaire': client.tva_intracommunautaire || '',
        'Code APE': client.code_ape || '',
        'N° RCS': client.numero_rcs || '',
        'Site web': client.site_web || '',
        'Téléphone': client.telephone_principal || '',
        'Email': client.email_principal,
        'Email comptabilité': client.email_comptabilite || '',
        'Délai paiement': DELAI_LABELS[client.delai_paiement] || client.delai_paiement,
        'Mode paiement': MODE_LABELS[client.mode_paiement_prefere] || client.mode_paiement_prefere || '',
        'Remise globale (%)': client.remise_globale,
        'Taux TVA défaut (%)': client.taux_tva_defaut,
        'Devise': client.devise,
        'IBAN': client.iban || '',
        'BIC': client.bic || '',
        'Réf. mandat SEPA': client.reference_mandat_sepa || '',
        'Date mandat SEPA': formatDate(client.date_mandat_sepa),
        'Notes': client.notes || '',
        'Date création': formatDate(client.created_at),
      };

      if (includeAdresses) {
        const adr = adressesByClient[client.id] || [];
        const defaut = adr.find(a => a.est_defaut) || adr[0];
        row['Adresse - Type'] = defaut?.type || '';
        row['Adresse - Ligne 1'] = defaut?.ligne1 || '';
        row['Adresse - Ligne 2'] = defaut?.ligne2 || '';
        row['Adresse - Code postal'] = defaut?.code_postal || '';
        row['Adresse - Ville'] = defaut?.ville || '';
        row['Adresse - Pays'] = defaut?.pays || '';
      }

      if (includeContacts) {
        const ctcs = contactsByClient[client.id] || [];
        const principal = ctcs.find(c => c.est_principal) || ctcs[0];
        row['Contact - Nom'] = principal?.nom || '';
        row['Contact - Prénom'] = principal?.prenom || '';
        row['Contact - Fonction'] = principal?.fonction || '';
        row['Contact - Téléphone'] = principal?.telephone || '';
        row['Contact - Mobile'] = principal?.mobile || '';
        row['Contact - Email'] = principal?.email || '';
      }

      rows.push(row);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String(r[key] || '').length).slice(0, 50)) + 2,
    }));
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, 'Clients');

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `clients_export_${timestamp}`;

    if (format === 'xlsx') {
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      return res.send(Buffer.from(buf));
    }

    const csvContent = XLSX.utils.sheet_to_csv(ws, { FS: ';' });
    const bom = '\ufeff';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(bom + csvContent);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// ADRESSES
// ---------------------------------------------------------------------------

export async function listAdresses(req, res, next) {
  try {
    const adresses = await clientService.listAdresses(parseInt(req.params.id));
    sendSuccess(res, adresses);
  } catch (err) { next(err); }
}

// Adresses, contacts et documents sont journalisés sur le client porteur :
// c'est sa fiche qu'on consulte pour retracer l'historique, et un contact
// supprimé n'a plus d'écran propre.
async function logSurClient(req, clientId, { action, resume, details }) {
  const raisonSociale = await clientService.getRaisonSociale(clientId);
  await activityLog.logRequest(req, {
    action,
    module: MODULES.CLIENTS,
    description: `${resume} du client ${raisonSociale}`,
    entityType: 'client',
    entityId: clientId,
    entityLabel: raisonSociale,
    details,
  });
}

export async function createAdresse(req, res, next) {
  try {
    const clientId = parseInt(req.params.id);
    const adresse = await clientService.createAdresse(clientId, req.body);
    await logSurClient(req, clientId, {
      action: 'client_adresse_ajoutee',
      resume: `Ajout de l'adresse ${adresse.ligne1 || ''} ${adresse.ville || ''}`.trim(),
      details: { adresse_id: adresse.id, type: adresse.type, ville: adresse.ville },
    });
    sendSuccess(res, adresse, 'Adresse ajoutée', 201);
  } catch (err) { next(err); }
}

export async function updateAdresse(req, res, next) {
  try {
    const clientId = parseInt(req.params.id);
    const adresse = await clientService.updateAdresse(
      clientId,
      parseInt(req.params.adresseId),
      req.body,
    );
    await logSurClient(req, clientId, {
      action: 'client_adresse_modifiee',
      resume: `Modification de l'adresse ${adresse.ligne1 || ''} ${adresse.ville || ''}`.trim(),
      details: { adresse_id: adresse.id, champs_modifies: Object.keys(req.body) },
    });
    sendSuccess(res, adresse, 'Adresse mise à jour');
  } catch (err) { next(err); }
}

export async function deleteAdresse(req, res, next) {
  try {
    const clientId = parseInt(req.params.id);
    const adresse = await clientService.deleteAdresse(clientId, parseInt(req.params.adresseId));
    await logSurClient(req, clientId, {
      action: 'client_adresse_supprimee',
      resume: `Suppression de l'adresse ${adresse.ligne1 || ''} ${adresse.ville || ''}`.trim(),
      details: { adresse_id: adresse.id, type: adresse.type, ville: adresse.ville },
    });
    sendSuccess(res, null, 'Adresse supprimée');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// CONTACTS
// ---------------------------------------------------------------------------

export async function listContacts(req, res, next) {
  try {
    const contacts = await clientService.listContacts(parseInt(req.params.id));
    sendSuccess(res, contacts);
  } catch (err) { next(err); }
}

export async function createContact(req, res, next) {
  try {
    const clientId = parseInt(req.params.id);
    const contact = await clientService.createContact(clientId, req.body);
    const nom = `${contact.prenom || ''} ${contact.nom || ''}`.trim();
    await logSurClient(req, clientId, {
      action: 'client_contact_ajoute',
      resume: `Ajout du contact ${nom}`,
      details: { contact_id: contact.id, nom, fonction: contact.fonction, email: contact.email },
    });
    sendSuccess(res, contact, 'Contact ajouté', 201);
  } catch (err) { next(err); }
}

export async function updateContact(req, res, next) {
  try {
    const clientId = parseInt(req.params.id);
    const contact = await clientService.updateContact(
      clientId,
      parseInt(req.params.contactId),
      req.body,
    );
    const nom = `${contact.prenom || ''} ${contact.nom || ''}`.trim();
    await logSurClient(req, clientId, {
      action: 'client_contact_modifie',
      resume: `Modification du contact ${nom}`,
      details: { contact_id: contact.id, nom, champs_modifies: Object.keys(req.body) },
    });
    sendSuccess(res, contact, 'Contact mis à jour');
  } catch (err) { next(err); }
}

export async function deleteContact(req, res, next) {
  try {
    const clientId = parseInt(req.params.id);
    const contact = await clientService.deleteContact(clientId, parseInt(req.params.contactId));
    const nom = `${contact.prenom || ''} ${contact.nom || ''}`.trim();
    await logSurClient(req, clientId, {
      action: 'client_contact_supprime',
      resume: `Suppression du contact ${nom}`,
      details: { contact_id: contact.id, nom, fonction: contact.fonction, email: contact.email },
    });
    sendSuccess(res, null, 'Contact supprimé');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// DOCUMENTS
// ---------------------------------------------------------------------------

export async function listDocuments(req, res, next) {
  try {
    const docs = await clientService.listDocuments(parseInt(req.params.id));
    sendSuccess(res, docs);
  } catch (err) { next(err); }
}

export async function createDocument(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
    }
    const clientId = parseInt(req.params.id);
    const doc = await clientService.createDocument(clientId, {
      nom: req.body.nom || req.file.originalname,
      type: req.body.type || 'AUTRE',
      file: req.file,
    });
    await logSurClient(req, clientId, {
      action: 'client_document_ajoute',
      resume: `Ajout du document « ${doc.nom} »`,
      details: { document_id: doc.id, nom: doc.nom, type: doc.type },
    });
    sendSuccess(res, doc, 'Document ajouté', 201);
  } catch (err) { next(err); }
}

export async function deleteDocument(req, res, next) {
  try {
    const clientId = parseInt(req.params.id);
    const doc = await clientService.deleteDocument(clientId, parseInt(req.params.documentId));
    await logSurClient(req, clientId, {
      action: 'client_document_supprime',
      resume: `Suppression du document « ${doc.nom} »`,
      details: { document_id: doc.id, nom: doc.nom, type: doc.type },
    });
    sendSuccess(res, null, 'Document supprimé');
  } catch (err) { next(err); }
}
