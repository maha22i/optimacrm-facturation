import * as emailService from './email.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { MODULES } from '../../config/activityModules.js';
import { sendSuccess } from '../../utils/response.js';

export async function getConfig(req, res, next) {
  try {
    const config = await emailService.getEmailConfig();
    sendSuccess(res, config);
  } catch (err) { next(err); }
}

export async function updateConfig(req, res, next) {
  try {
    const config = await emailService.updateEmailConfig(req.body);
    // Rediriger le SMTP détourne tous les envois sortants : l'hôte et le
    // compte utilisés sont tracés, jamais le mot de passe.
    await activityLog.logRequest(req, {
      action: 'smtp_modifie',
      module: MODULES.PARAMETRES,
      description: `Modification de la configuration SMTP (${req.body?.smtp_host || config?.smtp_host || 'hôte inchangé'})`,
      entityType: 'configuration_email',
      details: {
        champs_modifies: Object.keys(req.body || {}).filter(k => !/pass/i.test(k)),
        smtp_host: req.body?.smtp_host ?? null,
        smtp_user: req.body?.smtp_user ?? null,
      },
    });
    sendSuccess(res, config, 'Configuration email mise à jour');
  } catch (err) { next(err); }
}

export async function verifySmtp(req, res, next) {
  try {
    const result = await emailService.verifySmtpConnection();
    await activityLog.logRequest(req, {
      action: 'smtp_verifie',
      module: MODULES.PARAMETRES,
      description: `Test de connexion SMTP : ${result?.message || 'terminé'}`,
      entityType: 'configuration_email',
      statut: result?.success === false ? 'echec' : 'succes',
    });
    sendSuccess(res, result, result.message);
  } catch (err) { next(err); }
}

export async function sendTest(req, res, next) {
  try {
    const { destinataire } = req.body;
    if (!destinataire) {
      return res.status(400).json({ success: false, message: 'Adresse email destinataire requise' });
    }
    const result = await emailService.sendTestEmail(destinataire);
    await activityLog.logRequest(req, {
      action: 'smtp_email_test',
      module: MODULES.PARAMETRES,
      description: `Envoi d'un email de test à ${destinataire}`,
      entityType: 'configuration_email',
      details: { destinataire },
      statut: result?.success === false ? 'echec' : 'succes',
    });
    sendSuccess(res, result, result.message);
  } catch (err) { next(err); }
}

export async function getLogs(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const result = await emailService.getEmailLogs({ page, limit, ...req.query });
    sendSuccess(res, result);
  } catch (err) { next(err); }
}
