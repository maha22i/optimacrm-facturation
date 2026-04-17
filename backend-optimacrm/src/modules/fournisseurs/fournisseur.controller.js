import * as fournisseurService from './fournisseur.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';

export async function list(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { type, search, actif } = req.query;
    const result = await fournisseurService.list({ page, limit, type, search, actif });
    sendPaginated(res, result.fournisseurs, result.pagination);
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    const fournisseur = await fournisseurService.getById(parseInt(req.params.id));
    sendSuccess(res, fournisseur);
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const fournisseur = await fournisseurService.create(req.body);
    sendSuccess(res, fournisseur, 'Fournisseur créé', 201);
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const fournisseur = await fournisseurService.update(parseInt(req.params.id), req.body);
    sendSuccess(res, fournisseur, 'Fournisseur mis à jour');
  } catch (err) { next(err); }
}

export async function softDelete(req, res, next) {
  try {
    const fournisseur = await fournisseurService.softDelete(parseInt(req.params.id));
    sendSuccess(res, fournisseur, 'Fournisseur désactivé');
  } catch (err) { next(err); }
}
