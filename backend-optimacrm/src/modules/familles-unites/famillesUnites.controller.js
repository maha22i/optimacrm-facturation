import * as service from './famillesUnites.service.js';
import { sendSuccess } from '../../utils/response.js';

// ── Familles ─────────────────────────────────────────────────────────────────

export async function listFamilles(req, res, next) {
  try {
    const { actif } = req.query;
    const familles = await service.listFamilles({ actif });
    sendSuccess(res, familles);
  } catch (err) { next(err); }
}

export async function createFamille(req, res, next) {
  try {
    const famille = await service.createFamille(req.body);
    sendSuccess(res, famille, 'Famille créée', 201);
  } catch (err) { next(err); }
}

export async function updateFamille(req, res, next) {
  try {
    const famille = await service.updateFamille(parseInt(req.params.id), req.body);
    sendSuccess(res, famille, 'Famille mise à jour');
  } catch (err) { next(err); }
}

export async function deleteFamille(req, res, next) {
  try {
    await service.deleteFamille(parseInt(req.params.id));
    sendSuccess(res, null, 'Famille supprimée');
  } catch (err) { next(err); }
}

// ── Unités ───────────────────────────────────────────────────────────────────

export async function listUnites(req, res, next) {
  try {
    const unites = await service.listUnites();
    sendSuccess(res, unites);
  } catch (err) { next(err); }
}

export async function createUnite(req, res, next) {
  try {
    const unite = await service.createUnite(req.body);
    sendSuccess(res, unite, 'Unité créée', 201);
  } catch (err) { next(err); }
}

export async function deleteUnite(req, res, next) {
  try {
    await service.deleteUnite(parseInt(req.params.id));
    sendSuccess(res, null, 'Unité supprimée');
  } catch (err) { next(err); }
}
