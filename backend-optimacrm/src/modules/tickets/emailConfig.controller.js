import * as emailConfigService from './emailConfig.service.js';
import { fetchAndCreateTickets, testImapConnection } from './services/emailIngestService.js';
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
    sendSuccess(res, config, 'Configuration email enregistrée');
  } catch (err) { next(err); }
}

export async function testEmailConnection(req, res, next) {
  try {
    const { imap_host, imap_port, imap_user, imap_password, imap_tls, folder } = req.body || {};
    const result = await testImapConnection({
      imap_host, imap_port, imap_user, imap_password, imap_tls, folder,
    });
    sendSuccess(res, result, result.message);
  } catch (err) { next(err); }
}

export async function syncEmails(req, res, next) {
  try {
    const stats = await fetchAndCreateTickets();
    sendSuccess(
      res,
      stats,
      `Synchronisation terminée : ${stats.created} ticket(s) créé(s)${stats.skipped ? `, ${stats.skipped} mail(s) déjà traité(s)` : ''}${stats.errors ? `, ${stats.errors} erreur(s)` : ''}`,
    );
  } catch (err) { next(err); }
}
