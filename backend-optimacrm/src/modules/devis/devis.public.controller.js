import crypto from 'crypto';
import * as devisService from './devis.service.js';
import { generateDevisPdf, lignesPourPdf } from './pdf.service.js';
import { sendDevisVerificationEmail, sendDevisSignatureConfirmationEmail } from '../email/email.service.js';
import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/response.js';
import { toDateStr } from '../../utils/dateUtils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function getClientIp(req) {
  // Derrière Render/proxy : l'IP réelle est le premier élément de X-Forwarded-For
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || null;
}

function masquerEmail(email) {
  if (!email || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

/**
 * Charge le devis par token et applique les règles d'accès communes.
 * `strict` = true pour les actions (seul ENVOYE est accepté).
 */
async function loadDevisPourAction(token, { strict = true } = {}) {
  const devis = await devisService.getDevisByTokenPublic(token);
  if (!devis) throw ApiError.notFound('Devis non trouvé');

  // Validité dépassée → passage automatique en EXPIRE
  const validite = toDateStr(devis.date_validite);
  if (devis.statut === 'ENVOYE' && validite && validite < todayUTC()) {
    await devisService.marquerDevisExpire(devis.id);
    devis.statut = 'EXPIRE';
  }

  if (devis.statut === 'EXPIRE') {
    const err = new ApiError(410, 'Ce devis a expiré');
    err.devis = devis;
    throw err;
  }

  if (strict && devis.statut !== 'ENVOYE') {
    const err = new ApiError(409, devis.statut === 'ACCEPTE' || devis.statut === 'FACTURE'
      ? 'Ce devis a déjà été signé'
      : 'Ce devis n\'est plus disponible à la signature');
    err.devis = devis;
    throw err;
  }

  return devis;
}

function getEmailDestinataire(devis, contact) {
  return devis.signataire_email || contact?.email || devis.client_email_principal || null;
}

// ---------------------------------------------------------------------------
// GET /api/public/devis/:token
// ---------------------------------------------------------------------------

export async function getDevisPublic(req, res, next) {
  try {
    const devis = await devisService.getDevisByTokenPublic(req.params.token);
    if (!devis) throw ApiError.notFound('Devis non trouvé');

    // Le token n'est censé exister qu'après envoi ; un brouillon reste invisible
    if (devis.statut === 'BROUILLON') throw ApiError.notFound('Devis non trouvé');

    const validite = toDateStr(devis.date_validite);
    if (devis.statut === 'ENVOYE' && validite && validite < todayUTC()) {
      await devisService.marquerDevisExpire(devis.id);
      devis.statut = 'EXPIRE';
    }

    if (devis.statut === 'EXPIRE') {
      return res.status(410).json({
        success: false,
        message: 'Ce devis a expiré',
        data: {
          statut: 'EXPIRE',
          numero: devis.numero_devis,
          date_validite: toDateStr(devis.date_validite),
        },
      });
    }

    if (devis.statut === 'REFUSE') {
      return res.status(409).json({
        success: false,
        message: 'Ce devis n\'est plus disponible à la signature',
        data: { statut: 'REFUSE', numero: devis.numero_devis },
      });
    }

    const [lignesBrutes, societeRes] = await Promise.all([
      devisService.getLignesDevis(devis.id),
      query('SELECT raison_sociale, logo_url, adresse_ligne1, adresse_ligne2, code_postal, ville, telephone, email_contact, site_web FROM societe_config WHERE id = 1'),
    ]);

    // Devis importés Excel sans lignes : même ligne de synthèse que le PDF
    const lignes = lignesPourPdf({ ...devis, lignes: lignesBrutes });
    const societe = societeRes.rows[0] || {};

    // Données publiques uniquement — jamais de notes internes ni de marges
    sendSuccess(res, {
      numero: devis.numero_devis,
      statut: devis.statut,
      objet: devis.objet,
      client: {
        raison_sociale: devis.client_raison_sociale || devis.nom_client_libre || '',
      },
      societe,
      date_emission: toDateStr(devis.date_emission),
      date_validite: toDateStr(devis.date_validite),
      lignes: lignes.map((l, idx) => ({
        id: l.id ?? idx,
        ordre: l.ordre,
        type: l.type,
        reference: l.reference,
        designation: l.designation,
        description_detaillee: l.description_detaillee,
        unite: l.unite,
        quantite: parseFloat(l.quantite),
        prix_unitaire_ht: parseFloat(l.prix_unitaire_ht),
        remise_ligne_type: l.remise_ligne_type,
        remise_ligne_valeur: parseFloat(l.remise_ligne_valeur),
        taux_tva: parseFloat(l.taux_tva),
        montant_ht: parseFloat(l.montant_ht),
        est_optionnel: l.est_optionnel,
      })),
      remise_globale_type: devis.remise_globale_type,
      remise_globale_valeur: parseFloat(devis.remise_globale_valeur),
      montant_ht: parseFloat(devis.montant_ht),
      montant_remise: parseFloat(devis.montant_remise),
      montant_ht_apres_remise: parseFloat(devis.montant_ht_apres_remise),
      montant_tva: parseFloat(devis.montant_tva),
      montant_ttc: parseFloat(devis.montant_ttc),
      conditions_generales: devis.conditions_generales,
      message_client: devis.message_client,
      email_verifie: devis.email_verifie === true,
      // Présents uniquement si déjà signé (affichage "signé le ...")
      date_signature: devis.date_signature,
      signataire_nom: devis.statut === 'ACCEPTE' || devis.statut === 'FACTURE' ? devis.signataire_nom : null,
    });
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// POST /api/public/devis/:token/demander-code
// ---------------------------------------------------------------------------

export async function demanderCode(req, res, next) {
  try {
    const devis = await loadDevisPourAction(req.params.token);
    const contact = await devisService.getContactDevis(devis.contact_id);

    const destinataire = getEmailDestinataire(devis, contact);
    if (!destinataire) {
      throw ApiError.badRequest('Aucune adresse email n\'est associée à ce devis. Contactez votre commercial.');
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const expiration = new Date(Date.now() + 15 * 60 * 1000); // 15 min (UTC)

    await devisService.enregistrerCodeVerification(devis.id, code, expiration);

    const signataire = devis.signataire_nom
      || (contact ? [contact.prenom, contact.nom].filter(Boolean).join(' ') : '')
      || devis.client_raison_sociale
      || '';

    await sendDevisVerificationEmail({ devis, destinataire, code, signataire });

    sendSuccess(res, { email_masque: masquerEmail(destinataire) }, 'Code de vérification envoyé');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// POST /api/public/devis/:token/verifier-code
// ---------------------------------------------------------------------------

export async function verifierCode(req, res, next) {
  try {
    const devis = await loadDevisPourAction(req.params.token);

    const code = String(req.body?.code || '').trim();
    if (!/^\d{6}$/.test(code)) {
      throw ApiError.badRequest('Code de vérification invalide');
    }

    const ok = await devisService.validerCodeVerification(devis.id, code);
    if (!ok) {
      throw ApiError.badRequest('Code incorrect ou expiré');
    }

    sendSuccess(res, { email_verifie: true }, 'Email vérifié');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// POST /api/public/devis/:token/signer
// ---------------------------------------------------------------------------

export async function signerDevis(req, res, next) {
  try {
    const devis = await loadDevisPourAction(req.params.token);

    if (devis.email_verifie !== true) {
      throw ApiError.forbidden('L\'adresse email doit être vérifiée avant de signer');
    }

    const signataireNom = String(req.body?.signataire_nom || '').trim();
    const signatureBase64 = String(req.body?.signature_base64 || '');

    if (!signataireNom) throw ApiError.badRequest('Le nom du signataire est requis');
    if (!signatureBase64.startsWith('data:image/')) {
      throw ApiError.badRequest('Signature invalide');
    }

    await devisService.enregistrerSignature(devis.id, {
      signataireNom,
      signatureBase64,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] || null,
    });

    // PDF régénéré avec le bloc signature, puis email de confirmation.
    // La signature est déjà actée : un échec d'email ne doit pas la remettre en cause.
    try {
      const { pdf, devis: devisSigne } = await generateDevisPdf(devis.id);
      const contact = await devisService.getContactDevis(devis.contact_id);
      const destinataire = getEmailDestinataire(devis, contact);
      if (destinataire) {
        await sendDevisSignatureConfirmationEmail({
          devis: devisSigne,
          destinataire,
          pdfBuffer: pdf,
          signataire: signataireNom,
          dateSignature: devisSigne.date_signature,
        });
      }
    } catch (emailErr) {
      console.error('[Signature devis] Erreur envoi confirmation :', emailErr.message);
    }

    sendSuccess(res, { statut: 'ACCEPTE' }, 'Devis signé avec succès');
  } catch (err) { next(err); }
}
