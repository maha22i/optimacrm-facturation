import { query, pool } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const CONTRAT_FIELDS = `
  c.id, c.numero_contrat, c.type_contrat, c.type_facturation, c.client_id,
  c.periodicite, c.date_signature, c.date_installation, c.date_debut,
  c.date_echeance, c.date_prochaine_facture, c.date_renouvellement,
  c.duree_contrat_mois, c.numero_dossier_financement, c.organisme_credit,
  c.montant_finance, c.loyer_ht, c.location_interne, c.statut,
  c.derniere_facture_date, c.derniere_facture_numero, c.derniere_facture_montant_ht,
  c.ftc, c.ect, c.notes, c.devis_id, c.created_at, c.updated_at
`;

const TYPE_PREFIXES = {
  Copieur: 'C',
  Telephonie: 'D',
  Informatique: 'I',
  Securite: 'S',
};

const PERIODICITE_MOIS = {
  Mensuel: 1,
  Bimestriel: 2,
  Trimestriel: 3,
  Semestriel: 6,
  Annuel: 12,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function generateNumeroContrat(typeContrat) {
  const prefix = TYPE_PREFIXES[typeContrat] || 'X';
  const result = await query("SELECT nextval('contrat_numero_seq')::int AS seq");
  const seq = result.rows[0].seq;
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

function buildUpdateQuery(data, allowedFields) {
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

// ---------------------------------------------------------------------------
// CONTRATS — CRUD
// ---------------------------------------------------------------------------

export async function listContrats({ page = 1, limit = 20, type_contrat, statut, client_id, search, echeance_avant, prochaine_facture_avant }) {
  const offset = (page - 1) * limit;
  const conditions = ['c.deleted_at IS NULL'];
  const params = [];
  let i = 1;

  if (type_contrat) {
    conditions.push(`c.type_contrat = $${i++}`);
    params.push(type_contrat);
  }

  if (statut) {
    conditions.push(`c.statut = $${i++}`);
    params.push(statut);
  }

  if (client_id) {
    conditions.push(`c.client_id = $${i++}`);
    params.push(parseInt(client_id));
  }

  if (search) {
    conditions.push(`(
      c.numero_contrat ILIKE $${i} OR
      cl.raison_sociale ILIKE $${i} OR
      EXISTS (SELECT 1 FROM contrat_machines cm WHERE cm.contrat_id = c.id AND cm.numero_serie ILIKE $${i})
    )`);
    params.push(`%${search}%`);
    i++;
  }

  if (echeance_avant) {
    conditions.push(`c.date_echeance <= $${i++}`);
    params.push(echeance_avant);
  }

  if (prochaine_facture_avant) {
    conditions.push(`c.date_prochaine_facture <= $${i++}`);
    params.push(prochaine_facture_avant);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const [contratsRes, countRes] = await Promise.all([
    query(
      `SELECT ${CONTRAT_FIELDS},
        cl.raison_sociale AS client_raison_sociale,
        cl.numero_client AS client_code,
        (SELECT COALESCE(SUM(
          CASE WHEN lg.actif THEN lg.quantite * lg.prix_unitaire_ht * (1 - lg.remise_pourcentage / 100) ELSE 0 END
        ), 0) FROM contrat_lignes lg WHERE lg.contrat_id = c.id) AS montant_ht,
        (SELECT string_agg(DISTINCT cm2.modele || ' (' || cm2.numero_serie || ')', ', ')
         FROM contrat_machines cm2 WHERE cm2.contrat_id = c.id AND cm2.actif = true) AS machines_resume
       FROM contrats c
       JOIN clients cl ON cl.id = c.client_id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset],
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM contrats c JOIN clients cl ON cl.id = c.client_id ${where}`,
      params,
    ),
  ]);

  return {
    contrats: contratsRes.rows,
    pagination: {
      page,
      limit,
      total: countRes.rows[0].total,
      totalPages: Math.ceil(countRes.rows[0].total / limit),
    },
  };
}

export async function getContratById(id) {
  const contratRes = await query(
    `SELECT ${CONTRAT_FIELDS},
      cl.raison_sociale AS client_raison_sociale,
      cl.numero_client AS client_code,
      cl.email_principal AS client_email,
      cl.mode_paiement_prefere AS client_mode_paiement,
      cl.delai_paiement AS client_delai_paiement
     FROM contrats c
     JOIN clients cl ON cl.id = c.client_id
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [id],
  );
  if (contratRes.rows.length === 0) throw ApiError.notFound('Contrat non trouvé');

  const [lignesRes, machinesRes] = await Promise.all([
    query('SELECT * FROM contrat_lignes WHERE contrat_id = $1 ORDER BY ordre, id', [id]),
    query('SELECT * FROM contrat_machines WHERE contrat_id = $1 ORDER BY id', [id]),
  ]);

  return {
    ...contratRes.rows[0],
    lignes: lignesRes.rows,
    machines: machinesRes.rows,
  };
}

export async function createContrat(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const clientCheck = await client.query('SELECT id FROM clients WHERE id = $1', [data.client_id]);
    if (clientCheck.rows.length === 0) throw ApiError.badRequest('Client non trouvé');

    const numero_contrat = data.numero_contrat || await generateNumeroContrat(data.type_contrat);

    const dup = await client.query('SELECT id FROM contrats WHERE numero_contrat = $1', [numero_contrat]);
    if (dup.rows.length > 0) throw ApiError.conflict('Un contrat avec ce numéro existe déjà');

    const contratRes = await client.query(
      `INSERT INTO contrats (
        numero_contrat, type_contrat, type_facturation, client_id, periodicite,
        date_signature, date_installation, date_debut, date_echeance,
        date_prochaine_facture, date_renouvellement, duree_contrat_mois,
        numero_dossier_financement, organisme_credit, montant_finance, loyer_ht,
        location_interne, statut, ftc, ect, notes, devis_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *`,
      [
        numero_contrat,
        data.type_contrat,
        data.type_facturation || 'Periodique',
        data.client_id,
        data.periodicite || 'Trimestriel',
        data.date_signature || null,
        data.date_installation || null,
        data.date_debut,
        data.date_echeance || null,
        data.date_prochaine_facture || null,
        data.date_renouvellement || null,
        data.duree_contrat_mois ?? 63,
        data.numero_dossier_financement || null,
        data.organisme_credit || null,
        data.montant_finance ?? 0,
        data.loyer_ht ?? 0,
        data.location_interne ?? false,
        data.statut || 'Brouillon',
        data.ftc ?? 0,
        data.ect ?? 0,
        data.notes || null,
        data.devis_id || null,
      ],
    );

    const contrat = contratRes.rows[0];

    if (data.lignes && data.lignes.length > 0) {
      for (let idx = 0; idx < data.lignes.length; idx++) {
        const l = data.lignes[idx];
        await client.query(
          `INSERT INTO contrat_lignes (
            contrat_id, ordre, categorie_ligne, reference, designation, complement_info,
            quantite, prix_unitaire_ht, remise_pourcentage, taux_tva, catalogue_produit_id, actif
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            contrat.id,
            l.ordre ?? idx,
            l.categorie_ligne || null,
            l.reference || null,
            l.designation,
            l.complement_info || null,
            l.quantite ?? 1,
            l.prix_unitaire_ht ?? 0,
            l.remise_pourcentage ?? 0,
            l.taux_tva ?? 20,
            l.catalogue_produit_id || null,
            l.actif ?? true,
          ],
        );
      }
    }

    if (data.machines && data.machines.length > 0) {
      for (const m of data.machines) {
        await client.query(
          `INSERT INTO contrat_machines (
            contrat_id, numero_serie, modele, marque, designation,
            cout_copie_nb, cout_copie_couleur, cout_copie_t1, cout_copie_t2, cout_copie_t3,
            volume_forfait_nb, volume_forfait_couleur, volume_forfait_t1, volume_forfait_t2,
            dernier_compteur_nb, dernier_compteur_couleur, date_dernier_releve,
            service_connectic, service_collecteur, service_divers, service_autre,
            actif, catalogue_produit_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
          [
            contrat.id,
            m.numero_serie,
            m.modele || null,
            m.marque || null,
            m.designation || null,
            m.cout_copie_nb ?? 0,
            m.cout_copie_couleur ?? 0,
            m.cout_copie_t1 ?? 0,
            m.cout_copie_t2 ?? 0,
            m.cout_copie_t3 ?? 0,
            m.volume_forfait_nb ?? 0,
            m.volume_forfait_couleur ?? 0,
            m.volume_forfait_t1 ?? 0,
            m.volume_forfait_t2 ?? 0,
            m.dernier_compteur_nb ?? 0,
            m.dernier_compteur_couleur ?? 0,
            m.date_dernier_releve || null,
            m.service_connectic ?? 0,
            m.service_collecteur ?? 0,
            m.service_divers ?? 0,
            m.service_autre ?? 0,
            m.actif ?? true,
            m.catalogue_produit_id || null,
          ],
        );
      }
    }

    await client.query('COMMIT');
    return getContratById(contrat.id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateContrat(id, data) {
  const existing = await query('SELECT id FROM contrats WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Contrat non trouvé');

  if (data.numero_contrat) {
    const dup = await query('SELECT id FROM contrats WHERE numero_contrat = $1 AND id != $2', [data.numero_contrat, id]);
    if (dup.rows.length > 0) throw ApiError.conflict('Un contrat avec ce numéro existe déjà');
  }

  if (data.client_id) {
    const clientCheck = await query('SELECT id FROM clients WHERE id = $1', [data.client_id]);
    if (clientCheck.rows.length === 0) throw ApiError.badRequest('Client non trouvé');
  }

  const allowedFields = [
    'numero_contrat', 'type_contrat', 'type_facturation', 'client_id', 'periodicite',
    'date_signature', 'date_installation', 'date_debut', 'date_echeance',
    'date_prochaine_facture', 'date_renouvellement', 'duree_contrat_mois',
    'numero_dossier_financement', 'organisme_credit', 'montant_finance', 'loyer_ht',
    'location_interne', 'statut', 'ftc', 'ect', 'notes', 'devis_id',
    'derniere_facture_date', 'derniere_facture_numero', 'derniere_facture_montant_ht',
  ];

  const { sets, vals, nextIndex } = buildUpdateQuery(data, allowedFields);
  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  sets.push('updated_at = NOW()');
  vals.push(id);

  await query(
    `UPDATE contrats SET ${sets.join(', ')} WHERE id = $${nextIndex} AND deleted_at IS NULL`,
    vals,
  );

  return getContratById(id);
}

export async function deleteContrat(id) {
  const result = await query(
    `UPDATE contrats SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, numero_contrat`,
    [id],
  );
  if (result.rows.length === 0) throw ApiError.notFound('Contrat non trouvé');
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// LIGNES
// ---------------------------------------------------------------------------

export async function addLigne(contratId, data) {
  await ensureContratExists(contratId);

  const result = await query(
    `INSERT INTO contrat_lignes (
      contrat_id, ordre, categorie_ligne, reference, designation, complement_info,
      quantite, prix_unitaire_ht, remise_pourcentage, taux_tva, catalogue_produit_id, actif
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      contratId,
      data.ordre ?? 0,
      data.categorie_ligne || null,
      data.reference || null,
      data.designation,
      data.complement_info || null,
      data.quantite ?? 1,
      data.prix_unitaire_ht ?? 0,
      data.remise_pourcentage ?? 0,
      data.taux_tva ?? 20,
      data.catalogue_produit_id || null,
      data.actif ?? true,
    ],
  );

  await query('UPDATE contrats SET updated_at = NOW() WHERE id = $1', [contratId]);
  return result.rows[0];
}

export async function updateLigne(contratId, ligneId, data) {
  await ensureContratExists(contratId);

  const allowedFields = [
    'ordre', 'categorie_ligne', 'reference', 'designation', 'complement_info',
    'quantite', 'prix_unitaire_ht', 'remise_pourcentage', 'taux_tva',
    'catalogue_produit_id', 'actif',
  ];

  const { sets, vals, nextIndex } = buildUpdateQuery(data, allowedFields);
  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  sets.push('updated_at = NOW()');
  vals.push(ligneId, contratId);

  const result = await query(
    `UPDATE contrat_lignes SET ${sets.join(', ')} WHERE id = $${nextIndex} AND contrat_id = $${nextIndex + 1} RETURNING *`,
    vals,
  );

  if (result.rows.length === 0) throw ApiError.notFound('Ligne non trouvée');
  await query('UPDATE contrats SET updated_at = NOW() WHERE id = $1', [contratId]);
  return result.rows[0];
}

export async function deleteLigne(contratId, ligneId) {
  const result = await query(
    'DELETE FROM contrat_lignes WHERE id = $1 AND contrat_id = $2 RETURNING id',
    [ligneId, contratId],
  );
  if (result.rows.length === 0) throw ApiError.notFound('Ligne non trouvée');
  await query('UPDATE contrats SET updated_at = NOW() WHERE id = $1', [contratId]);
}

// ---------------------------------------------------------------------------
// MACHINES
// ---------------------------------------------------------------------------

export async function addMachine(contratId, data) {
  await ensureContratExists(contratId);

  const result = await query(
    `INSERT INTO contrat_machines (
      contrat_id, numero_serie, modele, marque, designation,
      cout_copie_nb, cout_copie_couleur, cout_copie_t1, cout_copie_t2, cout_copie_t3,
      volume_forfait_nb, volume_forfait_couleur, volume_forfait_t1, volume_forfait_t2,
      dernier_compteur_nb, dernier_compteur_couleur, date_dernier_releve,
      service_connectic, service_collecteur, service_divers, service_autre,
      actif, catalogue_produit_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
    [
      contratId,
      data.numero_serie,
      data.modele || null,
      data.marque || null,
      data.designation || null,
      data.cout_copie_nb ?? 0,
      data.cout_copie_couleur ?? 0,
      data.cout_copie_t1 ?? 0,
      data.cout_copie_t2 ?? 0,
      data.cout_copie_t3 ?? 0,
      data.volume_forfait_nb ?? 0,
      data.volume_forfait_couleur ?? 0,
      data.volume_forfait_t1 ?? 0,
      data.volume_forfait_t2 ?? 0,
      data.dernier_compteur_nb ?? 0,
      data.dernier_compteur_couleur ?? 0,
      data.date_dernier_releve || null,
      data.service_connectic ?? 0,
      data.service_collecteur ?? 0,
      data.service_divers ?? 0,
      data.service_autre ?? 0,
      data.actif ?? true,
      data.catalogue_produit_id || null,
    ],
  );

  await query('UPDATE contrats SET updated_at = NOW() WHERE id = $1', [contratId]);
  return result.rows[0];
}

export async function updateMachine(contratId, machineId, data) {
  await ensureContratExists(contratId);

  const allowedFields = [
    'numero_serie', 'modele', 'marque', 'designation',
    'cout_copie_nb', 'cout_copie_couleur', 'cout_copie_t1', 'cout_copie_t2', 'cout_copie_t3',
    'volume_forfait_nb', 'volume_forfait_couleur', 'volume_forfait_t1', 'volume_forfait_t2',
    'dernier_compteur_nb', 'dernier_compteur_couleur', 'date_dernier_releve',
    'service_connectic', 'service_collecteur', 'service_divers', 'service_autre',
    'actif', 'catalogue_produit_id',
  ];

  const { sets, vals, nextIndex } = buildUpdateQuery(data, allowedFields);
  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  sets.push('updated_at = NOW()');
  vals.push(machineId, contratId);

  const result = await query(
    `UPDATE contrat_machines SET ${sets.join(', ')} WHERE id = $${nextIndex} AND contrat_id = $${nextIndex + 1} RETURNING *`,
    vals,
  );

  if (result.rows.length === 0) throw ApiError.notFound('Machine non trouvée');
  await query('UPDATE contrats SET updated_at = NOW() WHERE id = $1', [contratId]);
  return result.rows[0];
}

export async function deleteMachine(contratId, machineId) {
  const result = await query(
    'DELETE FROM contrat_machines WHERE id = $1 AND contrat_id = $2 RETURNING id',
    [machineId, contratId],
  );
  if (result.rows.length === 0) throw ApiError.notFound('Machine non trouvée');
  await query('UPDATE contrats SET updated_at = NOW() WHERE id = $1', [contratId]);
}

// ---------------------------------------------------------------------------
// STATS
// ---------------------------------------------------------------------------

export async function getStats() {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const in3Months = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate());

  const [totalRes, parTypeRes, factureRes, echeanceRes, caRes] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM contrats WHERE statut = 'Actif' AND deleted_at IS NULL`),
    query(`
      SELECT type_contrat, COUNT(*)::int AS count
      FROM contrats WHERE statut = 'Actif' AND deleted_at IS NULL
      GROUP BY type_contrat
    `),
    query(
      `SELECT COUNT(*)::int AS total FROM contrats
       WHERE statut = 'Actif' AND deleted_at IS NULL AND date_prochaine_facture <= $1`,
      [endOfMonth.toISOString().split('T')[0]],
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM contrats
       WHERE statut = 'Actif' AND deleted_at IS NULL AND date_echeance <= $1`,
      [in3Months.toISOString().split('T')[0]],
    ),
    query(`
      SELECT COALESCE(SUM(
        CASE WHEN lg.actif THEN lg.quantite * lg.prix_unitaire_ht * (1 - lg.remise_pourcentage / 100) ELSE 0 END
      ), 0) AS total_ht
      FROM contrat_lignes lg
      JOIN contrats c ON c.id = lg.contrat_id
      WHERE c.statut = 'Actif' AND c.deleted_at IS NULL
    `),
  ]);

  const par_type = { Copieur: 0, Telephonie: 0, Informatique: 0, Securite: 0 };
  for (const row of parTypeRes.rows) {
    par_type[row.type_contrat] = row.count;
  }

  return {
    total_actifs: totalRes.rows[0].total,
    par_type,
    a_facturer_ce_mois: factureRes.rows[0].total,
    echeance_3_mois: echeanceRes.rows[0].total,
    ca_recurrent_mensuel: parseFloat(caRes.rows[0].total_ht) || 0,
  };
}

// ---------------------------------------------------------------------------
// DUPLICATION
// ---------------------------------------------------------------------------

export async function duplicateContrat(id) {
  const original = await getContratById(id);
  if (!original) throw ApiError.notFound('Contrat non trouvé');

  const newData = {
    type_contrat: original.type_contrat,
    type_facturation: original.type_facturation,
    client_id: original.client_id,
    periodicite: original.periodicite,
    duree_contrat_mois: original.duree_contrat_mois,
    numero_dossier_financement: original.numero_dossier_financement,
    organisme_credit: original.organisme_credit,
    montant_finance: original.montant_finance,
    loyer_ht: original.loyer_ht,
    location_interne: original.location_interne,
    statut: 'Brouillon',
    ftc: original.ftc,
    ect: original.ect,
    notes: original.notes ? `[Copie de ${original.numero_contrat}] ${original.notes}` : `Copie de ${original.numero_contrat}`,
    date_debut: new Date().toISOString().split('T')[0],
    lignes: original.lignes.map(l => ({
      ordre: l.ordre,
      categorie_ligne: l.categorie_ligne,
      reference: l.reference,
      designation: l.designation,
      complement_info: l.complement_info,
      quantite: l.quantite,
      prix_unitaire_ht: l.prix_unitaire_ht,
      remise_pourcentage: l.remise_pourcentage,
      taux_tva: l.taux_tva,
      catalogue_produit_id: l.catalogue_produit_id,
      actif: l.actif,
    })),
    machines: original.machines.map(m => ({
      numero_serie: m.numero_serie,
      modele: m.modele,
      marque: m.marque,
      designation: m.designation,
      cout_copie_nb: m.cout_copie_nb,
      cout_copie_couleur: m.cout_copie_couleur,
      cout_copie_t1: m.cout_copie_t1,
      cout_copie_t2: m.cout_copie_t2,
      cout_copie_t3: m.cout_copie_t3,
      volume_forfait_nb: m.volume_forfait_nb,
      volume_forfait_couleur: m.volume_forfait_couleur,
      volume_forfait_t1: m.volume_forfait_t1,
      volume_forfait_t2: m.volume_forfait_t2,
      service_connectic: m.service_connectic,
      service_collecteur: m.service_collecteur,
      service_divers: m.service_divers,
      service_autre: m.service_autre,
      actif: m.actif,
      catalogue_produit_id: m.catalogue_produit_id,
    })),
  };

  return createContrat(newData);
}

// ---------------------------------------------------------------------------
// Contrats par client (pour l'onglet sur la fiche client)
// ---------------------------------------------------------------------------

export async function listContratsByClient(clientId) {
  const result = await query(
    `SELECT ${CONTRAT_FIELDS},
      (SELECT COALESCE(SUM(
        CASE WHEN lg.actif THEN lg.quantite * lg.prix_unitaire_ht * (1 - lg.remise_pourcentage / 100) ELSE 0 END
      ), 0) FROM contrat_lignes lg WHERE lg.contrat_id = c.id) AS montant_ht,
      (SELECT string_agg(DISTINCT cm2.modele || ' (' || cm2.numero_serie || ')', ', ')
       FROM contrat_machines cm2 WHERE cm2.contrat_id = c.id AND cm2.actif = true) AS machines_resume
     FROM contrats c
     WHERE c.client_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC`,
    [clientId],
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function ensureContratExists(contratId) {
  const result = await query('SELECT id FROM contrats WHERE id = $1 AND deleted_at IS NULL', [contratId]);
  if (result.rows.length === 0) throw ApiError.notFound('Contrat non trouvé');
}
