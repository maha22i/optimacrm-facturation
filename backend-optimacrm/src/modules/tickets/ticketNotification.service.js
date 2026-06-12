import { query } from '../../config/database.js';
import {
  getEmailConfigRaw,
  createTransporter,
  logEmail,
  escapeHtml,
} from '../email/email.service.js';
import * as activityLog from '../activity-logs/activityLog.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPriorite(priorite) {
  const map = { basse: 'Basse', normale: 'Normale', haute: 'Haute', urgente: 'Urgente' };
  return map[priorite] || priorite;
}

async function getClientNom(clientId) {
  if (!clientId) return 'N/A';
  try {
    const res = await query('SELECT raison_sociale FROM clients WHERE id = $1', [clientId]);
    return res.rows[0]?.raison_sociale || 'N/A';
  } catch { return 'N/A'; }
}

async function getCategorieNom(categorieId) {
  if (!categorieId) return 'Non catégorisé';
  try {
    const res = await query('SELECT nom FROM ticket_categories WHERE id = $1', [categorieId]);
    return res.rows[0]?.nom || 'Non catégorisé';
  } catch { return 'Non catégorisé'; }
}

// ---------------------------------------------------------------------------
// Envoi interne générique (ne throw jamais)
// ---------------------------------------------------------------------------

async function sendInternalEmail(config, { destinataires, sujet, corpsTexte, ticket, logDescription }) {
  const transporter = createTransporter(config);
  const fromName = config.smtp_from_name || 'OptimaCRM';
  const fromEmail = config.smtp_from_email || config.smtp_user;

  const signature = config.signature || '';
  const signatureHtml = signature
    ? `<br><br><div style="color:#6b7280;font-size:13px;white-space:pre-line;border-top:1px solid #e5e7eb;padding-top:12px;margin-top:12px;">${escapeHtml(signature)}</div>`
    : '';

  const corpsHtml = escapeHtml(corpsTexte).replace(/\n/g, '<br>');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:#6B46C1;padding:16px 20px;border-radius:8px 8px 0 0;text-align:center;">
        <h1 style="color:white;margin:0;font-size:18px;">${escapeHtml(fromName)}</h1>
      </div>
      <div style="background:#ffffff;padding:24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;">
        <div style="color:#1a1a2e;font-size:14px;line-height:1.6;">${corpsHtml}</div>
        ${signatureHtml}
      </div>
      <div style="text-align:center;padding:12px;color:#9ca3af;font-size:11px;">
        Envoyé via OptimaCRM
      </div>
    </div>
  `;

  for (const email of destinataires) {
    try {
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        replyTo: config.reply_to_email || fromEmail,
        subject: sujet,
        html,
      });

      await logEmail({
        type_document: 'ticket_interne',
        document_id: ticket.id,
        document_numero: ticket.numero,
        destinataire: email,
        sujet,
        statut: 'envoyé',
      });

      console.log(`[TicketNotif] Email envoyé à ${email} — ${sujet}`);
    } catch (err) {
      console.error(`[TicketNotif] Erreur envoi à ${email}:`, err.message);
      try {
        await logEmail({
          type_document: 'ticket_interne',
          document_id: ticket.id,
          document_numero: ticket.numero,
          destinataire: email,
          sujet,
          statut: 'erreur',
          message_erreur: err.message,
        });
      } catch { /* best effort */ }
    }
  }

  try {
    await activityLog.log({
      action: 'notification_email',
      module: 'tickets',
      description: logDescription,
      entityType: 'ticket',
      entityId: ticket.id,
      entityLabel: ticket.numero,
      details: { destinataires, sujet },
    });
  } catch { /* ne pas bloquer */ }
}

// ---------------------------------------------------------------------------
// Vérifie le SMTP et retourne la config, ou null si non configuré
// ---------------------------------------------------------------------------

async function getSmtpConfig() {
  const config = await getEmailConfigRaw();
  if (!config || !config.est_configure) {
    console.warn('[TicketNotif] SMTP non configuré, notification ignorée');
    return null;
  }
  return config;
}

// ---------------------------------------------------------------------------
// A) Nouveau ticket → notifier tous les admin_technique
// ---------------------------------------------------------------------------

export async function notifyTicketCreated(ticket) {
  try {
    const config = await getSmtpConfig();
    if (!config) return;

    const adminsRes = await query(
      "SELECT email FROM users WHERE role = 'admin_technique' AND is_active = true AND email IS NOT NULL",
    );
    const destinataires = adminsRes.rows.map(r => r.email).filter(Boolean);
    if (destinataires.length === 0) {
      console.warn('[TicketNotif] Aucun admin_technique actif avec email');
      return;
    }

    const clientNom = await getClientNom(ticket.client_id);
    const categorieNom = await getCategorieNom(ticket.categorie_id);

    let creeParNom = 'Système';
    if (ticket.cree_par_id) {
      try {
        const userRes = await query("SELECT first_name, last_name FROM users WHERE id = $1", [ticket.cree_par_id]);
        if (userRes.rows.length > 0) {
          creeParNom = `${userRes.rows[0].first_name} ${userRes.rows[0].last_name}`.trim();
        }
      } catch { /* fallback */ }
    }

    const sujet = `Nouveau ticket ${ticket.numero} — ${ticket.sujet}`;
    const corpsTexte = `Un nouveau ticket a été créé.\n\nNuméro : ${ticket.numero}\nSujet : ${ticket.sujet}\nClient : ${clientNom}\nCatégorie : ${categorieNom}\nPriorité : ${formatPriorite(ticket.priorite)}\nCréé par : ${creeParNom}\n\nConnectez-vous à OptimaCRM pour le prendre en charge.`;

    await sendInternalEmail(config, {
      destinataires,
      sujet,
      corpsTexte,
      ticket,
      logDescription: `Email création ticket ${ticket.numero} envoyé à ${destinataires.join(', ')}`,
    });
  } catch (err) {
    console.error('[TicketNotif] Erreur notifyTicketCreated:', err.message);
  }
}

// ---------------------------------------------------------------------------
// B) Ticket assigné → notifier le technicien assigné
// ---------------------------------------------------------------------------

export async function notifyTicketAssigned(ticket, technicienId) {
  try {
    const config = await getSmtpConfig();
    if (!config) return;

    if (!technicienId) return;

    const techRes = await query('SELECT email FROM users WHERE id = $1', [technicienId]);
    if (techRes.rows.length === 0 || !techRes.rows[0].email) {
      console.warn(`[TicketNotif] Pas d'email pour le technicien #${technicienId}`);
      return;
    }

    const clientNom = await getClientNom(ticket.client_id);
    const categorieNom = await getCategorieNom(ticket.categorie_id);

    const sujet = `Ticket ${ticket.numero} vous a été assigné`;
    const corpsTexte = `Un ticket vous a été assigné.\n\nNuméro : ${ticket.numero}\nSujet : ${ticket.sujet}\nClient : ${clientNom}\nCatégorie : ${categorieNom}\nPriorité : ${formatPriorite(ticket.priorite)}\n\nConnectez-vous à OptimaCRM pour le traiter.`;

    await sendInternalEmail(config, {
      destinataires: [techRes.rows[0].email],
      sujet,
      corpsTexte,
      ticket,
      logDescription: `Email assignation ticket ${ticket.numero} envoyé à ${techRes.rows[0].email}`,
    });
  } catch (err) {
    console.error('[TicketNotif] Erreur notifyTicketAssigned:', err.message);
  }
}

// ---------------------------------------------------------------------------
// C) Ticket résolu → notifier tous les admin_technique
// ---------------------------------------------------------------------------

export async function notifyTicketResolved(ticket, resolvedByUser, motif) {
  try {
    const config = await getSmtpConfig();
    if (!config) return;

    const adminsRes = await query(
      "SELECT email FROM users WHERE role = 'admin_technique' AND is_active = true AND email IS NOT NULL",
    );
    const destinataires = adminsRes.rows.map(r => r.email).filter(Boolean);
    if (destinataires.length === 0) return;

    const clientNom = await getClientNom(ticket.client_id);
    const techNom = resolvedByUser
      ? `${resolvedByUser.first_name || ''} ${resolvedByUser.last_name || ''}`.trim() || 'Inconnu'
      : 'Inconnu';

    const sujet = `Ticket ${ticket.numero} résolu par ${techNom}`;
    const motifLine = motif ? `Motif : ${motif}` : 'Motif : non précisé';
    const corpsTexte = `Un ticket a été résolu.\n\nNuméro : ${ticket.numero}\nSujet : ${ticket.sujet}\nClient : ${clientNom}\nRésolu par : ${techNom}\n${motifLine}\n\nConnectez-vous à OptimaCRM pour clôturer le ticket.`;

    await sendInternalEmail(config, {
      destinataires,
      sujet,
      corpsTexte,
      ticket,
      logDescription: `Email résolution ticket ${ticket.numero} envoyé à ${destinataires.join(', ')}`,
    });
  } catch (err) {
    console.error('[TicketNotif] Erreur notifyTicketResolved:', err.message);
  }
}
