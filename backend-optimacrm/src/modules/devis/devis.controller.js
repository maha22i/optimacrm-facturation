import * as devisService from './devis.service.js';
import { parseDevisFile, executeDevisImport } from './importDevis.service.js';
import { generateDevisPdf } from './pdf.service.js';
import { sendDevisEmail, getRenderedDevisTemplate } from '../email/email.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

// ---------------------------------------------------------------------------
// DEVIS — CRUD
// ---------------------------------------------------------------------------

export async function listDevis(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const { statut, client_id, commercial_id, date_debut, date_fin, search } = req.query;

    const result = await devisService.listDevis({ page, limit, statut, client_id, commercial_id, date_debut, date_fin, search });
    sendPaginated(res, result.devis, result.pagination);
  } catch (err) { next(err); }
}

export async function getDevisStats(req, res, next) {
  try {
    const stats = await devisService.getDevisStats();
    sendSuccess(res, stats);
  } catch (err) { next(err); }
}

export async function getDevis(req, res, next) {
  try {
    const devis = await devisService.getDevisById(parseInt(req.params.id));
    sendSuccess(res, devis);
  } catch (err) { next(err); }
}

export async function createDevis(req, res, next) {
  try {
    const devis = await devisService.createDevis(req.body, req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id,
        userNom: activityLog.getUserName(req.user),
        action: 'devis_cree',
        module: 'devis',
        description: `Création du devis ${devis.numero_devis || ''} pour ${devis.client_raison_sociale || ''}`,
        entityType: 'devis',
        entityId: devis.id,
        entityLabel: devis.numero_devis,
        details: { montant_ht: devis.total_ht, client: devis.client_raison_sociale },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, devis, 'Devis créé avec succès', 201);
  } catch (err) { next(err); }
}

export async function updateDevis(req, res, next) {
  try {
    const devis = await devisService.updateDevis(parseInt(req.params.id), req.body, req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id,
        userNom: activityLog.getUserName(req.user),
        action: 'devis_modifie',
        module: 'devis',
        description: `Modification du devis ${devis.numero_devis || ''}`,
        entityType: 'devis',
        entityId: devis.id,
        entityLabel: devis.numero_devis,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, devis, 'Devis mis à jour');
  } catch (err) { next(err); }
}

export async function deleteDevis(req, res, next) {
  try {
    const devisId = parseInt(req.params.id);
    let devisLabel = `#${devisId}`;
    try { const d = await devisService.getDevisById(devisId); devisLabel = d.numero_devis || devisLabel; } catch (_) {}
    await devisService.deleteDevis(devisId, req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id,
        userNom: activityLog.getUserName(req.user),
        action: 'devis_supprime',
        module: 'devis',
        description: `Suppression du devis ${devisLabel}`,
        entityType: 'devis',
        entityId: devisId,
        entityLabel: devisLabel,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, null, 'Devis supprimé');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// ACTIONS WORKFLOW
// ---------------------------------------------------------------------------

export async function envoyerDevis(req, res, next) {
  try {
    const devis = await devisService.envoyerDevis(parseInt(req.params.id), req.user.id, req.body);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'devis_envoye', module: 'devis',
        description: `Devis ${devis.numero_devis || ''} envoyé`,
        entityType: 'devis', entityId: devis.id, entityLabel: devis.numero_devis,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, devis, 'Devis envoyé');
  } catch (err) { next(err); }
}

export async function getDevisEmailTemplate(req, res, next) {
  try {
    const devisId = parseInt(req.params.id);
    // Le token doit exister pour que {{lien_signature}} pointe vers le vrai lien
    await devisService.ensureTokenPublic(devisId);
    const devis = await devisService.getDevisById(devisId);
    const template = await getRenderedDevisTemplate(devis);
    sendSuccess(res, template);
  } catch (err) { next(err); }
}

export async function envoyerDevisEmail(req, res, next) {
  try {
    const devisId = parseInt(req.params.id);
    await devisService.ensureTokenPublic(devisId);
    const devis = await devisService.getDevisById(devisId);
    if (!['BROUILLON', 'ENVOYE'].includes(devis.statut)) {
      return res.status(400).json({
        success: false,
        message: 'Le devis doit être en brouillon ou envoyé pour un envoi par email',
      });
    }

    const { destinataire, sujet, corps } = req.body;
    if (!destinataire || !sujet) {
      return res.status(400).json({ success: false, message: 'Destinataire et sujet sont requis' });
    }

    // Remplace {{lien_signature}} si le commercial a laissé la variable brute
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const lienSignature = `${frontendUrl}/devis/signer/${devis.token_public}`;
    const sujetFinal = String(sujet).replaceAll('{{lien_signature}}', lienSignature);
    const corpsFinal = String(corps || '').replaceAll('{{lien_signature}}', lienSignature);

    const { pdf } = await generateDevisPdf(devis.id);

    await sendDevisEmail({
      devis,
      pdfBuffer: pdf,
      destinataire,
      sujet: sujetFinal,
      corps: corpsFinal,
      // Bouton de signature ajouté automatiquement (sauf si le commercial a déjà
      // inséré le lien dans le corps via {{lien_signature}})
      lienSignature: corpsFinal.includes(lienSignature) ? null : lienSignature,
    });

    await devisService.envoyerDevis(devis.id, req.user.id, { destinataire });

    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'devis_envoye_email', module: 'devis',
        description: `Devis ${devis.numero_devis || ''} envoyé par email à ${destinataire}`,
        entityType: 'devis', entityId: devis.id, entityLabel: devis.numero_devis,
        details: { destinataire, sujet },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

    const updated = await devisService.getDevisById(devis.id);
    sendSuccess(res, updated, `Devis envoyé par email à ${destinataire}`);
  } catch (err) { next(err); }
}

export async function accepterDevis(req, res, next) {
  try {
    const devis = await devisService.accepterDevis(parseInt(req.params.id), req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'devis_accepte', module: 'devis',
        description: `Devis ${devis.numero_devis || ''} accepté`,
        entityType: 'devis', entityId: devis.id, entityLabel: devis.numero_devis,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, devis, 'Devis accepté');
  } catch (err) { next(err); }
}

export async function refuserDevis(req, res, next) {
  try {
    const devis = await devisService.refuserDevis(parseInt(req.params.id), req.user.id, req.body.motif);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'devis_refuse', module: 'devis',
        description: `Devis ${devis.numero_devis || ''} refusé`,
        entityType: 'devis', entityId: devis.id, entityLabel: devis.numero_devis,
        details: { motif: req.body.motif },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, devis, 'Devis refusé');
  } catch (err) { next(err); }
}

export async function dupliquerDevis(req, res, next) {
  try {
    const devis = await devisService.dupliquerDevis(parseInt(req.params.id), req.user.id);
    sendSuccess(res, devis, 'Devis dupliqué', 201);
  } catch (err) { next(err); }
}

export async function transformerEnFacture(req, res, next) {
  try {
    const result = await devisService.transformerEnFacture(parseInt(req.params.id), req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'devis_transforme', module: 'devis',
        description: `Devis ${result.devis?.numero_devis || ''} transformé en facture ${result.facture?.numero_facture || ''}`,
        entityType: 'devis', entityId: parseInt(req.params.id), entityLabel: result.devis?.numero_devis,
        details: { facture_id: result.facture?.id, numero_facture: result.facture?.numero_facture },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, result, 'Devis transformé en facture');
  } catch (err) { next(err); }
}

export async function transformerEnBC(req, res, next) {
  try {
    const bc = await devisService.transformerEnBonCommande(parseInt(req.params.id), req.user.id);
    sendSuccess(res, bc, 'Bon de commande créé', 201);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// LIGNES
// ---------------------------------------------------------------------------

export async function ajouterLigne(req, res, next) {
  try {
    const ligne = await devisService.ajouterLigne(parseInt(req.params.id), req.body, req.user.id);
    sendSuccess(res, ligne, 'Ligne ajoutée', 201);
  } catch (err) { next(err); }
}

export async function modifierLigne(req, res, next) {
  try {
    const ligne = await devisService.modifierLigne(
      parseInt(req.params.id), parseInt(req.params.ligneId), req.body, req.user.id
    );
    sendSuccess(res, ligne, 'Ligne mise à jour');
  } catch (err) { next(err); }
}

export async function supprimerLigne(req, res, next) {
  try {
    await devisService.supprimerLigne(parseInt(req.params.id), parseInt(req.params.ligneId), req.user.id);
    sendSuccess(res, null, 'Ligne supprimée');
  } catch (err) { next(err); }
}

export async function reorderLignes(req, res, next) {
  try {
    await devisService.reorderLignes(parseInt(req.params.id), req.body.ordre, req.user.id);
    sendSuccess(res, null, 'Lignes réordonnées');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// CHAMPS PERSONNALISÉS
// ---------------------------------------------------------------------------

export async function listChamps(req, res, next) {
  try {
    const champs = await devisService.listChamps(parseInt(req.params.id));
    sendSuccess(res, champs);
  } catch (err) { next(err); }
}

export async function ajouterChamp(req, res, next) {
  try {
    const champ = await devisService.ajouterChamp(parseInt(req.params.id), req.body);
    sendSuccess(res, champ, 'Champ ajouté', 201);
  } catch (err) { next(err); }
}

export async function modifierChamp(req, res, next) {
  try {
    const champ = await devisService.modifierChamp(
      parseInt(req.params.id), parseInt(req.params.champId), req.body
    );
    sendSuccess(res, champ, 'Champ mis à jour');
  } catch (err) { next(err); }
}

export async function supprimerChamp(req, res, next) {
  try {
    await devisService.supprimerChamp(parseInt(req.params.id), parseInt(req.params.champId));
    sendSuccess(res, null, 'Champ supprimé');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// IMPORT XLS
// ---------------------------------------------------------------------------

export async function importParse(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }
    const result = parseDevisFile(req.file.buffer, req.file.originalname);
    sendSuccess(res, result, `${result.totalRows} lignes détectées`);
  } catch (err) { next(err); }
}

export async function importExecute(req, res, next) {
  try {
    const { rows, options } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Aucune donnée à importer' });
    }
    const result = await executeDevisImport(rows, options || {});
    try {
      await activityLog.log({
        userId: req.user.id,
        userNom: activityLog.getUserName(req.user),
        action: 'devis_import',
        module: 'devis',
        description: `Import de devis : ${result.imported} créés, ${result.updated} mis à jour, ${result.errors.length} erreurs`,
        entityType: 'devis',
        details: { imported: result.imported, updated: result.updated, errors: result.errors.length },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, result, `Import terminé : ${result.imported} importés, ${result.updated} mis à jour`);
  } catch (err) { next(err); }
}

export async function ajouterChampDepuisTemplate(req, res, next) {
  try {
    const champ = await devisService.ajouterChampDepuisTemplate(
      parseInt(req.params.id), parseInt(req.params.templateId)
    );
    sendSuccess(res, champ, 'Champ ajouté depuis le template', 201);
  } catch (err) { next(err); }
}
