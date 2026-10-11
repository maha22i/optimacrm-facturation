import * as service from './famillesUnites.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { MODULES } from '../../config/activityModules.js';
import { sendSuccess } from '../../utils/response.js';

// Référentiels du catalogue : rangés sous `catalogue`, distingués par entityType.
function logReferentiel(req, entityType, entity, { action, description }) {
  return activityLog.logRequest(req, {
    action,
    module: MODULES.CATALOGUE,
    description,
    entityType,
    entityId: entity?.id ?? null,
    entityLabel: entity?.nom ?? null,
  });
}

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
    await logReferentiel(req, 'famille_produit', famille, {
      action: 'famille_creee',
      description: `Création de la famille de produits ${famille.nom}`,
    });
    sendSuccess(res, famille, 'Famille créée', 201);
  } catch (err) { next(err); }
}

export async function updateFamille(req, res, next) {
  try {
    const famille = await service.updateFamille(parseInt(req.params.id), req.body);
    await logReferentiel(req, 'famille_produit', famille, {
      action: 'famille_modifiee',
      description: `Modification de la famille de produits ${famille.nom}`,
    });
    sendSuccess(res, famille, 'Famille mise à jour');
  } catch (err) { next(err); }
}

export async function deleteFamille(req, res, next) {
  try {
    const famille = await service.deleteFamille(parseInt(req.params.id));
    await logReferentiel(req, 'famille_produit', famille, {
      action: 'famille_supprimee',
      description: `Suppression de la famille de produits ${famille.nom}`,
    });
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
    await logReferentiel(req, 'unite', unite, {
      action: 'unite_creee',
      description: `Création de l'unité ${unite.nom}`,
    });
    sendSuccess(res, unite, 'Unité créée', 201);
  } catch (err) { next(err); }
}

export async function deleteUnite(req, res, next) {
  try {
    const unite = await service.deleteUnite(parseInt(req.params.id));
    await logReferentiel(req, 'unite', unite, {
      action: 'unite_supprimee',
      description: `Suppression de l'unité ${unite.nom}`,
    });
    sendSuccess(res, null, 'Unité supprimée');
  } catch (err) { next(err); }
}
