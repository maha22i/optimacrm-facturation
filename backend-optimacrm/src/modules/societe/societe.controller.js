import * as societeService from './societe.service.js';
import { sendSuccess } from '../../utils/response.js';

export async function getConfig(req, res, next) {
  try {
    const config = await societeService.getConfig();
    sendSuccess(res, config);
  } catch (err) { next(err); }
}

export async function updateConfig(req, res, next) {
  try {
    const config = await societeService.updateConfig(req.body, req.user.id);
    sendSuccess(res, config, 'Configuration société mise à jour');
  } catch (err) { next(err); }
}

export async function uploadLogo(req, res, next) {
  try {
    const result = await societeService.uploadLogo(req.file);
    sendSuccess(res, result, 'Logo uploadé avec succès');
  } catch (err) { next(err); }
}

export async function deleteLogo(req, res, next) {
  try {
    await societeService.deleteLogo();
    sendSuccess(res, null, 'Logo supprimé');
  } catch (err) { next(err); }
}
