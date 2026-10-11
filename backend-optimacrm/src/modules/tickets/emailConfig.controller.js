import * as emailConfigService from './emailConfig.service.js';
import { fetchAndCreateTickets, testImapConnection } from './services/emailIngestService.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { MODULES } from '../../config/activityModules.js';
import { sendSuccess } from '../../utils/response.js';

export async function getEmailConfig(req, res, next) {
  try {
    const config = await emailConfigService.getConfigSafe();
    sendSuccess(res, config);
  } catch (err) { next(err); }
}

export async function updateEmailConfig(req, res, next) {
  try {
    const { imap_host, imap_port, imap_user, imap_password, imap_tls, folder, actif } = req.body;
    const config = await emailConfigService.upsertConfig({
      imap_host, imap_port, imap_user, imap_password, imap_tls, folder, actif,
    });
    await activityLog.logRequest(req, {
      action: 'imap_tickets_modifie',
      module: MODULES.TICKETS,
      description: `Modification de la collecte des tickets par email (${imap_user || ''}@${imap_host || ''})`,
      entityType: 'config_email_tickets',
      details: { imap_host, imap_port, imap_user, imap_tls, folder, actif },
    });
    sendSuccess(res, config, 'Configuration email enregistrée');
  } catch (err) { next(err); }
}

export async function testEmailConnection(req, res, next) {
  try {
    const { imap_host, imap_port, imap_user, imap_password, imap_tls, folder } = req.body || {};
    const result = await testImapConnection({
      imap_host, imap_port, imap_user, imap_password, imap_tls, folder,
    });
    await activityLog.logRequest(req, {
      action: 'imap_tickets_teste',
      module: MODULES.TICKETS,
      description: `Test de la connexion IMAP tickets : ${result.message}`,
      entityType: 'config_email_tickets',
      details: { imap_host, imap_port, imap_user, folder },
      statut: result.success === false ? 'echec' : 'succes',
    });
    sendSuccess(res, result, result.message);
  } catch (err) { next(err); }
}

export async function syncEmails(req, res, next) {
  try {
    const stats = await fetchAndCreateTickets();
    await activityLog.logRequest(req, {
      action: 'imap_tickets_synchronise',
      module: MODULES.TICKETS,
      description: `Synchronisation des emails : ${stats.created} ticket(s) créé(s), ${stats.skipped || 0} ignoré(s), ${stats.errors || 0} erreur(s)`,
      entityType: 'config_email_tickets',
      details: stats,
      statut: stats.errors ? 'partiel' : 'succes',
    });
    sendSuccess(
      res,
      stats,
      `Synchronisation terminée : ${stats.created} ticket(s) créé(s)${stats.skipped ? `, ${stats.skipped} mail(s) déjà traité(s)` : ''}${stats.errors ? `, ${stats.errors} erreur(s)` : ''}`,
    );
  } catch (err) { next(err); }
}
