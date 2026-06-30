import * as planningService from './planning.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';
import { notifyTicketAssigned } from '../tickets/ticketNotification.service.js';
import { sendSuccess } from '../../utils/response.js';

export async function listCreneaux(req, res, next) {
  try {
    const { technicien_id, date_debut, date_fin } = req.query;
    const creneaux = await planningService.listCreneaux({
      technicien_id,
      date_debut,
      date_fin,
      currentUser: req.user,
    });
    sendSuccess(res, creneaux);
  } catch (err) { next(err); }
}

export async function listTicketsDisponibles(req, res, next) {
  try {
    const tickets = await planningService.listTicketsDisponibles(req.user);
    sendSuccess(res, tickets);
  } catch (err) { next(err); }
}

export async function createCreneau(req, res, next) {
  try {
    const { creneau, autoAssigne, ticket } = await planningService.createCreneau(req.body, req.user);

    try {
      await activityLog.log({
        userId: req.user.id,
        userNom: activityLog.getUserName(req.user),
        action: 'planification',
        module: 'tickets',
        description: `Ticket ${creneau.ticket_numero} planifié pour ${creneau.technicien_prenom || ''} ${creneau.technicien_nom_famille || ''}`.trim(),
        entityType: 'ticket',
        entityId: creneau.ticket_id,
        entityLabel: creneau.ticket_numero,
        details: {
          creneau_id: creneau.id,
          technicien_id: creneau.technicien_id,
          date_debut: creneau.date_debut,
          date_fin: creneau.date_fin,
          auto_assigne: autoAssigne,
        },
        ipAddress: activityLog.getClientIp(req),
      });
    } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

    // Assignation via le planning → même notification qu'une assignation
    // normale (sauf si le technicien s'est auto-assigné lui-même).
    try {
      if (autoAssigne && creneau.technicien_id !== req.user.id) {
        await notifyTicketAssigned(ticket, creneau.technicien_id);
      }
    } catch (err) { console.error('[TicketNotif]', err.message); }

    sendSuccess(res, creneau, 'Créneau créé', 201);
  } catch (err) { next(err); }
}

export async function updateCreneau(req, res, next) {
  try {
    const creneau = await planningService.updateCreneau(req.params.id, req.body, req.user);
    sendSuccess(res, creneau, 'Créneau mis à jour');
  } catch (err) { next(err); }
}

export async function deleteCreneau(req, res, next) {
  try {
    const creneau = await planningService.deleteCreneau(req.params.id, req.user);
    sendSuccess(res, creneau, 'Créneau retiré du planning');
  } catch (err) { next(err); }
}
