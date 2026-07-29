import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../../config/database.js';
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

