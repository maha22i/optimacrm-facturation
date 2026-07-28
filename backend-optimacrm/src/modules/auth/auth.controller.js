import * as authService from './auth.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { ApiError } from '../../utils/ApiError.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000,
  path: '/',
};

function setTokenCookie(res, token) {
  res.cookie('token', token, COOKIE_OPTIONS);
}

export async function register(req, res, next) {
  try {
    const result = await authService.register(req.body);
    setTokenCookie(res, result.token);
    sendSuccess(res, { user: result.user }, 'Registration successful', 201);
  } catch (err) { next(err); }
}

export async function login(req, res, next) {
  try {
    const result = await authService.login(req.body.email, req.body.password);
    setTokenCookie(res, result.token);
    try {
      const nom = `${result.user?.first_name || ''} ${result.user?.last_name || ''}`.trim();
      await activityLog.log({
        userId: result.user?.id,
        userNom: nom,
        action: 'connexion',
        module: 'parametres',
        description: `Connexion de ${nom}`,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, { user: result.user }, 'Login successful');
  } catch (err) { next(err); }
}

export async function logout(_req, res) {
  res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
  sendSuccess(res, null, 'Logged out');
}

export async function getProfile(req, res, next) {
  try {
    const user = await authService.getProfile(req.user.id);
    sendSuccess(res, user);
  } catch (err) { next(err); }
}

export async function updateProfile(req, res, next) {
  try {
    const user = await authService.updateProfile(req.user.id, req.body);
    sendSuccess(res, user, 'Profile updated');
  } catch (err) { next(err); }
}

export async function changePassword(req, res, next) {
  try {
    await authService.changePassword(req.user.id, req.body.old_password, req.body.new_password);
    sendSuccess(res, null, 'Password changed successfully');
  } catch (err) { next(err); }
}

export async function createUser(req, res, next) {
  try {
    // admin_technique ne peut créer que des techniciens
    if (req.user.role === 'admin_technique' && req.body.role !== 'technicien') {
      return next(ApiError.forbidden('Vous ne pouvez créer que des comptes technicien'));
    }

    // Le nouvel utilisateur est rattaché au tenant de l'admin qui le crée.
    // Un super_admin (tenant_id NULL) n'a pas de tenant "par défaut" : il
    // doit le préciser explicitement dans le body. On affinera ça avec le
    // portail super-admin (sélection de tenant dédiée) ; pour l'instant,
    // erreur claire si rien n'est fourni.
    //
    // Le spread `{ ...req.body, tenant_id }` écrase volontairement un
    // éventuel tenant_id fourni par un admin normal dans le body : on force
    // toujours son propre tenant, pour empêcher qu'un admin crée un compte
    // dans un autre tenant en le passant simplement dans la requête.
    let tenant_id = req.user.tenant_id;
    if (!tenant_id) {
      if (!req.body.tenant_id) {
        return next(ApiError.badRequest('Un super_admin doit spécifier le tenant cible (tenant_id) pour créer un utilisateur'));
      }
      tenant_id = req.body.tenant_id;
    }

    const user = await authService.createUser({ ...req.body, tenant_id });
    try {
      await activityLog.log({
        userId: req.user?.id, userNom: activityLog.getUserName(req.user),
        action: 'utilisateur_cree', module: 'utilisateurs',
        description: `Création de l'utilisateur ${user.first_name} ${user.last_name} (rôle : ${user.role})`,
        entityType: 'utilisateur', entityId: user.id, entityLabel: `${user.first_name} ${user.last_name}`,
        details: { role: user.role, email: user.email },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, user, 'User created', 201);
  } catch (err) { next(err); }
}

export async function getAllUsers(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    
    // admin_technique ne voit que les techniciens
    const roleFilter = req.user.role === 'admin_technique' ? 'technicien' : null;
    
    const { users, pagination } = await authService.getAllUsers(page, limit, roleFilter);
    sendPaginated(res, users, pagination);
  } catch (err) { next(err); }
}

export async function getUserById(req, res, next) {
  try {
    const user = await authService.getUserById(req.params.id);
    sendSuccess(res, user);
  } catch (err) { next(err); }
}

export async function updateUser(req, res, next) {
  try {
    // admin_technique ne peut modifier que des techniciens
    if (req.user.role === 'admin_technique') {
      const targetUser = await authService.getUserById(req.params.id);
      if (targetUser.role !== 'technicien') {
        return next(ApiError.forbidden('Vous ne pouvez modifier que des comptes technicien'));
      }
      // Empêcher de changer le rôle vers autre chose que technicien
      if (req.body.role && req.body.role !== 'technicien') {
        return next(ApiError.forbidden('Vous ne pouvez pas changer le rôle'));
      }
    }
    
    const user = await authService.updateUser(req.params.id, req.body);
    try {
      await activityLog.log({
        userId: req.user?.id, userNom: activityLog.getUserName(req.user),
        action: 'utilisateur_modifie', module: 'utilisateurs',
        description: `Modification de l'utilisateur ${user.first_name} ${user.last_name}`,
        entityType: 'utilisateur', entityId: user.id, entityLabel: `${user.first_name} ${user.last_name}`,
        details: { champs_modifies: Object.keys(req.body) },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }
    sendSuccess(res, user, 'User updated');
  } catch (err) { next(err); }
}

export async function deleteUser(req, res, next) {
  try {
    await authService.deleteUser(req.params.id);
    sendSuccess(res, null, 'User deleted');
  } catch (err) { next(err); }
}

export async function sendResetPasswordLink(req, res, next) {
  try {
    const { getEmailConfigRaw, createTransporter, logEmail, escapeHtml } = await import('../email/email.service.js');

    const config = await getEmailConfigRaw();
    if (!config || !config.est_configure) {
      throw ApiError.badRequest('Le SMTP n\'est pas configuré. Configurez-le dans Paramètres > Email.');
    }

    const { user: targetUser, token } = await authService.generateResetToken(req.params.id);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    const fromName = config.smtp_from_name || 'OptimaCRM';
    const fromEmail = config.smtp_from_email || config.smtp_user;

    const signature = config.signature || '';
    const signatureHtml = signature
      ? `<br><br><div style="color:#6b7280;font-size:13px;white-space:pre-line;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:12px;">${escapeHtml(signature)}</div>`
      : '';

    const transporter = createTransporter(config);

    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: targetUser.email,
      replyTo: config.reply_to_email || fromEmail,
      subject: 'Réinitialisation de votre mot de passe — OptimaCRM',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#6B46C1;padding:16px 20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;font-size:18px;">${escapeHtml(fromName)}</h1>
          </div>
          <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;">
            <div style="color:#1a1a2e;font-size:14px;line-height:1.6;">
              <p>Bonjour ${escapeHtml(targetUser.first_name)},</p>
              <p>Votre administrateur vous invite à réinitialiser votre mot de passe OptimaCRM.</p>
              <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
              <div style="text-align:center;margin:24px 0;">
                <a href="${resetLink}" style="display:inline-block;background:#6B46C1;color:white;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">Réinitialiser mon mot de passe</a>
              </div>
              <p style="color:#6b7280;font-size:13px;">Ce lien est valable 24 heures. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
              <p style="color:#9ca3af;font-size:12px;word-break:break-all;margin-top:16px;">Lien direct : ${resetLink}</p>
            </div>
            ${signatureHtml}
          </div>
          <div style="text-align:center;padding:12px;color:#9ca3af;font-size:11px;">
            Envoyé via OptimaCRM
          </div>
        </div>
      `,
    });

    await logEmail({
      type_document: 'reset_password',
      document_id: targetUser.id,
      destinataire: targetUser.email,
      sujet: 'Réinitialisation de mot de passe',
      statut: 'envoyé',
    });

    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'reset_password_link',
        module: 'utilisateurs',
        description: `Lien de réinitialisation envoyé à ${targetUser.email}`,
        entityType: 'utilisateur',
        entityId: targetUser.id,
        entityLabel: `${targetUser.first_name} ${targetUser.last_name}`,
        ipAddress: activityLog.getClientIp(req),
      });
    } catch { /* ne pas bloquer */ }

    sendSuccess(res, null, `Lien de réinitialisation envoyé à ${targetUser.email}`);
  } catch (err) { next(err); }
}

export async function resetPasswordWithToken(req, res, next) {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) {
      throw ApiError.badRequest('Token et nouveau mot de passe requis');
    }
    if (new_password.length < 8) {
      throw ApiError.badRequest('Le mot de passe doit contenir au moins 8 caractères');
    }

    const jwt = await import('jsonwebtoken');
    let payload;
    try {
      payload = jwt.default.verify(token, process.env.JWT_SECRET);
    } catch {
      throw ApiError.badRequest('Lien expiré ou invalide. Demandez un nouveau lien à votre administrateur.');
    }

    if (payload.purpose !== 'reset') {
      throw ApiError.badRequest('Token invalide');
    }

    await authService.updateUser(payload.userId, { password: new_password });
    sendSuccess(res, null, 'Mot de passe modifié avec succès');
  } catch (err) { next(err); }
}
