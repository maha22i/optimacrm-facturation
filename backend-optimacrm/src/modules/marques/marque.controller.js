import * as marqueService from './marque.service.js';
import { sendSuccess } from '../../utils/response.js';

export async function list(req, res, next) {
  try {
    const { search, actif } = req.query;
    const marques = await marqueService.list({ search, actif });
    sendSuccess(res, marques);
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const marque = await marqueService.create(req.body);
    sendSuccess(res, marque, 'Marque créée', 201);
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const marque = await marqueService.update(parseInt(req.params.id), req.body);
    sendSuccess(res, marque, 'Marque mise à jour');
  } catch (err) { next(err); }
}

export async function softDelete(req, res, next) {
  try {
    const marque = await marqueService.softDelete(parseInt(req.params.id));
    sendSuccess(res, marque, 'Marque désactivée');
  } catch (err) { next(err); }
}

export async function uploadLogo(req, res, next) {
  try {
    const result = await marqueService.uploadLogo(parseInt(req.params.id), req.file);
    sendSuccess(res, result, 'Logo uploadé');
  } catch (err) { next(err); }
}
