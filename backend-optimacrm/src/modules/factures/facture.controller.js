import { ZipArchive } from 'archiver';
import * as factureService from './facture.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { sendFactureEmail, getRenderedTemplate } from '../email/email.service.js';
import { generateFacturePdf } from './pdf.service.js';

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listFactures(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const { statut, client_id, date_debut, date_fin, type_origine, search } = req.query;

    const result = await factureService.listFactures({
      page, limit, statut, client_id, date_debut, date_fin, type_origine, search,
    });
    sendPaginated(res, result.factures, result.pagination);
  } catch (err) { next(err); }
}

export async function getFacture(req, res, next) {
  try {
    const facture = await factureService.getFactureById(parseInt(req.params.id));
    sendSuccess(res, facture);
  } catch (err) { next(err); }
}

export async function getFacturesStats(req, res, next) {
  try {
    const stats = await factureService.getFacturesStats();
    sendSuccess(res, stats);
  } catch (err) { next(err); }
}

export async function createFacture(req, res, next) {
  try {
    const facture = await factureService.createFacture(req.body, req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'facture_creee', module: 'factures',
        description: `Création de la facture ${facture.numero_facture || ''} pour ${facture.client_raison_sociale || ''}`,
        entityType: 'facture', entityId: facture.id, entityLabel: facture.numero_facture,
        details: { montant_ht: facture.total_ht, client: facture.client_raison_sociale },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, facture, 'Facture créée avec succès', 201);
  } catch (err) { next(err); }
}

export async function updateFacture(req, res, next) {
  try {
    const facture = await factureService.updateFacture(parseInt(req.params.id), req.body, req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'facture_modifiee', module: 'factures',
        description: `Modification de la facture ${facture.numero_facture || ''}`,
        entityType: 'facture', entityId: facture.id, entityLabel: facture.numero_facture,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, facture, 'Facture mise à jour');
  } catch (err) { next(err); }
}

export async function deleteFacture(req, res, next) {
  try {
    const fId = parseInt(req.params.id);
    let fLabel = `#${fId}`;
    try { const f = await factureService.getFactureById(fId); fLabel = f.numero_facture || fLabel; } catch (_) {}
    await factureService.deleteFacture(fId, req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'facture_supprimee', module: 'factures',
        description: `Suppression de la facture ${fLabel}`,
        entityType: 'facture', entityId: fId, entityLabel: fLabel,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, null, 'Facture supprimée');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export async function validerFacture(req, res, next) {
  try {
    const facture = await factureService.validerFacture(parseInt(req.params.id), req.user.id);
    sendSuccess(res, facture, 'Facture validée');
  } catch (err) { next(err); }
}

export async function envoyerFacture(req, res, next) {
  try {
    const facture = await factureService.envoyerFacture(parseInt(req.params.id), req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'facture_envoyee', module: 'factures',
        description: `Facture ${facture.numero_facture || ''} envoyée`,
        entityType: 'facture', entityId: facture.id, entityLabel: facture.numero_facture,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, facture, 'Facture envoyée');
  } catch (err) { next(err); }
}

export async function annulerFacture(req, res, next) {
  try {
    const facture = await factureService.annulerFacture(parseInt(req.params.id), req.user.id);
    sendSuccess(res, facture, 'Facture annulée');
  } catch (err) { next(err); }
}

export async function dupliquerFacture(req, res, next) {
  try {
    const facture = await factureService.dupliquerFacture(parseInt(req.params.id), req.user.id);
    sendSuccess(res, facture, 'Facture dupliquée', 201);
  } catch (err) { next(err); }
}

export async function creerAvoir(req, res, next) {
  try {
    const avoir = await factureService.creerAvoir(parseInt(req.params.id), req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'avoir_cree', module: 'factures',
        description: `Avoir ${avoir.numero_facture || ''} créé sur la facture #${req.params.id}`,
        entityType: 'facture', entityId: avoir.id, entityLabel: avoir.numero_facture,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, avoir, 'Avoir créé', 201);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Règlements
// ---------------------------------------------------------------------------

export async function listReglements(req, res, next) {
  try {
    const reglements = await factureService.listReglements(parseInt(req.params.id));
    sendSuccess(res, reglements);
  } catch (err) { next(err); }
}

export async function ajouterReglement(req, res, next) {
  try {
    const facture = await factureService.ajouterReglement(parseInt(req.params.id), req.body, req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'facture_payee', module: 'factures',
        description: `Paiement de ${req.body.montant || ''} € enregistré sur ${facture.numero_facture || ''}`,
        entityType: 'facture', entityId: facture.id, entityLabel: facture.numero_facture,
        details: { montant: req.body.montant, mode: req.body.mode_paiement },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, facture, 'Paiement enregistré', 201);
  } catch (err) { next(err); }
}

export async function supprimerReglement(req, res, next) {
  try {
    const facture = await factureService.supprimerReglement(
      parseInt(req.params.id), parseInt(req.params.rid), req.user.id
    );
    sendSuccess(res, facture, 'Paiement supprimé');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------

export async function genererDepuisContrat(req, res, next) {
  try {
    const options = {
      periode_debut: req.body.periode_debut || undefined,
      periode_fin: req.body.periode_fin || undefined,
      releve_compteur_nb_id: req.body.releve_compteur_nb_id || undefined,
      releve_compteur_coul_id: req.body.releve_compteur_coul_id || undefined,
    };
    const facture = await factureService.genererDepuisContrat(parseInt(req.params.contratId), req.user.id, options);
    sendSuccess(res, facture, 'Facture générée depuis le contrat', 201);
  } catch (err) { next(err); }
}

export async function genererDepuisDevis(req, res, next) {
  try {
    const facture = await factureService.genererDepuisDevis(parseInt(req.params.devisId), req.user.id);
    sendSuccess(res, facture, 'Facture générée depuis le devis', 201);
  } catch (err) { next(err); }
}

export async function getContratsAFacturer(req, res, next) {
  try {
    const typeFilter = req.query.type || undefined;
    const contrats = await factureService.getContratsAFacturer(typeFilter);
    sendSuccess(res, contrats);
  } catch (err) { next(err); }
}

export async function executerGenerationLot(req, res, next) {
  try {
    const { contrat_ids, periode_debut, periode_fin } = req.body;
    const result = await factureService.executerGenerationLot(contrat_ids, periode_debut, periode_fin, req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'factures_generees', module: 'factures',
        description: `Génération en lot de ${result.generees?.length || 0} facture(s)`,
        details: { nb_generees: result.generees?.length, nb_erreurs: result.erreurs?.length },
        statut: result.erreurs?.length ? 'partiel' : 'succes',
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, result, `${result.generees.length} facture(s) générée(s)`);
  } catch (err) { next(err); }
}

export async function getFactureEmailTemplate(req, res, next) {
  try {
    const facture = await factureService.getFactureById(parseInt(req.params.id));
    const template = await getRenderedTemplate(facture);
    sendSuccess(res, template);
  } catch (err) { next(err); }
}

export async function envoyerFactureEmail(req, res, next) {
  try {
    const facture = await factureService.getFactureById(parseInt(req.params.id));
    if (!['Validée', 'Envoyée'].includes(facture.statut)) {
      return res.status(400).json({ success: false, message: 'La facture doit être validée avant envoi par email' });
    }

    const { destinataire, sujet, corps } = req.body;
    if (!destinataire || !sujet) {
      return res.status(400).json({ success: false, message: 'Destinataire et sujet sont requis' });
    }

    const { pdf } = await generateFacturePdf(facture.id);

    await sendFactureEmail({
      facture,
      pdfBuffer: pdf,
      destinataire,
      sujet,
      corps: corps || '',
    });

    await factureService.envoyerFacture(facture.id, req.user.id);

    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'facture_envoyee_email', module: 'factures',
        description: `Facture ${facture.numero_facture} envoyée par email à ${destinataire}`,
        entityType: 'facture', entityId: facture.id, entityLabel: facture.numero_facture,
        details: { destinataire, sujet },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

    const updated = await factureService.getFactureById(facture.id);
    sendSuccess(res, updated, `Facture envoyée par email à ${destinataire}`);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Actions en masse
// ---------------------------------------------------------------------------

export async function validerLot(req, res, next) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Le champ ids est requis (tableau non vide)' });
    }

    const result = await factureService.validerLot(ids, req.user.id);

    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'factures_validees_lot', module: 'factures',
        description: `Validation en lot : ${result.valides} validée(s), ${result.erreurs.length} erreur(s)`,
        details: { nb_demandees: ids.length, nb_validees: result.valides, nb_erreurs: result.erreurs.length },
        statut: result.erreurs.length ? 'partiel' : 'succes',
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

    sendSuccess(res, result, `${result.valides} facture(s) validée(s)`);
  } catch (err) { next(err); }
}

export async function envoyerLot(req, res, next) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Le champ ids est requis (tableau non vide)' });
    }

    const { sujet, corps } = req.body;
    const result = await factureService.envoyerLot(ids, req.user.id, { sujet, corps });

    try {
      const numeros = [];
      for (const id of ids) {
        try { const f = await factureService.getFactureById(id); numeros.push(f.numero_facture); } catch (_) { numeros.push(`#${id}`); }
      }
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'factures_envoyees_lot', module: 'factures',
        description: `Envoi groupé de factures : ${result.envoyees} envoyée(s), ${result.erreurs.length} erreur(s)`,
        details: {
          nb_demandees: ids.length,
          nb_envoyees: result.envoyees,
          nb_erreurs: result.erreurs.length,
          numeros_factures: numeros,
        },
        statut: result.erreurs.length ? 'partiel' : 'succes',
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

    sendSuccess(res, result, `${result.envoyees} facture(s) envoyée(s) par email`);
  } catch (err) { next(err); }
}

export async function telechargerLot(req, res, next) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Le champ ids est requis (tableau non vide)' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const filename = `factures_${today}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on('error', (err) => { throw err; });
    archive.pipe(res);

    for (const id of ids) {
      try {
        const { pdf, facture } = await generateFacturePdf(id);
        const clientName = (facture.client_raison_sociale || 'CLIENT')
          .replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '')
          .replace(/\s+/g, '-')
          .toUpperCase();
        const pdfName = `${facture.numero_facture}_${clientName}.pdf`;
        archive.append(pdf, { name: pdfName });
      } catch (err) {
        console.error(`[TelechargerLot] Erreur PDF facture #${id}:`, err.message);
      }
    }

    await archive.finalize();

    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'factures_telecharger_lot', module: 'factures',
        description: `Téléchargement groupé de ${ids.length} facture(s) en ZIP`,
        details: { nb_factures: ids.length },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
  } catch (err) { next(err); }
}

export async function detecterRetards(req, res, next) {
  try {
    const count = await factureService.detecterRetards();
    sendSuccess(res, { updated: count }, `${count} facture(s) mise(s) en retard`);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Gestion des lignes
// ---------------------------------------------------------------------------

export async function ajouterLigne(req, res, next) {
  try {
    const facture = await factureService.ajouterLigne(parseInt(req.params.id), req.body, req.user.id);
    try {
      await activityLog.log({
        userId: req.user.id, userNom: activityLog.getUserName(req.user),
        action: 'facture_ligne_ajoutee', module: 'factures',
        description: `Ligne ajoutée sur la facture ${facture.numero_facture || ''}`,
        entityType: 'facture', entityId: facture.id, entityLabel: facture.numero_facture,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, facture, 'Ligne ajoutée', 201);
  } catch (err) { next(err); }
}

export async function modifierLigne(req, res, next) {
  try {
    const facture = await factureService.modifierLigne(
      parseInt(req.params.id), parseInt(req.params.lid), req.body, req.user.id
    );
    sendSuccess(res, facture, 'Ligne modifiée');
  } catch (err) { next(err); }
}

export async function supprimerLigne(req, res, next) {
  try {
    const facture = await factureService.supprimerLigne(
      parseInt(req.params.id), parseInt(req.params.lid), req.user.id
    );
    sendSuccess(res, facture, 'Ligne supprimée');
  } catch (err) { next(err); }
}

export async function recalculerTotaux(req, res, next) {
  try {
    const facture = await factureService.recalculerTotaux(parseInt(req.params.id));
    sendSuccess(res, facture, 'Totaux recalculés');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Relevés
// ---------------------------------------------------------------------------

export async function getRelevesDisponibles(req, res, next) {
  try {
    const releves = await factureService.getRelevesDisponibles(parseInt(req.params.contratId));
    sendSuccess(res, releves);
  } catch (err) { next(err); }
}

export async function listRelevesCompteurs(req, res, next) {
  try {
    const releves = await factureService.listRelevesCompteurs();
    sendSuccess(res, releves);
  } catch (err) { next(err); }
}
