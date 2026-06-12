import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const STATUTS = ['nouveau', 'assigne', 'en_cours', 'en_attente', 'resolu'];
const PRIORITES = ['basse', 'normale', 'haute', 'urgente'];

const TRANSITIONS = {
  nouveau:    ['assigne'],
  assigne:    ['en_cours', 'nouveau'],
  en_cours:   ['en_attente', 'resolu', 'nouveau'],
  en_attente: ['assigne', 'en_cours', 'nouveau'],
  resolu:     [],
};

// ---------------------------------------------------------------------------
// Génération du numéro de ticket : TK-YYYY-NNNNN
// ---------------------------------------------------------------------------

async function generateNumero() {
  const year = new Date().getFullYear();
  const prefix = `TK-${year}-`;

  const result = await query(
    `SELECT numero FROM tickets WHERE numero LIKE $1 ORDER BY numero DESC LIMIT 1`,
    [`${prefix}%`],
  );

  let next = 1;
  if (result.rows.length > 0) {
    const last = result.rows[0].numero;
    const seq = parseInt(last.replace(prefix, ''), 10);
    if (!isNaN(seq)) next = seq + 1;
  }

  return `${prefix}${String(next).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// Calcul des échéances SLA
// ---------------------------------------------------------------------------

async function computeSlaDeadlines(priorite, createdAt) {
  const result = await query(
    `SELECT delai_prise_en_charge_heures, delai_resolution_heures FROM ticket_sla_rules WHERE priorite = $1`,
    [priorite],
  );

  if (result.rows.length === 0) return { sla_prise_en_charge_echeance: null, sla_resolution_echeance: null };

  const rule = result.rows[0];
  const base = new Date(createdAt);

  const priseEnCharge = rule.delai_prise_en_charge_heures
    ? new Date(base.getTime() + rule.delai_prise_en_charge_heures * 3600000)
    : null;

  const resolution = rule.delai_resolution_heures
    ? new Date(base.getTime() + rule.delai_resolution_heures * 3600000)
    : null;

  return { sla_prise_en_charge_echeance: priseEnCharge, sla_resolution_echeance: resolution };
}

// ---------------------------------------------------------------------------
// Vérification SLA
// ---------------------------------------------------------------------------

export function checkSla(ticket) {
  const now = new Date();
  const WARNING_HOURS = 2;

  function evalDeadline(echeance, dateRealisee) {
    if (!echeance) return 'ok';
    if (dateRealisee) return new Date(dateRealisee) <= new Date(echeance) ? 'ok' : 'depasse';
    const deadline = new Date(echeance);
    if (now > deadline) return 'depasse';
    if (deadline.getTime() - now.getTime() < WARNING_HOURS * 3600000) return 'warning';
    return 'ok';
  }

  return {
    prise_en_charge: evalDeadline(ticket.sla_prise_en_charge_echeance, ticket.date_prise_en_charge),
    resolution: evalDeadline(ticket.sla_resolution_echeance, ticket.date_resolution),
  };
}

// ---------------------------------------------------------------------------
// TICKETS — CRUD
// ---------------------------------------------------------------------------

export async function listTickets({
  page = 1,
  limit = 20,
  statut,
  priorite,
  categorie_id,
  client_id,
  technicien_id,
  search,
  date_debut,
  date_fin,
  sla_depasse,
  sort_by = 'created_at',
  sort_order = 'DESC',
  currentUser = null,
}) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let i = 1;

  if (currentUser && currentUser.role === 'technicien') {
    conditions.push(`t.technicien_id = $${i}`);
    params.push(currentUser.id);
    i++;
  }

  if (statut) {
    const statuts = statut.split(',').map(s => s.trim());
    conditions.push(`t.statut = ANY($${i++})`);
    params.push(statuts);
  }
  if (priorite) {
    const priorites = priorite.split(',').map(s => s.trim());
    conditions.push(`t.priorite = ANY($${i++})`);
    params.push(priorites);
  }
  if (categorie_id) {
    conditions.push(`t.categorie_id = $${i++}`);
    params.push(parseInt(categorie_id));
  }
  if (client_id) {
    conditions.push(`t.client_id = $${i++}`);
    params.push(parseInt(client_id));
  }
  if (technicien_id) {
    conditions.push(`t.technicien_id = $${i++}`);
    params.push(technicien_id);
  }
  if (search) {
    conditions.push(`(t.numero ILIKE $${i} OR t.sujet ILIKE $${i} OR t.description ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }
  if (date_debut) {
    conditions.push(`t.created_at >= $${i++}`);
    params.push(date_debut);
  }
  if (date_fin) {
    conditions.push(`t.created_at <= ($${i++})::timestamptz + interval '1 day'`);
    params.push(date_fin);
  }
  if (sla_depasse === 'true' || sla_depasse === true) {
    conditions.push(`(
      (t.sla_prise_en_charge_echeance IS NOT NULL AND t.date_prise_en_charge IS NULL AND t.sla_prise_en_charge_echeance < NOW())
      OR
      (t.sla_resolution_echeance IS NOT NULL AND t.date_resolution IS NULL AND t.sla_resolution_echeance < NOW())
    )`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const allowedSorts = ['created_at', 'updated_at', 'priorite', 'statut', 'numero', 'sujet'];
  const safeSort = allowedSorts.includes(sort_by) ? `t.${sort_by}` : 't.created_at';
  const safeOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const [ticketsRes, countRes] = await Promise.all([
    query(
      `SELECT t.*,
              c.raison_sociale AS client_nom,
              c.numero_client,
              cat.nom AS categorie_nom,
              cat.couleur AS categorie_couleur,
              tech.first_name AS technicien_prenom,
              tech.last_name AS technicien_nom_famille
       FROM tickets t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN ticket_categories cat ON cat.id = t.categorie_id
       LEFT JOIN users tech ON tech.id = t.technicien_id
       ${where}
       ORDER BY ${safeSort} ${safeOrder}
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM tickets t ${where}`, params),
  ]);

  const tickets = ticketsRes.rows.map(t => ({ ...t, sla: checkSla(t) }));

  return {
    tickets,
    pagination: {
      page,
      limit,
      total: countRes.rows[0].total,
      totalPages: Math.ceil(countRes.rows[0].total / limit),
    },
  };
}

export async function getTicketById(id, currentUser = null) {
  const ticketRes = await query(
    `SELECT t.*,
            c.raison_sociale AS client_nom,
            c.numero_client,
            c.email_principal AS client_email,
            cat.nom AS categorie_nom,
            cat.couleur AS categorie_couleur,
            tech.first_name AS technicien_prenom,
            tech.last_name AS technicien_nom_famille,
            tech.email AS technicien_email,
            createur.first_name AS createur_prenom,
            createur.last_name AS createur_nom_famille,
            m.numero_serie AS machine_numero_serie,
            m.designation AS machine_designation
     FROM tickets t
     LEFT JOIN clients c ON c.id = t.client_id
     LEFT JOIN ticket_categories cat ON cat.id = t.categorie_id
     LEFT JOIN users tech ON tech.id = t.technicien_id
     LEFT JOIN users createur ON createur.id = t.cree_par_id
     LEFT JOIN parc_machines m ON m.id = t.machine_id
     WHERE t.id = $1`,
    [id],
  );

  if (ticketRes.rows.length === 0) throw ApiError.notFound('Ticket non trouvé');

  const ticket = ticketRes.rows[0];

  if (currentUser && currentUser.role === 'technicien') {
    if (ticket.technicien_id !== currentUser.id) {
      throw ApiError.forbidden('Vous n\'avez pas accès à ce ticket');
    }
  }

  const [commentairesRes, historiqueRes] = await Promise.all([
    query(
      `SELECT * FROM ticket_commentaires WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [id],
    ),
    query(
      `SELECT * FROM ticket_historique_statuts WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [id],
    ),
  ]);

  return {
    ...ticket,
    sla: checkSla(ticket),
    commentaires: commentairesRes.rows,
    historique: historiqueRes.rows,
  };
}

export async function createTicket(data, userId, userNom) {
  const clientCheck = await query('SELECT id FROM clients WHERE id = $1', [data.client_id]);
  if (clientCheck.rows.length === 0) throw ApiError.badRequest('Client non trouvé');

  if (data.machine_id) {
    const machineCheck = await query('SELECT id FROM parc_machines WHERE id = $1', [data.machine_id]);
    if (machineCheck.rows.length === 0) throw ApiError.badRequest('Machine non trouvée');
  }

  const numero = await generateNumero();
  const priorite = data.priorite || 'normale';
  const now = new Date();
  const sla = await computeSlaDeadlines(priorite, now);

  let technicienId = data.technicien_id || null;
  if (!technicienId && data.categorie_id) {
    const catRes = await query(
      'SELECT technicien_defaut_id FROM ticket_categories WHERE id = $1',
      [data.categorie_id],
    );
    if (catRes.rows.length > 0 && catRes.rows[0].technicien_defaut_id) {
      technicienId = catRes.rows[0].technicien_defaut_id;
    }
  }

  const statut = technicienId ? 'assigne' : 'nouveau';
  const datePriseEnCharge = technicienId ? now : null;

  const result = await query(
    `INSERT INTO tickets (
      numero, sujet, description, categorie_id, priorite, statut,
      client_id, machine_id, cree_par_id, technicien_id,
      date_prise_en_charge, sla_prise_en_charge_echeance, sla_resolution_echeance,
      pieces_jointes
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *`,
    [
      numero,
      data.sujet,
      data.description || null,
      data.categorie_id || null,
      priorite,
      statut,
      data.client_id,
      data.machine_id || null,
      userId || null,
      technicienId,
      datePriseEnCharge,
      sla.sla_prise_en_charge_echeance,
      sla.sla_resolution_echeance,
      JSON.stringify(data.pieces_jointes || []),
    ],
  );

  const ticket = result.rows[0];

  await query(
    `INSERT INTO ticket_historique_statuts (ticket_id, ancien_statut, nouveau_statut, user_id, user_nom)
     VALUES ($1, NULL, $2, $3, $4)`,
    [ticket.id, statut, userId, userNom],
  );

  return ticket;
}

export async function updateTicket(id, data) {
  const existing = await query('SELECT id FROM tickets WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Ticket non trouvé');

  if (data.machine_id) {
    const machineCheck = await query('SELECT id FROM parc_machines WHERE id = $1', [data.machine_id]);
    if (machineCheck.rows.length === 0) throw ApiError.badRequest('Machine non trouvée');
  }

  const allowedFields = ['sujet', 'description', 'priorite', 'categorie_id', 'machine_id', 'pieces_jointes'];
  const sets = [];
  const vals = [];
  let i = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      const value = field === 'pieces_jointes' ? JSON.stringify(data[field]) : data[field];
      sets.push(`${field} = $${i++}`);
      vals.push(value);
    }
  }

  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  // Si la priorité change, recalculer les SLA
  if (data.priorite) {
    const ticketRes = await query('SELECT created_at, date_prise_en_charge, date_resolution FROM tickets WHERE id = $1', [id]);
    const currentTicket = ticketRes.rows[0];
    const sla = await computeSlaDeadlines(data.priorite, currentTicket.created_at);

    if (!currentTicket.date_prise_en_charge && sla.sla_prise_en_charge_echeance) {
      sets.push(`sla_prise_en_charge_echeance = $${i++}`);
      vals.push(sla.sla_prise_en_charge_echeance);
    }
    if (!currentTicket.date_resolution && sla.sla_resolution_echeance) {
      sets.push(`sla_resolution_echeance = $${i++}`);
      vals.push(sla.sla_resolution_echeance);
    }
  }

  sets.push('updated_at = NOW()');
  vals.push(id);

  const result = await query(
    `UPDATE tickets SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );

  return result.rows[0];
}

export async function deleteTicket(id) {
  const result = await query('DELETE FROM tickets WHERE id = $1 RETURNING *', [id]);
  if (result.rows.length === 0) throw ApiError.notFound('Ticket non trouvé');
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Changement de statut
// ---------------------------------------------------------------------------

export async function changeStatut(ticketId, nouveauStatut, userId, userNom, motif, currentUser = null) {
  if (!STATUTS.includes(nouveauStatut)) {
    throw ApiError.badRequest(`Statut invalide : ${nouveauStatut}`);
  }

  if (nouveauStatut === 'resolu' && currentUser?.role === 'technicien') {
    if (!motif || motif.trim().length < 10) {
      throw ApiError.badRequest('Veuillez décrire le problème rencontré et la solution apportée (minimum 10 caractères)');
    }
  }

  const ticketRes = await query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
  if (ticketRes.rows.length === 0) throw ApiError.notFound('Ticket non trouvé');

  const ticket = ticketRes.rows[0];
  const ancienStatut = ticket.statut;

  if (ancienStatut === nouveauStatut) {
    throw ApiError.badRequest('Le ticket est déjà dans ce statut');
  }

  const transitionsPermises = TRANSITIONS[ancienStatut] || [];
  if (!transitionsPermises.includes(nouveauStatut)) {
    throw ApiError.badRequest(
      `Transition non autorisée : ${ancienStatut} → ${nouveauStatut}`,
    );
  }

  const updates = ['statut = $1', 'updated_at = NOW()'];
  const updateVals = [nouveauStatut];
  let idx = 2;

  if (nouveauStatut === 'assigne' && !ticket.date_prise_en_charge) {
    updates.push(`date_prise_en_charge = $${idx++}`);
    updateVals.push(new Date());
  }
  if (nouveauStatut === 'resolu' && !ticket.date_resolution) {
    updates.push(`date_resolution = $${idx++}`);
    updateVals.push(new Date());
  }

  updateVals.push(ticketId);
  const updatedRes = await query(
    `UPDATE tickets SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    updateVals,
  );

  await query(
    `INSERT INTO ticket_historique_statuts (ticket_id, ancien_statut, nouveau_statut, user_id, user_nom, motif)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ticketId, ancienStatut, nouveauStatut, userId, userNom, motif || null],
  );

  return updatedRes.rows[0];
}

// ---------------------------------------------------------------------------
// Assignation
// ---------------------------------------------------------------------------

export async function assignerTechnicien(ticketId, technicienId, userId, userNom) {
  if (technicienId) {
    const techCheck = await query('SELECT id FROM users WHERE id = $1', [technicienId]);
    if (techCheck.rows.length === 0) throw ApiError.badRequest('Technicien non trouvé');
  }

  const ticketRes = await query('SELECT * FROM tickets WHERE id = $1', [ticketId]);
  if (ticketRes.rows.length === 0) throw ApiError.notFound('Ticket non trouvé');

  const ticket = ticketRes.rows[0];
  const updates = ['technicien_id = $1', 'updated_at = NOW()'];
  const vals = [technicienId || null];
  let idx = 2;

  if (technicienId && ticket.statut === 'nouveau') {
    updates.push(`statut = $${idx++}`);
    vals.push('assigne');
    updates.push(`date_prise_en_charge = $${idx++}`);
    vals.push(new Date());

    await query(
      `INSERT INTO ticket_historique_statuts (ticket_id, ancien_statut, nouveau_statut, user_id, user_nom, motif)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [ticketId, 'nouveau', 'assigne', userId, userNom, 'Assignation technicien'],
    );
  }

  vals.push(ticketId);
  const result = await query(
    `UPDATE tickets SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals,
  );

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Commentaires
// ---------------------------------------------------------------------------

export async function listCommentaires(ticketId) {
  const ticketCheck = await query('SELECT id FROM tickets WHERE id = $1', [ticketId]);
  if (ticketCheck.rows.length === 0) throw ApiError.notFound('Ticket non trouvé');

  const result = await query(
    'SELECT * FROM ticket_commentaires WHERE ticket_id = $1 ORDER BY created_at ASC',
    [ticketId],
  );
  return result.rows;
}

export async function createCommentaire(ticketId, data, userId, userNom) {
  const ticketCheck = await query('SELECT id FROM tickets WHERE id = $1', [ticketId]);
  if (ticketCheck.rows.length === 0) throw ApiError.notFound('Ticket non trouvé');

  const result = await query(
    `INSERT INTO ticket_commentaires (ticket_id, user_id, user_nom, contenu, est_interne, pieces_jointes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      ticketId,
      userId || null,
      userNom || null,
      data.contenu,
      data.est_interne || false,
      JSON.stringify(data.pieces_jointes || []),
    ],
  );

  await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Historique
// ---------------------------------------------------------------------------

export async function listHistorique(ticketId) {
  const ticketCheck = await query('SELECT id FROM tickets WHERE id = $1', [ticketId]);
  if (ticketCheck.rows.length === 0) throw ApiError.notFound('Ticket non trouvé');

  const result = await query(
    'SELECT * FROM ticket_historique_statuts WHERE ticket_id = $1 ORDER BY created_at ASC',
    [ticketId],
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Catégories
// ---------------------------------------------------------------------------

export async function listCategories({ includeInactive = false } = {}) {
  const whereClause = includeInactive ? '' : 'WHERE tc.actif = true';
  const result = await query(
    `SELECT tc.*, u.first_name AS tech_prenom, u.last_name AS tech_nom
     FROM ticket_categories tc
     LEFT JOIN users u ON u.id = tc.technicien_defaut_id
     ${whereClause}
     ORDER BY tc.ordre ASC, tc.nom ASC`,
  );
  return result.rows;
}

export async function createCategorie(data) {
  const result = await query(
    `INSERT INTO ticket_categories (nom, description, couleur, ordre, technicien_defaut_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      data.nom,
      data.description || null,
      data.couleur || '#6B7280',
      data.ordre || 0,
      data.technicien_defaut_id || null,
    ],
  );
  return result.rows[0];
}

export async function updateCategorie(id, data) {
  const existing = await query('SELECT id FROM ticket_categories WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Catégorie non trouvée');

  const allowedFields = ['nom', 'description', 'couleur', 'ordre', 'technicien_defaut_id', 'actif'];
  const sets = [];
  const vals = [];
  let i = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${i++}`);
      vals.push(data[field]);
    }
  }

  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  sets.push('updated_at = NOW()');
  vals.push(id);

  const result = await query(
    `UPDATE ticket_categories SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return result.rows[0];
}

export async function deleteCategorie(id) {
  const result = await query(
    `UPDATE ticket_categories SET actif = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id],
  );
  if (result.rows.length === 0) throw ApiError.notFound('Catégorie non trouvée');
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Règles SLA
// ---------------------------------------------------------------------------

export async function listSlaRules() {
  const result = await query('SELECT * FROM ticket_sla_rules ORDER BY id ASC');
  return result.rows;
}

export async function updateSlaRule(id, data) {
  const existing = await query('SELECT id FROM ticket_sla_rules WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Règle SLA non trouvée');

  const allowedFields = ['delai_prise_en_charge_heures', 'delai_resolution_heures', 'couleur'];
  const sets = [];
  const vals = [];
  let i = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${i++}`);
      vals.push(data[field]);
    }
  }

  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  sets.push('updated_at = NOW()');
  vals.push(id);

  const result = await query(
    `UPDATE ticket_sla_rules SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Statistiques
// ---------------------------------------------------------------------------

export async function getStats(currentUser = null, { date_debut, date_fin } = {}) {
  const isTech = currentUser && currentUser.role === 'technicien';
  const conditions = [];
  const params = [];
  let idx = 1;

  if (isTech) {
    conditions.push(`technicien_id = $${idx++}`);
    params.push(currentUser.id);
  }
  if (date_debut) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(date_debut);
  }
  if (date_fin) {
    conditions.push(`created_at <= ($${idx++})::timestamptz + interval '1 day'`);
    params.push(date_fin);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const andClauses = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

  const joinConditions = [...conditions];
  const techJoinFilter = conditions.length ? `WHERE ${conditions.map(c => `t.${c}`).join(' AND ')}` : '';
  const catJoinAnd = conditions.length ? conditions.map(c => `AND t.${c}`).join(' ') : '';

  const [
    totalRes,
    parStatutRes,
    parPrioriteRes,
    slaDepasseRes,
    tempsResolutionRes,
    tempsPriseEnChargeRes,
    parTechnicienRes,
    parCategorieRes,
  ] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM tickets ${where}`, params),
    query(`SELECT statut, COUNT(*)::int AS count FROM tickets ${where} GROUP BY statut`, params),
    query(`SELECT priorite, COUNT(*)::int AS count FROM tickets ${where} GROUP BY priorite`, params),
    query(`
      SELECT COUNT(*)::int AS count FROM tickets
      WHERE (
        (sla_prise_en_charge_echeance IS NOT NULL AND date_prise_en_charge IS NULL AND sla_prise_en_charge_echeance < NOW())
        OR
        (sla_resolution_echeance IS NOT NULL AND date_resolution IS NULL AND sla_resolution_echeance < NOW())
      ) AND statut != 'resolu'
      ${andClauses}
    `, params),
    query(`
      SELECT AVG(EXTRACT(EPOCH FROM (date_resolution - created_at)) / 3600)::numeric(10,1) AS heures
      FROM tickets WHERE date_resolution IS NOT NULL ${andClauses}
    `, params),
    query(`
      SELECT AVG(EXTRACT(EPOCH FROM (date_prise_en_charge - created_at)) / 3600)::numeric(10,1) AS heures
      FROM tickets WHERE date_prise_en_charge IS NOT NULL ${andClauses}
    `, params),
    query(`
      SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) AS nom,
             COUNT(*) FILTER (WHERE t.statut != 'resolu')::int AS ouverts,
             COUNT(*) FILTER (WHERE t.statut = 'resolu' AND t.date_resolution >= date_trunc('month', CURRENT_DATE))::int AS resolus_ce_mois
      FROM tickets t
      JOIN users u ON u.id = t.technicien_id
      ${techJoinFilter}
      GROUP BY u.id, u.first_name, u.last_name
      ORDER BY ouverts DESC
    `, params),
    query(`
      SELECT cat.id, cat.nom, cat.couleur, COUNT(t.id)::int AS count
      FROM ticket_categories cat
      LEFT JOIN tickets t ON t.categorie_id = cat.id ${catJoinAnd}
      WHERE cat.actif = true
      GROUP BY cat.id, cat.nom, cat.couleur
      ORDER BY count DESC
    `, params),
  ]);

  const par_statut = {};
  for (const r of parStatutRes.rows) par_statut[r.statut] = r.count;

  const par_priorite = {};
  for (const r of parPrioriteRes.rows) par_priorite[r.priorite] = r.count;

  return {
    total: totalRes.rows[0].total,
    par_statut,
    par_priorite,
    sla_depasses: slaDepasseRes.rows[0].count,
    temps_moyen_resolution_heures: parseFloat(tempsResolutionRes.rows[0].heures) || 0,
    temps_moyen_prise_en_charge_heures: parseFloat(tempsPriseEnChargeRes.rows[0].heures) || 0,
    par_technicien: parTechnicienRes.rows,
    par_categorie: parCategorieRes.rows,
  };
}

// ---------------------------------------------------------------------------
// Tickets par client / par machine
// ---------------------------------------------------------------------------

export async function getTicketsByClient(clientId) {
  const clientCheck = await query('SELECT id FROM clients WHERE id = $1', [clientId]);
  if (clientCheck.rows.length === 0) throw ApiError.notFound('Client non trouvé');

  const result = await query(
    `SELECT t.*, cat.nom AS categorie_nom, cat.couleur AS categorie_couleur,
            tech.first_name AS technicien_prenom, tech.last_name AS technicien_nom_famille
     FROM tickets t
     LEFT JOIN ticket_categories cat ON cat.id = t.categorie_id
     LEFT JOIN users tech ON tech.id = t.technicien_id
     WHERE t.client_id = $1
     ORDER BY t.created_at DESC`,
    [clientId],
  );
  return result.rows;
}

export async function getTicketsByMachine(machineId) {
  const machineCheck = await query('SELECT id FROM parc_machines WHERE id = $1', [machineId]);
  if (machineCheck.rows.length === 0) throw ApiError.notFound('Machine non trouvée');

  const result = await query(
    `SELECT t.*, cat.nom AS categorie_nom, cat.couleur AS categorie_couleur,
            tech.first_name AS technicien_prenom, tech.last_name AS technicien_nom_famille,
            c.raison_sociale AS client_nom
     FROM tickets t
     LEFT JOIN ticket_categories cat ON cat.id = t.categorie_id
     LEFT JOIN users tech ON tech.id = t.technicien_id
     LEFT JOIN clients c ON c.id = t.client_id
     WHERE t.machine_id = $1
     ORDER BY t.created_at DESC`,
    [machineId],
  );
  return result.rows;
}
