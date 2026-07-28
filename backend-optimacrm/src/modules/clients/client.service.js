import path from 'path';
import fs from 'fs/promises';
import { query, pool, getClient } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { bucket, isFirebaseReady } from '../../config/firebase.js';

const CLIENT_FIELDS = `
  id, numero_client, raison_sociale, forme_juridique, siret, siren,
  tva_intracommunautaire, code_ape, numero_rcs, site_web, telephone_principal,
  email_principal, email_comptabilite, statut, blocage_raison,
  remise_globale, taux_tva_defaut, devise, plafond_encours,
  delai_paiement, mode_paiement_prefere, iban, bic,
  reference_mandat_sepa, date_mandat_sepa, sequence_mandat, notes, champs_personnalises, created_at, updated_at
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

  const clientsRes = await query(
    `SELECT ${CLIENT_FIELDS} FROM clients c ${where}
     ORDER BY c.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset],
  );
  const countRes = await query(`SELECT COUNT(*)::int AS total FROM clients c ${where}`, params);

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

  const adressesRes = await query('SELECT * FROM client_adresses WHERE client_id = $1 ORDER BY est_defaut DESC, type', [id]);
  const contactsRes = await query('SELECT * FROM client_contacts WHERE client_id = $1 ORDER BY est_principal DESC, nom', [id]);
  const documentsRes = await query('SELECT * FROM client_documents WHERE client_id = $1 ORDER BY created_at DESC', [id]);

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

  if (data.iban) data.iban = data.iban.replace(/\s/g, '').toUpperCase();
  if (data.bic) data.bic = data.bic.replace(/\s/g, '').toUpperCase().slice(0, 11);

  const numero_client = await generateNumeroClient();
  const siren = extractSiren(data.siret);

  const result = await query(
    `INSERT INTO clients (
      numero_client, raison_sociale, forme_juridique, siret, siren,
      tva_intracommunautaire, code_ape, numero_rcs, site_web, telephone_principal,
      email_principal, email_comptabilite, statut, blocage_raison,
      remise_globale, taux_tva_defaut, devise, plafond_encours,
      delai_paiement, mode_paiement_prefere, iban, bic,
      reference_mandat_sepa, date_mandat_sepa, sequence_mandat, notes, champs_personnalises
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
    ) RETURNING ${CLIENT_FIELDS}`,
    [
      numero_client,
      data.raison_sociale,
      data.forme_juridique || 'SARL',
      data.siret || null,
      siren,
      data.tva_intracommunautaire || null,
      data.code_ape || null,
      data.numero_rcs || null,
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
      data.sequence_mandat || 'RCUR',
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
    'tva_intracommunautaire', 'code_ape', 'numero_rcs', 'site_web', 'telephone_principal',
    'email_principal', 'email_comptabilite', 'statut', 'blocage_raison',
    'remise_globale', 'taux_tva_defaut', 'devise', 'plafond_encours',
    'delai_paiement', 'mode_paiement_prefere', 'iban', 'bic',
    'reference_mandat_sepa', 'date_mandat_sepa', 'sequence_mandat', 'notes', 'champs_personnalises',
  ];

  if (data.iban !== undefined && data.iban) {
    data.iban = data.iban.replace(/\s/g, '').toUpperCase();
  }
  if (data.bic !== undefined && data.bic) {
    data.bic = data.bic.replace(/\s/g, '').toUpperCase().slice(0, 11);
  }

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

export async function deleteAllClients() {
  const alsClient = getClient();
  const dbClient = alsClient || await pool.connect();
  const ownConnection = !alsClient;

  try {
    if (ownConnection) await dbClient.query('BEGIN');

    // SEPA (dépend de factures)
    await dbClient.query('DELETE FROM sepa_remise_lignes');
    await dbClient.query('DELETE FROM sepa_remises');
    // Avoirs (dépend de factures)
    await dbClient.query('DELETE FROM avoir_lignes');
    await dbClient.query('DELETE FROM avoirs');
    // Factures et sous-tables
    await dbClient.query('DELETE FROM facture_reglements');
    await dbClient.query('DELETE FROM facture_historique');
    await dbClient.query('DELETE FROM facture_lignes');
    await dbClient.query('DELETE FROM factures');
    // Contrats et sous-tables
    await dbClient.query('DELETE FROM contrat_machines');
    await dbClient.query('DELETE FROM contrat_lignes');
    await dbClient.query('DELETE FROM contrats');
    // Devis et sous-tables
    await dbClient.query('DELETE FROM bons_commande');
    await dbClient.query('DELETE FROM devis_champs_personnalises');
    await dbClient.query('DELETE FROM devis_historique');
    await dbClient.query('DELETE FROM devis_lignes');
    await dbClient.query('DELETE FROM devis');
    // Parc machines et sous-tables
    await dbClient.query('DELETE FROM releves_compteurs');
    await dbClient.query('DELETE FROM parc_machines');
    // Tarifs spécifiques clients
    await dbClient.query('DELETE FROM produit_tarifs_clients');
    // Sous-tables clients
    await dbClient.query('DELETE FROM client_documents');
    await dbClient.query('DELETE FROM client_contacts');
    await dbClient.query('DELETE FROM client_adresses');
    // Champs personnalisés valeurs
    await dbClient.query('DELETE FROM champs_personnalises_valeurs');
    // Clients
    const result = await dbClient.query('DELETE FROM clients RETURNING id');
    await dbClient.query("ALTER SEQUENCE client_numero_seq RESTART WITH 1");

    if (ownConnection) await dbClient.query('COMMIT');
    return { deletedCount: result.rowCount };
  } catch (err) {
    if (ownConnection) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (ownConnection) dbClient.release();
  }
}

export async function getClientStats(id, modulesActifs) {
  const clientCheck = await query('SELECT id FROM clients WHERE id = $1', [id]);
  if (clientCheck.rows.length === 0) throw ApiError.notFound('Client non trouvé');

  const contratsActive = modulesActifs?.contrats !== false;

  const facturesRes = await query(
    `SELECT
       COUNT(*)::int AS nb_factures,
       COALESCE(SUM(total_ttc), 0) AS ca_total,
       COUNT(*) FILTER (WHERE statut IN ('Validée', 'Envoyée') AND net_a_payer > 0)::int AS factures_en_attente,
       COALESCE(SUM(net_a_payer) FILTER (WHERE statut IN ('Validée', 'Envoyée') AND net_a_payer > 0), 0) AS montant_en_attente,
       COALESCE(SUM(net_a_payer) FILTER (WHERE statut NOT IN ('Annulée') AND net_a_payer > 0), 0) AS solde_du
     FROM factures WHERE client_id = $1 AND statut != 'Annulée'`,
    [id],
  );
  // "désactivé = invisible" jusque dans le calcul : pas de requête sur
  // `contrats` du tout si le module est désactivé pour ce tenant (cf.
  // dashboard.service.js pour le même principe sur parc_machines/catalogue).
  const contratsRes = contratsActive
    ? await query(
        `SELECT COUNT(*)::int AS nb_contrats_actifs
         FROM contrats WHERE client_id = $1 AND statut = 'Actif'`,
        [id],
      )
    : null;

  const f = facturesRes.rows[0];

  return {
    ca_total: parseFloat(f.ca_total) || 0,
    nb_factures: f.nb_factures,
    factures_en_attente: f.factures_en_attente,
    montant_en_attente: parseFloat(f.montant_en_attente) || 0,
    solde_du: parseFloat(f.solde_du) || 0,
    nb_contrats_actifs: contratsActive ? contratsRes.rows[0].nb_contrats_actifs : 0,
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

export async function createDocument(clientId, { nom, type, file }) {
  await ensureClientExists(clientId);

  const ext = path.extname(file.originalname).toLowerCase();
  const safeName = `client_${clientId}_${Date.now()}${ext}`;
  let url;

  if (isFirebaseReady()) {
    const firebasePath = `documents-clients/${safeName}`;
    const firebaseFile = bucket.file(firebasePath);
    await firebaseFile.save(file.buffer, {
      metadata: { contentType: file.mimetype || 'application/octet-stream' },
      public: true,
    });
    url = `https://storage.googleapis.com/${bucket.name}/${firebasePath}`;
  } else {
    const localDir = path.resolve('uploads/documents-clients');
    await fs.mkdir(localDir, { recursive: true });
    await fs.writeFile(path.join(localDir, safeName), file.buffer);
    url = `/uploads/documents-clients/${safeName}`;
  }

  const result = await query(
    `INSERT INTO client_documents (client_id, nom, type, url)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [clientId, nom || file.originalname, type || 'AUTRE', url],
  );

  return result.rows[0];
}

function extractFirebasePath(publicUrl) {
  const match = publicUrl.match(/storage\.googleapis\.com\/[^/]+\/(.+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function deleteDocument(clientId, documentId) {
  const docRes = await query(
    'SELECT * FROM client_documents WHERE id = $1 AND client_id = $2',
    [documentId, clientId],
  );
  if (docRes.rows.length === 0) throw ApiError.notFound('Document non trouvé');

  const doc = docRes.rows[0];

  if (doc.url.startsWith('http') && isFirebaseReady()) {
    const fbPath = extractFirebasePath(doc.url);
    if (fbPath) await bucket.file(fbPath).delete().catch(() => {});
  } else if (doc.url.startsWith('/uploads/')) {
    const localPath = path.resolve('uploads', doc.url.replace(/^\/uploads\//, ''));
    await fs.unlink(localPath).catch(() => {});
  }

  await query('DELETE FROM client_documents WHERE id = $1 AND client_id = $2', [documentId, clientId]);
}

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

export async function getClientsForExport({ statut, search, includeAdresses, includeContacts }) {
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

  const clientsRes = await query(
    `SELECT ${CLIENT_FIELDS} FROM clients c ${where} ORDER BY c.numero_client ASC`,
    params,
  );

  const clients = clientsRes.rows;

  if (clients.length === 0) return { clients: [], adresses: [], contacts: [] };

  const clientIds = clients.map(c => c.id);

  let adresses = [];
  let contacts = [];

  if (includeAdresses) {
    const adressesRes = await query(
      `SELECT * FROM client_adresses WHERE client_id = ANY($1) ORDER BY client_id, est_defaut DESC, type`,
      [clientIds],
    );
    adresses = adressesRes.rows;
  }

  if (includeContacts) {
    const contactsRes = await query(
      `SELECT * FROM client_contacts WHERE client_id = ANY($1) ORDER BY client_id, est_principal DESC, nom`,
      [clientIds],
    );
    contacts = contactsRes.rows;
  }

  return { clients, adresses, contacts };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function ensureClientExists(clientId) {
  const result = await query('SELECT id FROM clients WHERE id = $1', [clientId]);
  if (result.rows.length === 0) throw ApiError.notFound('Client non trouvé');
}
