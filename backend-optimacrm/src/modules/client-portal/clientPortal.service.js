import { query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

// ---------------------------------------------------------------------------
// Branding (logo + couleur de la société propriétaire du client)
// ---------------------------------------------------------------------------
// societe_config est scopée par tenant via RLS (app.current_tenant_id posé
// par tenantMiddleware à partir de req.user.tenant_id) — LIMIT 1 suffit donc
// à récupérer la ligne du tenant courant, comme dans societe.service.js.

export async function getBranding() {
  const { rows: [config] } = await query(
    `SELECT raison_sociale, logo_url, couleur_principale FROM societe_config LIMIT 1`,
  );
  return {
    raison_sociale: config?.raison_sociale || null,
    logo_url: config?.logo_url || null,
    couleur_principale: config?.couleur_principale || null,
  };
}

// ---------------------------------------------------------------------------
// Types de contrats du client
// ---------------------------------------------------------------------------

export async function getContractTypes(clientId) {
  const { rows } = await query(
    `SELECT DISTINCT type_contrat
     FROM contrats
     WHERE client_id = $1 AND deleted_at IS NULL AND statut IN ('Actif', 'Renouvelé')
     ORDER BY type_contrat`,
    [clientId],
  );
  return rows.map(r => r.type_contrat);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getDashboard(clientId) {
  const [facturesRes, ticketsRes, lastFactureRes, lastTicketRes] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count
       FROM factures WHERE client_id = $1 AND statut IN ('Validée', 'Envoyée')`,
      [clientId],
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM tickets WHERE client_id = $1 AND statut NOT IN ('resolu', 'cloture')`,
      [clientId],
    ),
    query(
      `SELECT numero_facture, total_ttc, date_creation, statut
       FROM factures WHERE client_id = $1
       ORDER BY date_creation DESC LIMIT 1`,
      [clientId],
    ),
    query(
      `SELECT numero, sujet, statut, created_at
       FROM tickets WHERE client_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [clientId],
    ),
  ]);

  return {
    factures_en_attente: facturesRes.rows[0].count,
    tickets_ouverts: ticketsRes.rows[0].count,
    derniere_facture: lastFactureRes.rows[0] || null,
    dernier_ticket: lastTicketRes.rows[0] || null,
  };
}

// ---------------------------------------------------------------------------
// Factures
// ---------------------------------------------------------------------------

export async function listFactures(clientId, { page = 1, limit = 20, statut, date_debut, date_fin, search }) {
  const offset = (page - 1) * limit;
  const conditions = ['f.client_id = $1'];
  const params = [clientId];
  let idx = 2;

  if (statut) { conditions.push(`f.statut = $${idx++}`); params.push(statut); }
  if (date_debut) { conditions.push(`f.date_creation >= $${idx++}`); params.push(date_debut); }
  if (date_fin) { conditions.push(`f.date_creation <= $${idx++}`); params.push(date_fin); }
  if (search) {
    conditions.push(`(f.numero_facture ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  // Exclure les brouillons — un client ne voit que les factures émises
  conditions.push(`f.statut != 'Brouillon'`);

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRes = await query(`SELECT COUNT(*)::int AS total FROM factures f ${where}`, params);
  const dataRes = await query(
    `SELECT f.id, f.numero_facture, f.date_creation, f.date_echeance, f.total_ht,
            f.total_ttc, f.statut, f.type_origine, f.periode_debut, f.periode_fin
     FROM factures f
     ${where}
     ORDER BY f.date_creation DESC, f.id DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );

  return {
    factures: dataRes.rows,
    pagination: { page, limit, total: countRes.rows[0].total, totalPages: Math.ceil(countRes.rows[0].total / limit) },
  };
}

export async function getFacture(clientId, factureId) {
  const { rows: [facture] } = await query(
    `SELECT f.id, f.numero_facture, f.date_creation, f.date_echeance, f.total_ht,
            f.frais_techniques, f.eco_contribution, f.taux_tva, f.montant_tva,
            f.total_ttc, f.total_regle, f.net_a_payer, f.statut, f.type_origine,
            f.mode_reglement, f.periode_debut, f.periode_fin, f.notes,
            f.client_raison_sociale, f.client_adresse, f.client_cp, f.client_ville,
            f.numero_contrat, f.numero_serie, f.modele_machine
     FROM factures f
     WHERE f.id = $1 AND f.client_id = $2 AND f.statut != 'Brouillon'`,
    [factureId, clientId],
  );
  if (!facture) throw ApiError.notFound('Facture introuvable');

  const lignesRes = await query(
    `SELECT fl.designation, fl.quantite, fl.prix_unitaire, fl.remise_pourcentage,
            fl.remise_montant, fl.total_ht, fl.type_ligne, fl.reference
     FROM facture_lignes fl WHERE fl.facture_id = $1 ORDER BY fl.position, fl.id`,
    [factureId],
  );

  return { ...facture, lignes: lignesRes.rows };
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export async function listTickets(clientId, { page = 1, limit = 20, statut, search }) {
  const offset = (page - 1) * limit;
  const conditions = ['t.client_id = $1'];
  const params = [clientId];
  let idx = 2;

  if (statut) {
    const statuts = statut.split(',').map(s => s.trim());
    conditions.push(`t.statut = ANY($${idx++})`);
    params.push(statuts);
  }
  if (search) {
    conditions.push(`(t.numero ILIKE $${idx} OR t.sujet ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRes = await query(`SELECT COUNT(*)::int AS total FROM tickets t ${where}`, params);
  const dataRes = await query(
    `SELECT t.id, t.numero, t.sujet, t.priorite, t.statut, t.created_at, t.updated_at,
            cat.nom AS categorie_nom, cat.couleur AS categorie_couleur
     FROM tickets t
     LEFT JOIN ticket_categories cat ON cat.id = t.categorie_id
     ${where}
     ORDER BY t.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset],
  );

  return {
    tickets: dataRes.rows,
    pagination: { page, limit, total: countRes.rows[0].total, totalPages: Math.ceil(countRes.rows[0].total / limit) },
  };
}

export async function getTicket(clientId, ticketId) {
  const { rows: [ticket] } = await query(
    `SELECT t.id, t.numero, t.sujet, t.description, t.priorite, t.statut,
            t.created_at, t.updated_at,
            cat.nom AS categorie_nom, cat.couleur AS categorie_couleur,
            m.numero_serie AS machine_numero_serie, m.designation AS machine_designation
     FROM tickets t
     LEFT JOIN ticket_categories cat ON cat.id = t.categorie_id
     LEFT JOIN parc_machines m ON m.id = t.machine_id
     WHERE t.id = $1 AND t.client_id = $2`,
    [ticketId, clientId],
  );
  if (!ticket) throw ApiError.notFound('Ticket introuvable');

  const commentairesRes = await query(
    `SELECT id, user_nom, contenu, created_at
     FROM ticket_commentaires
     WHERE ticket_id = $1 AND est_interne = false
     ORDER BY created_at ASC`,
    [ticketId],
  );

  return { ...ticket, commentaires: commentairesRes.rows };
}

export async function createTicket(clientId, userId, userNom, data) {
  const year = new Date().getFullYear();
  const prefix = `TK-${year}-`;
  const lastRes = await query(
    `SELECT numero FROM tickets WHERE numero LIKE $1 ORDER BY numero DESC LIMIT 1`,
    [`${prefix}%`],
  );
  let next = 1;
  if (lastRes.rows.length > 0) {
    const seq = parseInt(lastRes.rows[0].numero.replace(prefix, ''), 10);
    if (!isNaN(seq)) next = seq + 1;
  }
  const numero = `${prefix}${String(next).padStart(5, '0')}`;

  const result = await query(
    `INSERT INTO tickets (numero, sujet, description, client_id, cree_par_id, priorite, statut, source, machine_id)
     VALUES ($1, $2, $3, $4, $5, 'normale', 'nouveau', 'manuel', $6)
     RETURNING id, numero, sujet, statut, priorite, created_at`,
    [numero, data.sujet, data.description, clientId, userId, data.machine_id || null],
  );
  const ticket = result.rows[0];

  await query(
    `INSERT INTO ticket_historique_statuts (ticket_id, ancien_statut, nouveau_statut, user_id, user_nom)
     VALUES ($1, NULL, 'nouveau', $2, $3)`,
    [ticket.id, userId, userNom],
  );

  return ticket;
}

export async function addTicketComment(clientId, ticketId, userId, userNom, contenu) {
  const ticketCheck = await query(
    'SELECT id FROM tickets WHERE id = $1 AND client_id = $2',
    [ticketId, clientId],
  );
  if (ticketCheck.rows.length === 0) throw ApiError.notFound('Ticket introuvable');

  const result = await query(
    `INSERT INTO ticket_commentaires (ticket_id, user_id, user_nom, contenu, est_interne, pieces_jointes)
     VALUES ($1, $2, $3, $4, false, '[]') RETURNING id, contenu, created_at`,
    [ticketId, userId, userNom, contenu],
  );

  await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [ticketId]);

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Parc machines
// ---------------------------------------------------------------------------

export async function listMachines(clientId, { page = 1, limit = 20, search, categorie }) {
  const offset = (page - 1) * limit;
  const conditions = ['pm.client_id = $1'];
  const params = [clientId];
  let idx = 2;

  if (categorie) { conditions.push(`pm.categorie = $${idx++}`); params.push(categorie); }
  if (search) {
    conditions.push(`(pm.numero_serie ILIKE $${idx} OR pm.designation ILIKE $${idx} OR pm.marque ILIKE $${idx} OR pm.modele ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRes = await query(`SELECT COUNT(*)::int AS total FROM parc_machines pm ${where}`, params);
  const dataRes = await query(
    `SELECT pm.id, pm.numero_serie, pm.designation, pm.marque, pm.modele, pm.categorie,
            pm.statut, pm.site_installation, pm.date_installation, pm.numero_contrat,
            pm.dernier_compteur_nb, pm.dernier_compteur_couleur, pm.date_dernier_releve
     FROM parc_machines pm
     ${where}
     ORDER BY pm.designation ASC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );

  return {
    machines: dataRes.rows,
    pagination: { page, limit, total: countRes.rows[0].total, totalPages: Math.ceil(countRes.rows[0].total / limit) },
  };
}

export async function getMachine(clientId, machineId) {
  const { rows: [machine] } = await query(
    `SELECT pm.id, pm.numero_serie, pm.matricule, pm.designation, pm.marque, pm.modele,
            pm.categorie, pm.statut, pm.site_installation, pm.date_installation,
            pm.date_fin_garantie, pm.numero_contrat,
            pm.dernier_compteur_nb, pm.dernier_compteur_couleur, pm.date_dernier_releve,
            pm.cout_copie_nb, pm.cout_copie_couleur, pm.volume_offert_nb, pm.volume_offert_couleur
     FROM parc_machines pm
     WHERE pm.id = $1 AND pm.client_id = $2`,
    [machineId, clientId],
  );
  if (!machine) throw ApiError.notFound('Machine introuvable');

  const relevesRes = await query(
    `SELECT id, date_releve, compteur_nb, compteur_couleur
     FROM releves_compteurs WHERE machine_id = $1
     ORDER BY date_releve DESC LIMIT 10`,
    [machineId],
  );
  machine.derniers_releves = relevesRes.rows;

  return machine;
}

// ---------------------------------------------------------------------------
// Contrats
// ---------------------------------------------------------------------------

export async function listContrats(clientId, { page = 1, limit = 20, type_contrat, statut }) {
  const offset = (page - 1) * limit;
  const conditions = ['c.client_id = $1', 'c.deleted_at IS NULL'];
  const params = [clientId];
  let idx = 2;

  if (type_contrat) { conditions.push(`c.type_contrat = $${idx++}`); params.push(type_contrat); }
  if (statut) { conditions.push(`c.statut = $${idx++}`); params.push(statut); }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countRes = await query(`SELECT COUNT(*)::int AS total FROM contrats c ${where}`, params);
  const dataRes = await query(
    `SELECT c.id, c.numero_contrat, c.type_contrat, c.type_facturation, c.periodicite,
            c.statut, c.date_debut, c.date_echeance, c.loyer_ht,
            c.date_prochaine_facture, c.terme_facturation
     FROM contrats c
     ${where}
     ORDER BY c.created_at DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset],
  );

  return {
    contrats: dataRes.rows,
    pagination: { page, limit, total: countRes.rows[0].total, totalPages: Math.ceil(countRes.rows[0].total / limit) },
  };
}

export async function getContrat(clientId, contratId) {
  const { rows: [contrat] } = await query(
    `SELECT c.id, c.numero_contrat, c.type_contrat, c.type_facturation, c.periodicite,
            c.statut, c.date_signature, c.date_debut, c.date_echeance,
            c.date_prochaine_facture, c.date_renouvellement, c.duree_contrat_mois,
            c.loyer_ht, c.terme_facturation, c.ftc, c.ect, c.notes
     FROM contrats c
     WHERE c.id = $1 AND c.client_id = $2 AND c.deleted_at IS NULL`,
    [contratId, clientId],
  );
  if (!contrat) throw ApiError.notFound('Contrat introuvable');

  const lignesRes = await query(
    `SELECT designation, reference, quantite, prix_unitaire_ht, remise_pourcentage,
            ROUND(quantite * prix_unitaire_ht * (1 - COALESCE(remise_pourcentage, 0) / 100), 2) AS total_ht,
            categorie_ligne, inclus_abonnement
     FROM contrat_lignes WHERE contrat_id = $1 ORDER BY ordre, id`,
    [contratId],
  );

  const machinesRes = await query(
    `SELECT numero_serie, modele, designation, actif
     FROM contrat_machines WHERE contrat_id = $1 ORDER BY id`,
    [contratId],
  );

  return { ...contrat, lignes: lignesRes.rows, machines: machinesRes.rows };
}
