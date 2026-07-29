import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { query, runWithTenantContext } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as service from './clientPortal.service.js';
import { generateFacturePdf } from '../factures/pdf.service.js';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000,
  path: '/',
};

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const result = await query(
      `SELECT u.*, t.statut AS tenant_statut
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1`,
      [email.toLowerCase()],
    );
    if (result.rows.length === 0) throw ApiError.unauthorized('Identifiants invalides');

    const user = result.rows[0];

    if (user.role !== 'client') throw ApiError.unauthorized('Identifiants invalides');
    if (!user.is_active) throw ApiError.forbidden('Compte désactivé');
    if (user.tenant_id && user.tenant_statut === 'suspendu') throw ApiError.forbidden('Compte suspendu');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw ApiError.unauthorized('Identifiants invalides');

    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    });

    res.cookie('token', token, COOKIE_OPTIONS);
    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        client_id: user.client_id,
      },
    }, 'Connexion réussie');
  } catch (err) { next(err); }
}

export async function logout(_req, res) {
  res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
  sendSuccess(res, null, 'Déconnecté');
}

export async function getProfile(req, res, next) {
  try {
    const { rows: [user] } = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.client_id,
              c.raison_sociale AS client_raison_sociale, c.numero_client AS client_code
       FROM users u
       LEFT JOIN clients c ON c.id = u.client_id
       WHERE u.id = $1`,
      [req.user.id],
    );
    if (!user) throw ApiError.notFound('Utilisateur introuvable');
    sendSuccess(res, user);
  } catch (err) { next(err); }
}

export async function changePassword(req, res, next) {
  try {
    const { old_password, new_password } = req.body;
    const { rows: [user] } = await query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (!user) throw ApiError.notFound('Utilisateur introuvable');

    const valid = await bcrypt.compare(old_password, user.password);
    if (!valid) throw ApiError.unauthorized('Mot de passe actuel incorrect');

    const hashed = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hashed, req.user.id]);
    sendSuccess(res, null, 'Mot de passe modifié');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Mot de passe oublié (self-service, public)
// ---------------------------------------------------------------------------
//
// Contrairement au flow admin interne (JWT signé, auto-porteur, jamais
// stocké → non révocable avant expiration), ce flow public génère un token
// aléatoire (256 bits) dont seul le hash SHA-256 est persisté en base. Cela
// permet un usage unique réel (la ligne est effacée après consommation) et
// limite l'impact d'une fuite de la base (le hash seul ne permet pas de
// rejouer le lien).
//
// Deux règles de sécurité structurent tout le code ci-dessous :
//   1. Réponse strictement identique (même message, même statut HTTP) que
//      l'email corresponde ou non à un compte client — sans quoi l'endpoint
//      deviendrait un oracle d'énumération de comptes.
//   2. Résolution du tenant AVANT tout accès à la config SMTP : email_config
//      est une table multi-tenant protégée par RLS. Sans poser explicitement
//      le contexte tenant (runWithTenantContext), une requête pré-auth (sans
//      cookie, donc sans tenantMiddleware) verrait la policy RLS s'appliquer
//      en mode « échappement » (aucun contexte posé) et pourrait remonter la
//      configuration SMTP d'un tenant arbitraire — pas nécessairement celui
//      de l'utilisateur concerné.

const RESET_TOKEN_BYTES = 32; // 256 bits — bruteforce computationnellement infaisable
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h (plus court que le flow admin interne, volontairement)
const GENERIC_FORGOT_MESSAGE = 'Si un compte existe avec cette adresse email, un lien de réinitialisation vient de lui être envoyé.';

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export async function forgotPassword(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    const { rows: [user] } = await query(
      `SELECT u.id, u.tenant_id, u.email, u.first_name, u.is_active, t.statut AS tenant_statut
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.email = $1 AND u.role = 'client'`,
      [email],
    );

    // Compte inexistant, désactivé, ou tenant suspendu : même réponse
    // générique, aucun email envoyé — mais on ne le dit jamais au client.
    if (!user || !user.is_active || user.tenant_statut === 'suspendu') {
      return sendSuccess(res, null, GENERIC_FORGOT_MESSAGE);
    }

    const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    // Écriture du token isolée de l'envoi d'email : si le SMTP échoue
    // (identifiants invalides, timeout réseau...), le token doit rester
    // valide en base plutôt que d'être perdu par un rollback de transaction
    // partagée. Le user pourra toujours consommer le lien si l'email a
    // malgré tout été délivré par le serveur SMTP distant avant l'échec.
    await query(
      `UPDATE users
       SET password_reset_token_hash = $1, password_reset_expires_at = $2
       WHERE id = $3`,
      [tokenHash, expiresAt, user.id],
    );

    try {
      await runWithTenantContext(user.tenant_id, async () => {
        const { getEmailConfigRaw, createTransporter, logEmail, escapeHtml } = await import('../email/email.service.js');
        const config = await getEmailConfigRaw();
        if (!config || !config.est_configure) {
          // Problème de configuration côté société, jamais exposé au client
          // (voir règle de sécurité n°1 ci-dessus) — uniquement journalisé.
          console.error(`[ForgotPassword] SMTP non configuré (tenant ${user.tenant_id})`);
          return;
        }

        const portalUrl = process.env.CLIENT_PORTAL_URL || 'http://localhost:3002';
        const resetLink = `${portalUrl}/reset-password?token=${rawToken}`;
        const fromName = config.smtp_from_name || 'OptimaCRM';
        const fromEmail = config.smtp_from_email || config.smtp_user;
        const transporter = createTransporter(config);

        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: user.email,
          replyTo: config.reply_to_email || fromEmail,
          subject: 'Réinitialisation de votre mot de passe',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:#4F46E5;padding:16px 20px;border-radius:8px 8px 0 0;text-align:center;">
                <h1 style="color:white;margin:0;font-size:18px;">${escapeHtml(fromName)}</h1>
              </div>
              <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;">
                <div style="color:#1a1a2e;font-size:14px;line-height:1.6;">
                  <p>Bonjour ${escapeHtml(user.first_name)},</p>
                  <p>Vous avez demandé la réinitialisation du mot de passe de votre espace client.</p>
                  <div style="text-align:center;margin:24px 0;">
                    <a href="${resetLink}" style="display:inline-block;background:#4F46E5;color:white;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">Réinitialiser mon mot de passe</a>
                  </div>
                  <p style="color:#6b7280;font-size:13px;">Ce lien est valable 1 heure et à usage unique. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email : votre mot de passe restera inchangé.</p>
                  <p style="color:#9ca3af;font-size:12px;word-break:break-all;margin-top:16px;">Lien direct : ${resetLink}</p>
                </div>
              </div>
              <div style="text-align:center;padding:12px;color:#9ca3af;font-size:11px;">Envoyé via ${escapeHtml(fromName)}</div>
            </div>
          `,
        });

        // Pas de document_id ici : la colonne est INTEGER (pensée pour les
        // factures/devis) alors que users.id est un UUID — le passer
        // provoquerait une erreur SQL qui ferait échouer (et donc annuler,
        // même transaction) l'écriture du token juste au-dessus.
        await logEmail({
          type_document: 'reset_password_client',
          destinataire: user.email,
          sujet: 'Réinitialisation de mot de passe (portail client)',
          statut: 'envoyé',
        });
      });
    } catch (mailErr) {
      // Un échec d'envoi (SMTP down, etc.) ne doit jamais transparaître dans
      // la réponse HTTP — sans quoi elle deviendrait distinguable du cas
      // « email inconnu » et réintroduirait l'énumération de comptes.
      console.error('[ForgotPassword] Échec de l\'envoi de l\'email :', mailErr.message);
    }

    sendSuccess(res, null, GENERIC_FORGOT_MESSAGE);
  } catch (err) { next(err); }
}

export async function resetPassword(req, res, next) {
  try {
    const { token, new_password } = req.body;
    const tokenHash = hashResetToken(String(token));

    const { rows: [user] } = await query(
      `SELECT u.id, u.tenant_id, u.is_active, t.statut AS tenant_statut
       FROM users u
       LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.password_reset_token_hash = $1
         AND u.role = 'client'
         AND u.password_reset_expires_at > NOW()`,
      [tokenHash],
    );

    if (!user || !user.is_active || user.tenant_statut === 'suspendu') {
      throw ApiError.badRequest('Ce lien de réinitialisation est invalide ou a expiré. Veuillez refaire une demande.');
    }

    const hashedPassword = await bcrypt.hash(new_password, 12);

    // Usage unique : le token est invalidé dans la même écriture que le
    // changement de mot de passe, qu'il soit ou non consommé avec succès
    // par la suite (impossible de le rejouer, même en cas de replay rapide).
    await runWithTenantContext(user.tenant_id, async () => {
      await query(
        `UPDATE users
         SET password = $1, password_reset_token_hash = NULL, password_reset_expires_at = NULL, updated_at = NOW()
         WHERE id = $2`,
        [hashedPassword, user.id],
      );
    });

    sendSuccess(res, null, 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

export async function getBranding(req, res, next) {
  try {
    const branding = await service.getBranding();
    sendSuccess(res, branding);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Types de contrats
// ---------------------------------------------------------------------------

export async function getContractTypes(req, res, next) {
  try {
    const types = await service.getContractTypes(req.clientId);
    sendSuccess(res, types);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getDashboard(req, res, next) {
  try {
    const data = await service.getDashboard(req.clientId);
    sendSuccess(res, data);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Factures
// ---------------------------------------------------------------------------

export async function listFactures(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { factures, pagination } = await service.listFactures(req.clientId, {
      page, limit,
      statut: req.query.statut,
      date_debut: req.query.date_debut,
      date_fin: req.query.date_fin,
      search: req.query.search,
    });
    sendPaginated(res, factures, pagination);
  } catch (err) { next(err); }
}

export async function getFacture(req, res, next) {
  try {
    const facture = await service.getFacture(req.clientId, parseInt(req.params.id));
    sendSuccess(res, facture);
  } catch (err) { next(err); }
}

export async function getFacturePdf(req, res, next) {
  try {
    // Vérifier que la facture appartient bien au client
    await service.getFacture(req.clientId, parseInt(req.params.id));

    const { pdf, facture } = await generateFacturePdf(parseInt(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${facture.numero_facture}.pdf"`);
    res.send(pdf);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export async function listTickets(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { tickets, pagination } = await service.listTickets(req.clientId, {
      page, limit,
      statut: req.query.statut,
      search: req.query.search,
    });
    sendPaginated(res, tickets, pagination);
  } catch (err) { next(err); }
}

export async function getTicket(req, res, next) {
  try {
    const ticket = await service.getTicket(req.clientId, parseInt(req.params.id));
    sendSuccess(res, ticket);
  } catch (err) { next(err); }
}

export async function createTicket(req, res, next) {
  try {
    const userNom = `${req.user.first_name} ${req.user.last_name}`.trim();
    const ticket = await service.createTicket(req.clientId, req.user.id, userNom, req.body);
    sendSuccess(res, ticket, 'Ticket créé', 201);
  } catch (err) { next(err); }
}

export async function addTicketComment(req, res, next) {
  try {
    const userNom = `${req.user.first_name} ${req.user.last_name}`.trim();
    const comment = await service.addTicketComment(
      req.clientId, parseInt(req.params.id), req.user.id, userNom, req.body.contenu,
    );
    sendSuccess(res, comment, 'Commentaire ajouté', 201);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Parc machines
// ---------------------------------------------------------------------------

export async function listMachines(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { machines, pagination } = await service.listMachines(req.clientId, {
      page, limit,
      search: req.query.search,
      categorie: req.query.categorie,
    });
    sendPaginated(res, machines, pagination);
  } catch (err) { next(err); }
}

export async function getMachine(req, res, next) {
  try {
    const machine = await service.getMachine(req.clientId, parseInt(req.params.id));
    sendSuccess(res, machine);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// Contrats
// ---------------------------------------------------------------------------

export async function listContrats(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const { contrats, pagination } = await service.listContrats(req.clientId, {
      page, limit,
      type_contrat: req.query.type_contrat,
      statut: req.query.statut,
    });
    sendPaginated(res, contrats, pagination);
  } catch (err) { next(err); }
}

export async function getContrat(req, res, next) {
  try {
    const contrat = await service.getContrat(req.clientId, parseInt(req.params.id));
    sendSuccess(res, contrat);
  } catch (err) { next(err); }
}

