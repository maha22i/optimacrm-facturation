import { pool, query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { toDateStr } from '../../utils/dateUtils.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const STATUTS_CRENEAU = ['planifie', 'en_cours', 'termine', 'annule'];
const STATUTS_TICKET_TERMINES = ['resolu', 'cloture'];

const CRENEAU_SELECT = `
  SELECT pc.*,
         t.numero          AS ticket_numero,
         t.sujet           AS ticket_sujet,
         t.priorite        AS ticket_priorite,
         t.statut          AS ticket_statut,
         t.technicien_id   AS ticket_technicien_id,
         c.raison_sociale  AS client_nom,
         tech.first_name   AS technicien_prenom,
         tech.last_name    AS technicien_nom_famille
  FROM planning_creneaux pc
  JOIN tickets t  ON t.id = pc.ticket_id
  LEFT JOIN clients c ON c.id = t.client_id
  LEFT JOIN users tech ON tech.id = pc.technicien_id
`;

// ---------------------------------------------------------------------------
// Dates : tout est manipulé en UTC exclusivement.
// Les entrées acceptées sont des ISO 8601 ("2026-06-12T08:00:00.000Z")
// ou des dates pures "YYYY-MM-DD" (interprétées à minuit UTC via toDateStr).
// ---------------------------------------------------------------------------

function parseUtc(val, label) {
  if (val == null || val === '') {
    throw ApiError.badRequest(`${label} est requis`);
  }
  // Date pure → minuit UTC
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) {
    return new Date(`${toDateStr(val)}T00:00:00.000Z`);
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) {
    throw ApiError.badRequest(`${label} invalide (format ISO 8601 UTC attendu)`);
  }
  return d;
}

function assertPlage(debut, fin) {
  if (fin.getTime() <= debut.getTime()) {
    throw ApiError.badRequest('La date de fin doit être postérieure à la date de début');
  }
}

// ---------------------------------------------------------------------------
// Chevauchement : deux créneaux actifs d'un même technicien ne peuvent pas
// se recouvrir. Renvoie une erreur 409 explicite avec le ticket en conflit.
// ---------------------------------------------------------------------------

async function assertNoOverlap(db, technicienId, debut, fin, excludeId = null) {
  const result = await db.query(
    `SELECT pc.id, pc.date_debut, pc.date_fin, t.numero
     FROM planning_creneaux pc
     JOIN tickets t ON t.id = pc.ticket_id
     WHERE pc.technicien_id = $1
       AND pc.statut_creneau != 'annule'
       AND pc.date_debut < $3
       AND pc.date_fin   > $2
       AND ($4::int IS NULL OR pc.id != $4)
     LIMIT 1`,
    [technicienId, debut.toISOString(), fin.toISOString(), excludeId],
  );

  if (result.rows.length > 0) {
    const conflit = result.rows[0];
    throw ApiError.conflict(
      `Chevauchement avec un créneau existant (ticket ${conflit.numero}) sur cette plage horaire`,
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/planning — créneaux d'une plage
// ---------------------------------------------------------------------------

export async function listCreneaux({ technicien_id, date_debut, date_fin, currentUser }) {
  const debut = parseUtc(date_debut, 'date_debut');
  const fin = parseUtc(date_fin, 'date_fin');
  assertPlage(debut, fin);

  const conditions = ['pc.date_debut < $1', 'pc.date_fin > $2'];
  const params = [fin.toISOString(), debut.toISOString()];

  // Sécurité serveur : un technicien ne voit que son propre planning,
  // quel que soit le technicien_id passé en paramètre.
  const technicienId = currentUser.role === 'technicien' ? currentUser.id : technicien_id;
  if (technicienId) {
    conditions.push(`pc.technicien_id = $${params.length + 1}`);
    params.push(technicienId);
  }

  const result = await query(
    `${CRENEAU_SELECT}
     WHERE ${conditions.join(' AND ')}
     ORDER BY pc.date_debut ASC`,
    params,
  );

  return result.rows;
}

// ---------------------------------------------------------------------------
// GET /api/planning/tickets-disponibles — tickets planifiables
// (non terminés, sans créneau actif ; le technicien ne voit que les tickets
// non assignés ou assignés à lui)
// ---------------------------------------------------------------------------

export async function listTicketsDisponibles(currentUser) {
  const conditions = [
    `t.statut NOT IN ('resolu', 'cloture')`,
    `NOT EXISTS (
       SELECT 1 FROM planning_creneaux pc
       WHERE pc.ticket_id = t.id AND pc.statut_creneau != 'annule'
     )`,
  ];
  const params = [];

  if (currentUser.role === 'technicien') {
    conditions.push(`(t.technicien_id IS NULL OR t.technicien_id = $1)`);
    params.push(currentUser.id);
  }

  const result = await query(
    `SELECT t.id, t.numero, t.sujet, t.priorite, t.statut, t.technicien_id,
            c.raison_sociale AS client_nom,
            tech.first_name  AS technicien_prenom,
            tech.last_name   AS technicien_nom_famille
     FROM tickets t
     LEFT JOIN clients c ON c.id = t.client_id
     LEFT JOIN users tech ON tech.id = t.technicien_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY CASE t.priorite
                WHEN 'urgente' THEN 1
                WHEN 'haute'   THEN 2
                WHEN 'normale' THEN 3
                ELSE 4
              END,
              t.created_at ASC`,
    params,
  );

  return result.rows;
}

// ---------------------------------------------------------------------------
// POST /api/planning — créer un créneau
// ---------------------------------------------------------------------------

export async function createCreneau(data, currentUser) {
  const debut = parseUtc(data.date_debut, 'date_debut');
  const fin = parseUtc(data.date_fin, 'date_fin');
  assertPlage(debut, fin);

  if (!data.ticket_id) throw ApiError.badRequest('ticket_id est requis');

  const isTechnicien = currentUser.role === 'technicien';

  // Sécurité serveur : un technicien ne peut planifier que pour lui-même.
  let technicienId = data.technicien_id;
  if (isTechnicien) {
    if (technicienId && technicienId !== currentUser.id) {
      throw ApiError.forbidden('Vous ne pouvez planifier un créneau que pour vous-même');
    }
    technicienId = currentUser.id;
  }
  if (!technicienId) throw ApiError.badRequest('technicien_id est requis');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ticketRes = await client.query(
      'SELECT * FROM tickets WHERE id = $1 FOR UPDATE',
      [parseInt(data.ticket_id)],
    );
    if (ticketRes.rows.length === 0) throw ApiError.notFound('Ticket non trouvé');
    const ticket = ticketRes.rows[0];

    if (STATUTS_TICKET_TERMINES.includes(ticket.statut)) {
      throw ApiError.badRequest(`Le ticket ${ticket.numero} est terminé et ne peut plus être planifié`);
    }

    // Sécurité serveur : un technicien ne peut prendre qu'un ticket
    // non assigné ou déjà assigné à lui.
    if (isTechnicien && ticket.technicien_id && ticket.technicien_id !== currentUser.id) {
      throw ApiError.forbidden('Ce ticket est déjà assigné à un autre technicien');
    }

    if (!isTechnicien) {
      const techCheck = await client.query(
        'SELECT id FROM users WHERE id = $1 AND is_active = true',
        [technicienId],
      );
      if (techCheck.rows.length === 0) throw ApiError.badRequest('Technicien non trouvé');
    }

    await assertNoOverlap(client, technicienId, debut, fin);

    // Auto-assignation dans la même transaction : si le ticket n'est pas
    // assigné, il est assigné au technicien du créneau (Nouveau → Assigné),
    // avec écriture dans l'historique comme une assignation normale.
    let autoAssigne = false;
    if (!ticket.technicien_id) {
      const updates = ['technicien_id = $1', 'updated_at = NOW()'];
      const vals = [technicienId];
      let idx = 2;

      if (ticket.statut === 'nouveau') {
        updates.push(`statut = $${idx++}`);
        vals.push('assigne');
        updates.push(`date_prise_en_charge = $${idx++}`);
        vals.push(new Date());

        await client.query(
          `INSERT INTO ticket_historique_statuts (ticket_id, ancien_statut, nouveau_statut, user_id, user_nom, motif)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            ticket.id, 'nouveau', 'assigne', currentUser.id,
            `${currentUser.first_name} ${currentUser.last_name}`,
            isTechnicien ? 'Auto-assignation via le planning' : 'Assignation via le planning',
          ],
        );
      }

      vals.push(ticket.id);
      await client.query(
        `UPDATE tickets SET ${updates.join(', ')} WHERE id = $${idx}`,
        vals,
      );
      autoAssigne = true;
    }

    const creneauRes = await client.query(
      `INSERT INTO planning_creneaux (ticket_id, technicien_id, date_debut, date_fin, cree_par, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [ticket.id, technicienId, debut.toISOString(), fin.toISOString(), currentUser.id, data.notes || null],
    );

    await client.query('COMMIT');

    const creneau = await getCreneauById(creneauRes.rows[0].id);
    return { creneau, autoAssigne, ticket };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// PUT /api/planning/:id — déplacer / redimensionner un créneau
// ---------------------------------------------------------------------------

export async function updateCreneau(id, data, currentUser) {
  const existing = await getCreneauById(id);

  const isTechnicien = currentUser.role === 'technicien';
  if (isTechnicien) {
    // Sécurité serveur : un technicien ne touche qu'à ses propres créneaux
    // et ne peut pas les transférer à quelqu'un d'autre.
    if (existing.technicien_id !== currentUser.id) {
      throw ApiError.forbidden('Vous ne pouvez modifier que vos propres créneaux');
    }
    if (data.technicien_id && data.technicien_id !== currentUser.id) {
      throw ApiError.forbidden('Vous ne pouvez pas transférer un créneau à un autre technicien');
    }
  }

  const debut = data.date_debut !== undefined
    ? parseUtc(data.date_debut, 'date_debut')
    : new Date(existing.date_debut);
  const fin = data.date_fin !== undefined
    ? parseUtc(data.date_fin, 'date_fin')
    : new Date(existing.date_fin);
  assertPlage(debut, fin);

  const technicienId = data.technicien_id || existing.technicien_id;
  if (!isTechnicien && data.technicien_id && data.technicien_id !== existing.technicien_id) {
    const techCheck = await query(
      'SELECT id FROM users WHERE id = $1 AND is_active = true',
      [technicienId],
    );
    if (techCheck.rows.length === 0) throw ApiError.badRequest('Technicien non trouvé');
  }

  let statutCreneau = existing.statut_creneau;
  if (data.statut_creneau !== undefined) {
    if (!STATUTS_CRENEAU.includes(data.statut_creneau)) {
      throw ApiError.badRequest(`Statut de créneau invalide (${STATUTS_CRENEAU.join(', ')})`);
    }
    statutCreneau = data.statut_creneau;
  }

  if (statutCreneau !== 'annule') {
    await assertNoOverlap({ query }, technicienId, debut, fin, parseInt(id));
  }

  await query(
    `UPDATE planning_creneaux
     SET technicien_id = $1, date_debut = $2, date_fin = $3,
         statut_creneau = $4, notes = $5, updated_at = NOW()
     WHERE id = $6`,
    [
      technicienId, debut.toISOString(), fin.toISOString(),
      statutCreneau,
      data.notes !== undefined ? (data.notes || null) : existing.notes,
      parseInt(id),
    ],
  );

  return getCreneauById(id);
}

// ---------------------------------------------------------------------------
// DELETE /api/planning/:id — retirer un créneau (ne supprime pas le ticket)
// ---------------------------------------------------------------------------

export async function deleteCreneau(id, currentUser) {
  const existing = await getCreneauById(id);

  if (currentUser.role === 'technicien' && existing.technicien_id !== currentUser.id) {
    throw ApiError.forbidden('Vous ne pouvez supprimer que vos propres créneaux');
  }

  await query('DELETE FROM planning_creneaux WHERE id = $1', [parseInt(id)]);
  return existing;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function getCreneauById(id) {
  const result = await query(`${CRENEAU_SELECT} WHERE pc.id = $1`, [parseInt(id)]);
  if (result.rows.length === 0) throw ApiError.notFound('Créneau non trouvé');
  return result.rows[0];
}
