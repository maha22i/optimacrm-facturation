import * as ticketService from './ticket.service.js';
import { sendSuccess, sendPaginated } from '../../utils/response.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { notifyTicketCreated, notifyTicketAssigned, notifyTicketResolved } from './ticketNotification.service.js';

// ---------------------------------------------------------------------------
// TICKETS
// ---------------------------------------------------------------------------

export async function listTickets(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const {
      statut, priorite, categorie_id, client_id, technicien_id,
      search, source, date_debut, date_fin, sla_depasse, sort_by, sort_order,
    } = req.query;

    const { tickets, pagination } = await ticketService.listTickets({
      page, limit, statut, priorite, categorie_id, client_id, technicien_id,
      search, source, date_debut, date_fin, sla_depasse, sort_by, sort_order,
      currentUser: req.user,
    });
    sendPaginated(res, tickets, pagination);
  } catch (err) { next(err); }
}

export async function getTicket(req, res, next) {
  try {
    const ticket = await ticketService.getTicketById(parseInt(req.params.id), req.user);
    sendSuccess(res, ticket);
  } catch (err) { next(err); }
}

export async function createTicket(req, res, next) {
  try {
    const userId = req.user?.id;
    const userNom = activityLog.getUserName(req.user);

    const ticket = await ticketService.createTicket(req.body, userId, userNom);

    try {
      await activityLog.log({
        userId,
        userNom,
        action: 'creation',
        module: 'tickets',
        description: `Ticket ${ticket.numero} créé — ${req.body.sujet}`,
        entityType: 'ticket',
        entityId: ticket.id,
        entityLabel: ticket.numero,
        details: { sujet: req.body.sujet, priorite: ticket.priorite, client_id: ticket.client_id },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

    try {
      await notifyTicketCreated(ticket);
    } catch (err) { console.error('[TicketNotif]', err.message); }

    sendSuccess(res, ticket, 'Ticket créé avec succès', 201);
  } catch (err) { next(err); }
}

export async function updateTicket(req, res, next) {
  try {
    const ticket = await ticketService.updateTicket(parseInt(req.params.id), req.body);

    try {
      const changedFields = Object.keys(req.body).filter(k => req.body[k] !== undefined);
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'modification',
        module: 'tickets',
        description: `Ticket ${ticket.numero} modifié`,
        entityType: 'ticket',
        entityId: ticket.id,
        entityLabel: ticket.numero,
        details: { champs_modifies: changedFields },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

    sendSuccess(res, ticket, 'Ticket mis à jour');
  } catch (err) { next(err); }
}

export async function deleteTicket(req, res, next) {
  try {
    const ticket = await ticketService.deleteTicket(parseInt(req.params.id));

    try {
      await activityLog.log({
        userId: req.user?.id,
        userNom: activityLog.getUserName(req.user),
        action: 'suppression',
        module: 'tickets',
        description: `Ticket ${ticket.numero} supprimé`,
        entityType: 'ticket',
        entityId: ticket.id,
        entityLabel: ticket.numero,
        details: { sujet: ticket.sujet },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

    sendSuccess(res, ticket, 'Ticket supprimé');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// STATUT & ASSIGNATION
// ---------------------------------------------------------------------------

export async function changeStatut(req, res, next) {
  try {
    const userId = req.user?.id;
    const userNom = activityLog.getUserName(req.user);
    const { statut, motif } = req.body;

    const ticket = await ticketService.changeStatut(
      parseInt(req.params.id), statut, userId, userNom, motif, req.user,
    );

    try {
      await activityLog.log({
        userId,
        userNom,
        action: 'changement_statut',
        module: 'tickets',
        description: `Ticket ${ticket.numero} → ${statut}${motif ? ` (${motif})` : ''}`,
        entityType: 'ticket',
        entityId: ticket.id,
        entityLabel: ticket.numero,
        details: { nouveau_statut: statut, motif },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

    try {
      if (statut === 'resolu') {
        await notifyTicketResolved(ticket, req.user, motif);
      }
    } catch (err) { console.error('[TicketNotif]', err.message); }

    sendSuccess(res, ticket, 'Statut mis à jour');
  } catch (err) { next(err); }
}

export async function assignerTechnicien(req, res, next) {
  try {
    const userId = req.user?.id;
    const userNom = activityLog.getUserName(req.user);
    const { technicien_id } = req.body;

    const ticket = await ticketService.assignerTechnicien(
      parseInt(req.params.id), technicien_id, userId, userNom,
    );

    try {
      await activityLog.log({
        userId,
        userNom,
        action: 'assignation',
        module: 'tickets',
        description: `Ticket ${ticket.numero} assigné au technicien #${technicien_id || 'aucun'}`,
        entityType: 'ticket',
        entityId: ticket.id,
        entityLabel: ticket.numero,
        details: { technicien_id },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

    try {
      if (technicien_id) {
        await notifyTicketAssigned(ticket, technicien_id);
      }
    } catch (err) { console.error('[TicketNotif]', err.message); }

    sendSuccess(res, ticket, 'Technicien assigné');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// COMMENTAIRES
// ---------------------------------------------------------------------------

export async function listCommentaires(req, res, next) {
  try {
    const commentaires = await ticketService.listCommentaires(parseInt(req.params.id));
    sendSuccess(res, commentaires);
  } catch (err) { next(err); }
}

export async function createCommentaire(req, res, next) {
  try {
    const userId = req.user?.id;
    const userNom = activityLog.getUserName(req.user);

    const commentaire = await ticketService.createCommentaire(
      parseInt(req.params.id), req.body, userId, userNom,
    );

    try {
      await activityLog.log({
        userId,
        userNom,
        action: 'commentaire',
        module: 'tickets',
        description: `Commentaire ajouté au ticket #${req.params.id}${req.body.est_interne ? ' (interne)' : ''}`,
        entityType: 'ticket',
        entityId: parseInt(req.params.id),
        entityLabel: `Ticket #${req.params.id}`,
        details: { est_interne: req.body.est_interne || false },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

    sendSuccess(res, commentaire, 'Commentaire ajouté', 201);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// HISTORIQUE
// ---------------------------------------------------------------------------

export async function listHistorique(req, res, next) {
  try {
    const historique = await ticketService.listHistorique(parseInt(req.params.id));
    sendSuccess(res, historique);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// CATÉGORIES
// ---------------------------------------------------------------------------

export async function listCategories(req, res, next) {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const categories = await ticketService.listCategories({ includeInactive });
    sendSuccess(res, categories);
  } catch (err) { next(err); }
}

export async function createCategorie(req, res, next) {
  try {
    const categorie = await ticketService.createCategorie(req.body);
    sendSuccess(res, categorie, 'Catégorie créée', 201);
  } catch (err) { next(err); }
}

export async function updateCategorie(req, res, next) {
  try {
    const categorie = await ticketService.updateCategorie(parseInt(req.params.id), req.body);
    sendSuccess(res, categorie, 'Catégorie mise à jour');
  } catch (err) { next(err); }
}

export async function deleteCategorie(req, res, next) {
  try {
    const categorie = await ticketService.deleteCategorie(parseInt(req.params.id));
    sendSuccess(res, categorie, 'Catégorie désactivée');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// RÈGLES SLA
// ---------------------------------------------------------------------------

export async function listSlaRules(req, res, next) {
  try {
    const rules = await ticketService.listSlaRules();
    sendSuccess(res, rules);
  } catch (err) { next(err); }
}

export async function updateSlaRule(req, res, next) {
  try {
    const rule = await ticketService.updateSlaRule(parseInt(req.params.id), req.body);
    sendSuccess(res, rule, 'Règle SLA mise à jour');
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// STATS
// ---------------------------------------------------------------------------

export async function getStats(req, res, next) {
  try {
    const { date_debut, date_fin } = req.query;
    const stats = await ticketService.getStats(req.user, { date_debut, date_fin });
    sendSuccess(res, stats);
  } catch (err) { next(err); }
}

// ---------------------------------------------------------------------------
// TICKETS PAR CLIENT / MACHINE
// ---------------------------------------------------------------------------

export async function getTicketsByClient(req, res, next) {
  try {
    const tickets = await ticketService.getTicketsByClient(parseInt(req.params.id));
    sendSuccess(res, tickets);
  } catch (err) { next(err); }
}

export async function getTicketsByMachine(req, res, next) {
  try {
    const tickets = await ticketService.getTicketsByMachine(parseInt(req.params.id));
    sendSuccess(res, tickets);
  } catch (err) { next(err); }
}
