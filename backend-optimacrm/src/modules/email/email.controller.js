import * as emailService from './email.service.js';
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
    sendSuccess(res, config, 'Configuration email mise à jour');
  } catch (err) { next(err); }
}

export async function verifySmtp(req, res, next) {
  try {
    const result = await emailService.verifySmtpConnection();
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
