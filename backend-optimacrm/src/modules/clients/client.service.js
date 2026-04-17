import { query, pool } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

const CLIENT_FIELDS = `
  id, numero_client, raison_sociale, forme_juridique, siret, siren,
  tva_intracommunautaire, code_ape, site_web, telephone_principal,
  email_principal, email_comptabilite, statut, blocage_raison,
  remise_globale, taux_tva_defaut, devise, plafond_encours,
  delai_paiement, mode_paiement_prefere, iban, bic,
  reference_mandat_sepa, date_mandat_sepa, notes, champs_personnalises, created_at, updated_at
`;

// ---------------------------------------------------------------------------
// Numéro client auto-généré
// ---------------------------------------------------------------------------

async function generateNumeroClient() {
  const result = await query("SELECT nextval('client_numero_seq')::int AS seq");
  const seq = result.rows[0].seq;
  return `CLI-${String(seq).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSiren(siret) {
  if (!siret) return null;
  return siret.substring(0, 9);
}

function buildUpdateQuery(table, id, data, allowedFields) {
  const sets = [];
  const vals = [];
  let i = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${i++}`);
      vals.push(data[field]);
    }
  }

  return { sets, vals, nextIndex: i };
}

function normalizeChampsPersonnalises(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ({
      label: typeof item?.label === 'string' ? item.label.trim() : '',
      valeur: typeof item?.valeur === 'string' ? item.valeur.trim() : '',
    }))
    .filter((item) => item.label && item.valeur);
}

// ---------------------------------------------------------------------------
// CLIENTS — CRUD
// ---------------------------------------------------------------------------

export async function listClients({ page = 1, limit = 10, statut, search }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let i = 1;

  if (statut) {
    conditions.push(`c.statut = $${i++}`);
    params.push(statut);
  }

  if (search) {
    conditions.push(`(
      c.raison_sociale ILIKE $${i} OR
      c.numero_client ILIKE $${i} OR
      c.email_principal ILIKE $${i} OR
      c.siret ILIKE $${i}
    )`);
    params.push(`%${search}%`);
    i++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [clientsRes, countRes] = await Promise.all([
    query(
      `SELECT ${CLIENT_FIELDS} FROM clients c ${where}
       ORDER BY c.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset],
    ),
    query(`SELECT COUNT(*)::int AS total FROM clients c ${where}`, params),
  ]);

  return {
    clients: clientsRes.rows,
    pagination: {
      page,
      limit,
      total: countRes.rows[0].total,
      totalPages: Math.ceil(countRes.rows[0].total / limit),
    },
  };
}

export async function getClientById(id) {
  const clientRes = await query(`SELECT ${CLIENT_FIELDS} FROM clients WHERE id = $1`, [id]);
  if (clientRes.rows.length === 0) throw ApiError.notFound('Client non trouvé');

  const [adressesRes, contactsRes, documentsRes] = await Promise.all([
    query('SELECT * FROM client_adresses WHERE client_id = $1 ORDER BY est_defaut DESC, type', [id]),
    query('SELECT * FROM client_contacts WHERE client_id = $1 ORDER BY est_principal DESC, nom', [id]),
    query('SELECT * FROM client_documents WHERE client_id = $1 ORDER BY created_at DESC', [id]),
  ]);

  return {
    ...clientRes.rows[0],
    adresses: adressesRes.rows,
    contacts: contactsRes.rows,
    documents: documentsRes.rows,
  };
}

export async function createClient(data) {
  if (data.siret) {
    const existing = await query('SELECT id FROM clients WHERE siret = $1', [data.siret]);
    if (existing.rows.length > 0) throw ApiError.conflict('Un client avec ce SIRET existe déjà');
  }

  const emailDup = await query('SELECT id FROM clients WHERE email_principal = $1', [data.email_principal.toLowerCase()]);
  if (emailDup.rows.length > 0) throw ApiError.conflict('Un client avec cet email existe déjà');

  const numero_client = await generateNumeroClient();
  const siren = extractSiren(data.siret);

  const result = await query(
    `INSERT INTO clients (
      numero_client, raison_sociale, forme_juridique, siret, siren,
      tva_intracommunautaire, code_ape, site_web, telephone_principal,
      email_principal, email_comptabilite, statut, blocage_raison,
      remise_globale, taux_tva_defaut, devise, plafond_encours,
      delai_paiement, mode_paiement_prefere, iban, bic,
      reference_mandat_sepa, date_mandat_sepa, notes, champs_personnalises
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
    ) RETURNING ${CLIENT_FIELDS}`,
    [
      numero_client,
      data.raison_sociale,
      data.forme_juridique || 'SARL',
      data.siret || null,
      siren,
      data.tva_intracommunautaire || null,
      data.code_ape || null,
      data.site_web || null,
      data.telephone_principal || null,
      data.email_principal.toLowerCase(),
      data.email_comptabilite || null,
      data.statut || 'ACTIF',
      data.blocage_raison || null,
      data.remise_globale ?? 0,
      data.taux_tva_defaut ?? 20,
      data.devise || 'EUR',
      data.plafond_encours ?? null,
      data.delai_paiement || '30_JOURS',
      data.mode_paiement_prefere || null,
      data.iban || null,
      data.bic || null,
      data.reference_mandat_sepa || null,
      data.date_mandat_sepa || null,
      data.notes || null,
      JSON.stringify(normalizeChampsPersonnalises(data.champs_personnalises)),
    ],
  );

  return result.rows[0];
}

export async function updateClient(id, data) {
  const existing = await query('SELECT id FROM clients WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Client non trouvé');

  if (data.siret) {
    const dup = await query('SELECT id FROM clients WHERE siret = $1 AND id != $2', [data.siret, id]);
    if (dup.rows.length > 0) throw ApiError.conflict('Un client avec ce SIRET existe déjà');
    data.siren = extractSiren(data.siret);
  }

  if (data.email_principal) {
    const dup = await query('SELECT id FROM clients WHERE email_principal = $1 AND id != $2', [
      data.email_principal.toLowerCase(), id,
    ]);
    if (dup.rows.length > 0) throw ApiError.conflict('Un client avec cet email existe déjà');
    data.email_principal = data.email_principal.toLowerCase();
  }

  const allowedFields = [
    'raison_sociale', 'forme_juridique', 'siret', 'siren',
    'tva_intracommunautaire', 'code_ape', 'site_web', 'telephone_principal',
    'email_principal', 'email_comptabilite', 'statut', 'blocage_raison',
    'remise_globale', 'taux_tva_defaut', 'devise', 'plafond_encours',
    'delai_paiement', 'mode_paiement_prefere', 'iban', 'bic',
    'reference_mandat_sepa', 'date_mandat_sepa', 'notes', 'champs_personnalises',
  ];

  if (data.champs_personnalises !== undefined) {
    data.champs_personnalises = JSON.stringify(normalizeChampsPersonnalises(data.champs_personnalises));
  }

  const { sets, vals, nextIndex } = buildUpdateQuery('clients', id, data, allowedFields);

  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  sets.push('updated_at = NOW()');
  vals.push(id);

  const result = await query(
    `UPDATE clients SET ${sets.join(', ')} WHERE id = $${nextIndex} RETURNING ${CLIENT_FIELDS}`,
    vals,
  );

  return result.rows[0];
}

export async function deleteClient(id) {
  const result = await query(
    `UPDATE clients SET statut = 'INACTIF', updated_at = NOW() WHERE id = $1 RETURNING ${CLIENT_FIELDS}`,
    [id],
  );
  if (result.rows.length === 0) throw ApiError.notFound('Client non trouvé');
  return result.rows[0];
}

export async function getClientStats(id) {
  const clientCheck = await query('SELECT id FROM clients WHERE id = $1', [id]);
  if (clientCheck.rows.length === 0) throw ApiError.notFound('Client non trouvé');

  return {
    ca_total: 0,
    nb_factures: 0,
    factures_en_attente: 0,
    montant_en_attente: 0,
    solde_du: 0,
    nb_contrats_actifs: 0,
  };
}

// ---------------------------------------------------------------------------
// ADRESSES — CRUD
// ---------------------------------------------------------------------------

export async function listAdresses(clientId) {
  await ensureClientExists(clientId);
  const result = await query(
    'SELECT * FROM client_adresses WHERE client_id = $1 ORDER BY est_defaut DESC, type',
    [clientId],
  );
  return result.rows;
}

export async function createAdresse(clientId, data) {
  await ensureClientExists(clientId);

  if (data.est_defaut) {
    await query(
      'UPDATE client_adresses SET est_defaut = false WHERE client_id = $1 AND type = $2',
      [clientId, data.type || 'FACTURATION'],
    );
  }

  const result = await query(
    `INSERT INTO client_adresses (client_id, type, est_defaut, ligne1, ligne2, code_postal, ville, pays, label)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      clientId,
      data.type || 'FACTURATION',
      data.est_defaut ?? false,
      data.ligne1,
      data.ligne2 || null,
      data.code_postal,
      data.ville,
      data.pays || 'France',
      data.label || null,
    ],
  );

  return result.rows[0];
}

export async function updateAdresse(clientId, adresseId, data) {
  await ensureClientExists(clientId);

  const allowedFields = ['type', 'est_defaut', 'ligne1', 'ligne2', 'code_postal', 'ville', 'pays', 'label'];
  const { sets, vals, nextIndex } = buildUpdateQuery('client_adresses', adresseId, data, allowedFields);

  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  if (data.est_defaut) {
    await query(
      'UPDATE client_adresses SET est_defaut = false WHERE client_id = $1 AND type = $2 AND id != $3',
      [clientId, data.type || 'FACTURATION', adresseId],
    );
  }

  vals.push(adresseId, clientId);
  const result = await query(
    `UPDATE client_adresses SET ${sets.join(', ')} WHERE id = $${nextIndex} AND client_id = $${nextIndex + 1} RETURNING *`,
    vals,
  );

  if (result.rows.length === 0) throw ApiError.notFound('Adresse non trouvée');
  return result.rows[0];
}

export async function deleteAdresse(clientId, adresseId) {
  const result = await query(
    'DELETE FROM client_adresses WHERE id = $1 AND client_id = $2 RETURNING id',
    [adresseId, clientId],
  );
  if (result.rows.length === 0) throw ApiError.notFound('Adresse non trouvée');
}

// ---------------------------------------------------------------------------
// CONTACTS — CRUD
// ---------------------------------------------------------------------------

export async function listContacts(clientId) {
  await ensureClientExists(clientId);
  const result = await query(
    'SELECT * FROM client_contacts WHERE client_id = $1 ORDER BY est_principal DESC, nom',
    [clientId],
  );
  return result.rows;
}

export async function createContact(clientId, data) {
  await ensureClientExists(clientId);

  if (data.est_principal) {
    await query('UPDATE client_contacts SET est_principal = false WHERE client_id = $1', [clientId]);
  }

  const result = await query(
    `INSERT INTO client_contacts (client_id, role, nom, prenom, fonction, telephone, mobile, email, est_principal)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      clientId,
      data.role || 'PRINCIPAL',
      data.nom,
      data.prenom,
      data.fonction || null,
      data.telephone || null,
      data.mobile || null,
      data.email || null,
      data.est_principal ?? false,
    ],
  );

  return result.rows[0];
}

export async function updateContact(clientId, contactId, data) {
  await ensureClientExists(clientId);

  const allowedFields = ['role', 'nom', 'prenom', 'fonction', 'telephone', 'mobile', 'email', 'est_principal'];
  const { sets, vals, nextIndex } = buildUpdateQuery('client_contacts', contactId, data, allowedFields);

  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  if (data.est_principal) {
    await query(
      'UPDATE client_contacts SET est_principal = false WHERE client_id = $1 AND id != $2',
      [clientId, contactId],
    );
  }

  vals.push(contactId, clientId);
  const result = await query(
    `UPDATE client_contacts SET ${sets.join(', ')} WHERE id = $${nextIndex} AND client_id = $${nextIndex + 1} RETURNING *`,
    vals,
  );

  if (result.rows.length === 0) throw ApiError.notFound('Contact non trouvé');
  return result.rows[0];
}

export async function deleteContact(clientId, contactId) {
  const result = await query(
    'DELETE FROM client_contacts WHERE id = $1 AND client_id = $2 RETURNING id',
    [contactId, clientId],
  );
  if (result.rows.length === 0) throw ApiError.notFound('Contact non trouvé');
}

// ---------------------------------------------------------------------------
// DOCUMENTS — CRUD
// ---------------------------------------------------------------------------

export async function listDocuments(clientId) {
  await ensureClientExists(clientId);
  const result = await query(
    'SELECT * FROM client_documents WHERE client_id = $1 ORDER BY created_at DESC',
    [clientId],
  );
  return result.rows;
}

export async function createDocument(clientId, data) {
  await ensureClientExists(clientId);

  const result = await query(
    `INSERT INTO client_documents (client_id, nom, type, url)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [clientId, data.nom, data.type || 'AUTRE', data.url],
  );

  return result.rows[0];
}

export async function deleteDocument(clientId, documentId) {
  const result = await query(
    'DELETE FROM client_documents WHERE id = $1 AND client_id = $2 RETURNING id',
    [documentId, clientId],
  );
  if (result.rows.length === 0) throw ApiError.notFound('Document non trouvé');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function ensureClientExists(clientId) {
  const result = await query('SELECT id FROM clients WHERE id = $1', [clientId]);
  if (result.rows.length === 0) throw ApiError.notFound('Client non trouvé');
}
