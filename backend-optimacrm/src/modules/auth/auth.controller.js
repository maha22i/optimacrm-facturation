import * as authService from './auth.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

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
    const user = await authService.createUser(req.body);
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
    const { users, pagination } = await authService.getAllUsers(page, limit);
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
