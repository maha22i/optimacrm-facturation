import { query, pool, getClient } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { CONTRAT_CATEGORIES, getCategoriesForType } from '../../config/contratCategories.js';
import { getValeurs as getChampsPersoValeurs, saveValeurs as saveChampsPersoValeurs } from '../champs-config/champsConfig.service.js';

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
  c.ftc, c.ect, c.notes, c.devis_id, c.terme_facturation, c.created_at, c.updated_at
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

  const contratsRes = await query(
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
  );
  const countRes = await query(
    `SELECT COUNT(*)::int AS total FROM contrats c JOIN clients cl ON cl.id = c.client_id ${where}`,
    params,
  );

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

  const lignesRes = await query('SELECT * FROM contrat_lignes WHERE contrat_id = $1 ORDER BY ordre, id', [id]);
  const machinesRes = await query('SELECT * FROM contrat_machines WHERE contrat_id = $1 ORDER BY id', [id]);
  const champsPerso = await getChampsPersoValeurs('CONTRAT', id).catch(() => []);

  return {
    ...contratRes.rows[0],
    lignes: lignesRes.rows,
    machines: machinesRes.rows,
    champs_personnalises: champsPerso,
  };
}

export async function createContrat(data) {
  const alsClient = getClient();
  const client = alsClient || await pool.connect();
  const ownConnection = !alsClient;
  try {
    if (ownConnection) await client.query('BEGIN');

    const clientCheck = await client.query('SELECT id FROM clients WHERE id = $1', [data.client_id]);
    if (clientCheck.rows.length === 0) throw ApiError.badRequest('Client non trouvé');

    const numero_contrat = data.numero_contrat || await generateNumeroContrat(data.type_contrat);

    const dup = await client.query('SELECT id FROM contrats WHERE numero_contrat = $1', [numero_contrat]);
    if (dup.rows.length > 0) throw ApiError.conflict('Un contrat avec ce numéro existe déjà');

    const termeFacturation = ['TAE', 'TEC'].includes(data.terme_facturation) ? data.terme_facturation : 'TEC';

    const contratRes = await client.query(
      `INSERT INTO contrats (
        numero_contrat, type_contrat, type_facturation, client_id, periodicite,
        date_signature, date_installation, date_debut, date_echeance,
        date_prochaine_facture, date_renouvellement, duree_contrat_mois,
        numero_dossier_financement, organisme_credit, montant_finance, loyer_ht,
        location_interne, statut, ftc, ect, notes, devis_id, terme_facturation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
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
        termeFacturation,
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

    if (ownConnection) await client.query('COMMIT');

    if (data.champs_personnalises && Object.keys(data.champs_personnalises).length > 0) {
      await saveChampsPersoValeurs('CONTRAT', contrat.id, data.champs_personnalises);
    }

    return getContratById(contrat.id);
  } catch (err) {
    if (ownConnection) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (ownConnection) client.release();
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

  if (data.terme_facturation !== undefined && !['TAE', 'TEC'].includes(data.terme_facturation)) {
    throw ApiError.badRequest('terme_facturation doit être TAE ou TEC');
  }

  const allowedFields = [
    'numero_contrat', 'type_contrat', 'type_facturation', 'client_id', 'periodicite',
    'date_signature', 'date_installation', 'date_debut', 'date_echeance',
    'date_prochaine_facture', 'date_renouvellement', 'duree_contrat_mois',
    'numero_dossier_financement', 'organisme_credit', 'montant_finance', 'loyer_ht',
    'location_interne', 'statut', 'ftc', 'ect', 'notes', 'devis_id',
    'derniere_facture_date', 'derniere_facture_numero', 'derniere_facture_montant_ht',
    'terme_facturation',
  ];

  const { sets, vals, nextIndex } = buildUpdateQuery(data, allowedFields);
  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  sets.push('updated_at = NOW()');
  vals.push(id);

  await query(
    `UPDATE contrats SET ${sets.join(', ')} WHERE id = $${nextIndex} AND deleted_at IS NULL`,
    vals,
  );

  if (data.champs_personnalises && Object.keys(data.champs_personnalises).length > 0) {
    await saveChampsPersoValeurs('CONTRAT', id, data.champs_personnalises);
  }

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

export async function bulkDeleteContrats(ids) {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw ApiError.badRequest('Aucun contrat sélectionné');
  }
  const result = await query(
    `UPDATE contrats SET deleted_at = NOW(), updated_at = NOW() WHERE id = ANY($1) AND deleted_at IS NULL RETURNING id, numero_contrat`,
    [ids],
  );
  return { deletedCount: result.rowCount, deleted: result.rows };
}

export async function bulkUpdateStatut(ids, statut) {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw ApiError.badRequest('Aucun contrat sélectionné');
  }
  const result = await query(
    `UPDATE contrats SET statut = $1, updated_at = NOW() WHERE id = ANY($2) AND deleted_at IS NULL RETURNING id, numero_contrat, statut`,
    [statut, ids],
  );
  return { updatedCount: result.rowCount, updated: result.rows };
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

  const totalRes = await query(`SELECT COUNT(*)::int AS total FROM contrats WHERE statut = 'Actif' AND deleted_at IS NULL`);
  const parTypeRes = await query(`
    SELECT type_contrat, COUNT(*)::int AS count
    FROM contrats WHERE statut = 'Actif' AND deleted_at IS NULL
    GROUP BY type_contrat
  `);
  const factureRes = await query(
    `SELECT COUNT(*)::int AS total FROM contrats
     WHERE statut = 'Actif' AND deleted_at IS NULL AND date_prochaine_facture <= $1`,
    [endOfMonth.toISOString().split('T')[0]],
  );
  const echeanceRes = await query(
    `SELECT COUNT(*)::int AS total FROM contrats
     WHERE statut = 'Actif' AND deleted_at IS NULL AND date_echeance <= $1`,
    [in3Months.toISOString().split('T')[0]],
  );
  const caRes = await query(`
    SELECT COALESCE(SUM(
      CASE WHEN lg.actif THEN lg.quantite * lg.prix_unitaire_ht * (1 - lg.remise_pourcentage / 100) ELSE 0 END
    ), 0) AS total_ht
    FROM contrat_lignes lg
    JOIN contrats c ON c.id = lg.contrat_id
    WHERE c.statut = 'Actif' AND c.deleted_at IS NULL
  `);

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
    terme_facturation: original.terme_facturation || 'TEC',
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
// EXPORT
// ---------------------------------------------------------------------------

export async function getContratsForExport({ type_contrat, statut, search, includeLignes, includeMachines }) {
  const conditions = ['c.deleted_at IS NULL'];
  const params = [];
  let i = 1;

  if (type_contrat) { conditions.push(`c.type_contrat = $${i++}`); params.push(type_contrat); }
  if (statut) { conditions.push(`c.statut = $${i++}`); params.push(statut); }
  if (search) {
    conditions.push(`(c.numero_contrat ILIKE $${i} OR cl.raison_sociale ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const contratsRes = await query(
    `SELECT ${CONTRAT_FIELDS},
      cl.raison_sociale AS client_raison_sociale,
      cl.numero_client AS client_code,
      cl.email_principal AS client_email,
      (SELECT COALESCE(SUM(
        CASE WHEN lg.actif THEN lg.quantite * lg.prix_unitaire_ht * (1 - lg.remise_pourcentage / 100) ELSE 0 END
      ), 0) FROM contrat_lignes lg WHERE lg.contrat_id = c.id) AS montant_ht,
      (SELECT string_agg(DISTINCT cm2.modele || ' (' || cm2.numero_serie || ')', ', ')
       FROM contrat_machines cm2 WHERE cm2.contrat_id = c.id AND cm2.actif = true) AS machines_resume
     FROM contrats c
     JOIN clients cl ON cl.id = c.client_id
     ${where}
     ORDER BY c.numero_contrat ASC`,
    params,
  );

  const contrats = contratsRes.rows;
  if (contrats.length === 0) return { contrats: [], lignes: [], machines: [] };

  const contratIds = contrats.map(c => c.id);
  let lignes = [];
  let machines = [];

  if (includeLignes) {
    const lignesRes = await query(
      `SELECT * FROM contrat_lignes WHERE contrat_id = ANY($1) ORDER BY contrat_id, ordre`,
      [contratIds],
    );
    lignes = lignesRes.rows;
  }

  if (includeMachines) {
    const machinesRes = await query(
      `SELECT * FROM contrat_machines WHERE contrat_id = ANY($1) ORDER BY contrat_id, id`,
      [contratIds],
    );
    machines = machinesRes.rows;
  }

  return { contrats, lignes, machines };
}

// ---------------------------------------------------------------------------
// Suppression de tous les contrats
// ---------------------------------------------------------------------------

export async function deleteAllContrats() {
  const alsClient = getClient();
  const client = alsClient || await pool.connect();
  const ownConnection = !alsClient;
  try {
    if (ownConnection) await client.query('BEGIN');
    await client.query('DELETE FROM facture_lignes WHERE facture_id IN (SELECT id FROM factures WHERE contrat_id IS NOT NULL)');
    await client.query('DELETE FROM factures WHERE contrat_id IS NOT NULL');
    await client.query('DELETE FROM contrat_machines');
    await client.query('DELETE FROM contrat_lignes');
    await client.query("DELETE FROM champs_personnalises_valeurs WHERE config_id IN (SELECT id FROM champs_personnalises_config WHERE entite = 'CONTRAT')");
    const result = await client.query('DELETE FROM contrats RETURNING id');
    if (ownConnection) await client.query('COMMIT');
    return { deletedCount: result.rowCount };
  } catch (err) {
    if (ownConnection) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (ownConnection) client.release();
  }
}

// ---------------------------------------------------------------------------
// @deprecated — IMPORT CONTRATS LEGACY (Système A)
// Ce code est remplacé par le wizard générique dans import-contrats/importContrats.service.js
// Il reste temporairement pour rétro-compatibilité mais ne doit plus être utilisé
// pour les nouveaux imports. Utiliser le Système B (import-contrats) à la place.
// ---------------------------------------------------------------------------

const IMPORT_EXCLUDED_CONTRACTS = ['S-5095', 'L-0750', 'B-4684', 'N-6226', 'I-6176'];
const IMPORT_MISSING_CLIENTS = ['8680'];

/**
 * Normalise un code client pour comparaison flexible.
 * "GI287" ↔ "GI-287", " M-0042 " ↔ "M-42", casse ignorée, zéros de tête retirés.
 */
export function normalizeClientCode(raw) {
  if (!raw) return '';
  let code = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  // Séparer préfixe lettres et partie numérique/reste
  const match = code.match(/^([A-Z]+)-?(.+)$/);
  if (match) {
    const prefix = match[1];
    const rest = match[2].replace(/^0+/, '') || '0';
    return `${prefix}-${rest}`;
  }
  // Code purement numérique : retirer zéros de tête
  const numMatch = code.match(/^0*(\d+)$/);
  if (numMatch) return numMatch[1];
  return code;
}

/**
 * Construit une map de clients indexée par code normalisé.
 * Chaque entrée contient la donnée client + le code original DB.
 */
function buildNormalizedClientMap(clientRows) {
  const map = {};
  for (const c of clientRows) {
    const normalized = normalizeClientCode(c.numero_client);
    map[normalized] = c;
    // Garder aussi le code original pour compatibilité exacte
    map[c.numero_client] = c;
  }
  return map;
}

function findClientByCode(clientMap, rawCode) {
  // Essai exact d'abord
  if (clientMap[rawCode]) return clientMap[rawCode];
  // Essai normalisé
  const normalized = normalizeClientCode(rawCode);
  return clientMap[normalized] || null;
}

const IMPORT_STATUS_MAP = {
  'Contrat actif': 'Actif',
  'Résiliation prévue': 'Suspendu',
  'Contrat résilié': 'Résilié',
  'Résilié pour reconditionnement': 'Résilié',
  '1': 'Actif',
  '0': 'Résilié',
};

const TELEPHONIE_RUBRIQUE_MAP = [
  { colIndex: 24, flag: 'Forfait Fixe',          categorie: 'Forfait Fixe' },
  { colIndex: 25, flag: 'Forfait Mobile',         categorie: 'Forfait Mobile' },
  { colIndex: 26, flag: 'LIEN D\'ACCES INTERNET', categorie: 'Lien Internet' },
  { colIndex: 27, flag: 'Location Matériel',      categorie: 'Location Matériel' },
  { colIndex: 28, flag: 'Les Services',            categorie: 'Services' },
  { colIndex: 29, flag: 'Autre',                   categorie: 'Autre' },
];

const INFORMATIQUE_RUBRIQUE_MAP = [
  { prefix: 'Video',    mtCol: 'VideoMt',    libCol: 'VideoLib',    qteCol: 'VideoQte',    puCol: 'VideoPu',    categorie: 'Vidéosurveillance' },
  { prefix: 'Ctrl',     mtCol: 'CtrlMt',     libCol: 'CtrlLib',     qteCol: 'CtrlQte',     puCol: 'CtrlPu',     categorie: 'Contrôle d\'accès' },
  { prefix: 'TlAssist', mtCol: 'TlAssistMt', libCol: 'TlAssistLib', qteCol: 'TlAssistQte', puCol: 'TlAssistPu', categorie: 'Téléassistance' },
  { prefix: 'GenBr',    mtCol: 'GenBrMt',    libCol: 'GenBrLib',    qteCol: 'GenBrQte',    puCol: 'GenBrPu',    categorie: 'Générateur de brouillard' },
  { prefix: 'Tls',      mtCol: 'TlsMt',      libCol: 'TlsLib',      qteCol: 'TlsQte',      puCol: 'TlsPu',      categorie: 'Maintenance serveur' },
  { prefix: 'LibAutre', mtCol: 'LibAutreMt', libCol: null,           qteCol: null,           puCol: null,          categorie: 'Autre' },
];

const COLUMN_SYNONYMS = {
  'prix unitaire ht': 'prix_unitaire_ht',
  'prix unitaire': 'prix_unitaire_ht',
  'pu ht': 'prix_unitaire_ht',
  'montant ht': 'montant_ht',
  'montant': 'montant_ht',
  'catégorie': 'categorie_ligne',
  'categorie': 'categorie_ligne',
  'catégorie ligne': 'categorie_ligne',
  'categorie ligne': 'categorie_ligne',
  'désignation': 'designation',
  'designation': 'designation',
  'libellé': 'designation',
  'libelle': 'designation',
  'quantité': 'quantite',
  'quantite': 'quantite',
  'qté': 'quantite',
  'qte': 'quantite',
  'source données': null,
  'source donnees': null,
  'montant total contrat': 'montant_total_ht',
  'numéro contrat': 'numero_contrat',
  'numero contrat': 'numero_contrat',
  'n° contrat': 'numero_contrat',
  'numerocontrat': 'numero_contrat',
  'code client': 'code_client',
  'n°client': 'code_client',
  'n° client': 'code_client',
  'nom client': 'nom_client',
  'raison sociale': 'nom_client',
  'enseigne': 'nom_client',
  'prochaine facture': 'prochaine_facturation',
  'prochaine facturation': 'prochaine_facturation',
  'date début': 'date_debut',
  'date debut': 'date_debut',
  'datedebutcontrat': 'date_debut',
  'datedébutcontrat': 'date_debut',
  'datedebutfact': 'date_debut_fact',
  'datedébutfact': 'date_debut_fact',
  'échéance': 'date_echeance',
  'echeance': 'date_echeance',
  'date échéance': 'date_echeance',
  'date echeance': 'date_echeance',
  'dateanniversaire': 'date_echeance',
  'date signature': 'date_signature',
  'datesignature': 'date_signature',
  'durée (mois)': 'duree_mois',
  'duree (mois)': 'duree_mois',
  'durée mois': 'duree_mois',
  'dureecontrat': 'duree_mois',
  'duréecontrat': 'duree_mois',
  'renouvellement': 'renouvellement_annuel',
  'renouvellement annuel': 'renouvellement_annuel',
  'augmentation %': 'pourcentage_augmentation',
  'augmentation': 'pourcentage_augmentation',
  'fréquence': 'frequence_facturation',
  'frequence': 'frequence_facturation',
  'fréquence facturation': 'frequence_facturation',
  'frequencefacturation': 'frequence_facturation',
  'terme': 'terme_facturation',
  'terme facturation': 'terme_facturation',
  'termefacturation': 'terme_facturation',
  'activité': 'activite',
  'activite': 'activite',
  'codeactivite': 'activite',
  'statut': 'activite',
  'typecontrat': 'type_contrat',
  'ftc': 'ftc',
  'iban': 'iban',
  'bic': 'bic',
  'email': 'email',
  'email facturation': 'email',
  'total_accesoire': 'total_accessoire',
};

function detectFormatB(headers) {
  if (!headers || headers.length === 0) return false;
  const normalized = headers.map(h => String(h || '').trim().toLowerCase());
  const hasCategorieCol = normalized.some(h =>
    h === 'catégorie' || h === 'categorie' || h === 'catégorie ligne' || h === 'categorie ligne'
  );
  const hasPrixCol = normalized.some(h =>
    h === 'prix unitaire ht' || h === 'prix unitaire' || h === 'pu ht' ||
    h === 'montant ht' || h === 'montant'
  );
  return hasCategorieCol && hasPrixCol;
}

function detectInformatiqueFormat(headers) {
  if (!headers || headers.length === 0) return false;
  const normalized = headers.map(h => String(h || '').trim().toLowerCase());
  return normalized.some(h => h === 'numerocontrat' || h === 'numérocontrat') &&
    (normalized.some(h => h === 'videomt' || h === 'video') ||
     normalized.some(h => h === 'ctrlmt' || h === 'ctrl'));
}

function buildColumnMapping(headers) {
  const mapping = {};
  for (let i = 0; i < headers.length; i++) {
    const header = String(headers[i] || '').trim().toLowerCase();
    if (!header) continue;
    const field = COLUMN_SYNONYMS[header];
    if (field !== undefined) {
      mapping[field] = i;
    }
  }
  return mapping;
}

function buildColumnIndex(headers) {
  const index = {};
  for (let i = 0; i < headers.length; i++) {
    const header = String(headers[i] || '').trim();
    if (!header) continue;
    index[header.toLowerCase()] = i;
    index[header] = i;
  }
  return index;
}

function normalizeCategorie(raw, typeContrat) {
  if (!raw) return 'Autre';
  const trimmed = String(raw).trim();
  const validCats = getCategoriesForType(typeContrat);
  const found = validCats.find(c => c.toLowerCase() === trimmed.toLowerCase());
  if (found) return found;
  const lower = trimmed.toLowerCase();
  if (typeContrat === 'Telephonie') {
    if (lower.includes('fixe')) return 'Forfait Fixe';
    if (lower.includes('mobile')) return 'Forfait Mobile';
    if (lower.includes('internet') || lower.includes('lien')) return 'Lien Internet';
    if (lower.includes('location') || lower.includes('matériel') || lower.includes('materiel')) return 'Location Matériel';
    if (lower.includes('service')) return 'Services';
  }
  if (typeContrat === 'Informatique') {
    if (lower.includes('vidéo') || lower.includes('video')) return 'Vidéosurveillance';
    if (lower.includes('contrôle') || lower.includes('controle') || lower.includes('accès') || lower.includes('acces')) return 'Contrôle d\'accès';
    if (lower.includes('téléassistance') || lower.includes('teleassistance')) return 'Téléassistance';
    if (lower.includes('brouillard') || lower.includes('générateur') || lower.includes('generateur')) return 'Générateur de brouillard';
    if (lower.includes('serveur')) return 'Maintenance serveur';
    if (lower.includes('informatique') || lower.includes('maintenance')) return 'Maintenance informatique';
    if (lower.includes('cloud')) return 'Cloud';
    if (lower.includes('office') || lower.includes('365')) return 'Office 365';
    if (lower.includes('logiciel') || lower.includes('licence')) return 'Logiciel / Licence';
  }
  return 'Autre';
}

function parseExcelDate(raw) {
  if (!raw || raw === 0 || raw === '0') return null;
  if (raw instanceof Date) {
    if (raw.getFullYear() < 1970 || raw.getFullYear() > 2100) return null;
    return raw.toISOString().split('T')[0];
  }
  if (typeof raw === 'number') {
    const date = new Date((raw - 25569) * 86400 * 1000);
    if (date.getFullYear() < 1970 || date.getFullYear() > 2100) return null;
    return date.toISOString().split('T')[0];
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const partsDMY = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (partsDMY) {
      const d = new Date(parseInt(partsDMY[3]), parseInt(partsDMY[2]) - 1, parseInt(partsDMY[1]));
      if (d.getFullYear() < 1970 || d.getFullYear() > 2100) return null;
      return d.toISOString().split('T')[0];
    }
    const iso = new Date(trimmed);
    if (!isNaN(iso.getTime()) && iso.getFullYear() > 1970 && iso.getFullYear() < 2100) {
      return iso.toISOString().split('T')[0];
    }
  }
  return null;
}

function parseNumber(raw) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw).replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parsePeriodicity(raw) {
  if (!raw) return 'Mensuel';
  const v = String(raw).trim().toUpperCase();
  if (v === 'M' || v === 'MENSUEL') return 'Mensuel';
  if (v === 'B' || v === 'BIMESTRIEL') return 'Bimestriel';
  if (v === 'T' || v === 'TRIMESTRIEL') return 'Trimestriel';
  if (v === 'S' || v === 'SEMESTRIEL') return 'Semestriel';
  if (v === 'A' || v === 'ANNUEL') return 'Annuel';
  return 'Mensuel';
}

function parseTerm(raw) {
  if (!raw) return null;
  const v = String(raw).trim().toUpperCase();
  if (v === 'TAE') return 'A échoir';
  if (v === 'TEC') return 'Échu';
  return null;
}

/** @deprecated Utiliser import-contrats/importContrats.service.js parseFile() à la place */
export async function previewImportContrats(buffer, typeContrat) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 2) throw ApiError.badRequest('Le fichier est vide ou ne contient pas de données');

  const headers = rows[0];
  const isFormatB = detectFormatB(headers);
  const isInfoFormat = typeContrat === 'Informatique' && detectInformatiqueFormat(headers);
  const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''));

  const preview = {
    total_lignes: dataRows.length,
    contrats_a_creer: 0,
    clients_matches: 0,
    clients_manquants: [],
    exclus_incoherence: [],
    doublons: [],
    lignes_abonnement: 0,
    lignes_ftc: 0,
    statuts: {},
    apercu: [],
    format: isInfoFormat ? 'informatique' : isFormatB ? 'ligne_par_rubrique' : 'flags',
    type_contrat: typeContrat,
  };

  if (isInfoFormat) {
    const colIdx = buildColumnIndex(headers);
    const colMap = buildColumnMapping(headers);
    const numContratIdx = colMap.numero_contrat ?? colIdx['NumeroContrat'] ?? 0;
    const codeClientIdx = colMap.code_client ?? colIdx['N°client'] ?? colIdx['n°client'] ?? 1;
    const activiteIdx = colMap.activite ?? colIdx['CodeActivite'] ?? colIdx['codeactivite'] ?? null;

    const clientCodes = [...new Set(dataRows.map(r => String(r[codeClientIdx] || '').trim()).filter(Boolean))];
    const clientRes = await query(
      'SELECT id, numero_client, raison_sociale FROM clients',
    );
    const clientMap = buildNormalizedClientMap(clientRes.rows);

    const seenContrats = new Set();

    for (const row of dataRows) {
      const numContrat = String(row[numContratIdx] || '').trim();
      const codeClient = String(row[codeClientIdx] || '').trim();
      if (!numContrat) continue;

      if (IMPORT_EXCLUDED_CONTRACTS.includes(numContrat)) {
        preview.exclus_incoherence.push({ code_client: codeClient, numero_contrat: numContrat });
        continue;
      }

      if (seenContrats.has(numContrat)) {
        preview.doublons.push({ numero_contrat: numContrat, client: codeClient, raison: 'doublon dans le fichier' });
        continue;
      }
      seenContrats.add(numContrat);

      const client = findClientByCode(clientMap, codeClient);
      if (!client) {
        if (!preview.clients_manquants.find(c => c.code === codeClient)) {
          preview.clients_manquants.push({ code: codeClient, numero_contrat: numContrat });
        }
        continue;
      }

      const dupRes = await query(
        'SELECT id, type_contrat FROM contrats WHERE numero_contrat = $1',
        [numContrat],
      );
      const existeDeja = dupRes.rows.length > 0;

      const activiteRaw = activiteIdx != null ? String(row[activiteIdx] || '').trim() : '1';
      const statut = IMPORT_STATUS_MAP[activiteRaw] || 'Actif';
      preview.statuts[statut] = (preview.statuts[statut] || 0) + 1;
      preview.clients_matches++;
      preview.contrats_a_creer++;
      if (existeDeja) {
        if (!preview.contrats_a_maj) preview.contrats_a_maj = 0;
        preview.contrats_a_maj++;
      }

      let nbRubriques = 0;
      let totalMontant = 0;
      for (const rub of INFORMATIQUE_RUBRIQUE_MAP) {
        const mtIdx = colIdx[rub.mtCol] ?? colIdx[rub.mtCol.toLowerCase()];
        const mt = mtIdx != null ? parseNumber(row[mtIdx]) : 0;
        const libIdx = rub.libCol ? (colIdx[rub.libCol] ?? colIdx[rub.libCol.toLowerCase()]) : null;
        const lib = libIdx != null ? String(row[libIdx] || '').trim() : '';
        if (mt > 0 || lib) {
          nbRubriques++;
          totalMontant += mt;
          preview.lignes_abonnement++;
        }
      }

      const ftcIdx = colIdx['FTC'] ?? colIdx['ftc'];
      const ftcVal = ftcIdx != null ? parseNumber(row[ftcIdx]) : 0;
      if (ftcVal > 0) preview.lignes_ftc++;

      if (preview.apercu.length < 10) {
        preview.apercu.push({
          code_client: codeClient,
          client: client.raison_sociale,
          numero_contrat: numContrat,
          statut,
          rubriques: nbRubriques,
          montant_abonnement: totalMontant,
          ftc: ftcVal,
        });
      }
    }
  } else if (isFormatB) {
    const colMap = buildColumnMapping(headers);
    const codeClientIdx = colMap.code_client ?? 1;
    const numContratIdx = colMap.numero_contrat ?? 2;
    const activiteIdx = colMap.activite ?? 3;
    const prixIdx = colMap.prix_unitaire_ht;
    const montantIdx = colMap.montant_ht;
    const quantiteIdx = colMap.quantite;
    const ftcIdx = colMap.ftc;

    const clientRes = await query(
      'SELECT id, numero_client, raison_sociale FROM clients',
    );
    const clientMap = buildNormalizedClientMap(clientRes.rows);

    const groupedByContrat = {};
    for (const row of dataRows) {
      const numContrat = String(row[numContratIdx] || '').trim();
      if (!numContrat) continue;
      if (!groupedByContrat[numContrat]) groupedByContrat[numContrat] = [];
      groupedByContrat[numContrat].push(row);
    }

    for (const [numContrat, groupRows] of Object.entries(groupedByContrat)) {
      const firstRow = groupRows[0];
      const codeClient = String(firstRow[codeClientIdx] || '').trim();
      const activite = String(firstRow[activiteIdx] || '').trim();

      if (IMPORT_EXCLUDED_CONTRACTS.includes(numContrat)) {
        preview.exclus_incoherence.push({ code_client: codeClient, numero_contrat: numContrat });
        continue;
      }
      if (IMPORT_MISSING_CLIENTS.includes(codeClient)) {
        if (!preview.clients_manquants.find(c => c.code === codeClient)) {
          preview.clients_manquants.push({ code: codeClient, numero_contrat: numContrat });
        }
        continue;
      }

      const client = findClientByCode(clientMap, codeClient);
      if (!client) {
        if (!preview.clients_manquants.find(c => c.code === codeClient)) {
          preview.clients_manquants.push({ code: codeClient, numero_contrat: numContrat });
        }
        continue;
      }

      preview.clients_matches++;
      preview.contrats_a_creer++;

      const dupResB = await query('SELECT id FROM contrats WHERE numero_contrat = $1', [numContrat]);
      if (dupResB.rows.length > 0) {
        if (!preview.contrats_a_maj) preview.contrats_a_maj = 0;
        preview.contrats_a_maj++;
      }

      const statut = IMPORT_STATUS_MAP[activite] || 'Actif';
      preview.statuts[statut] = (preview.statuts[statut] || 0) + 1;

      let totalMontant = 0;
      for (const row of groupRows) {
        const prix = prixIdx != null ? parseNumber(row[prixIdx]) : 0;
        const qte = quantiteIdx != null ? (parseInt(row[quantiteIdx]) || 1) : 1;
        const montant = montantIdx != null ? parseNumber(row[montantIdx]) : prix * qte;
        totalMontant += montant || (prix * qte);
        preview.lignes_abonnement++;
      }

      const ftcVal = ftcIdx != null ? parseNumber(firstRow[ftcIdx]) : 0;
      if (ftcVal > 0) preview.lignes_ftc++;

      if (preview.apercu.length < 10) {
        preview.apercu.push({
          code_client: codeClient,
          client: client.raison_sociale,
          numero_contrat: numContrat,
          statut,
          rubriques: groupRows.length,
          montant_abonnement: totalMontant,
          ftc: ftcVal,
        });
      }
    }
  } else {
    const clientRes = await query(
      'SELECT id, numero_client, raison_sociale FROM clients',
    );
    const clientMap = buildNormalizedClientMap(clientRes.rows);

    for (const row of dataRows) {
      const codeClient = String(row[1] || '').trim();
      const numContrat = String(row[2] || '').trim();
      const activite = String(row[3] || '').trim();

      if (IMPORT_EXCLUDED_CONTRACTS.includes(numContrat)) {
        preview.exclus_incoherence.push({ code_client: codeClient, numero_contrat: numContrat });
        continue;
      }
      if (IMPORT_MISSING_CLIENTS.includes(codeClient)) {
        if (!preview.clients_manquants.find(c => c.code === codeClient)) {
          preview.clients_manquants.push({ code: codeClient, numero_contrat: numContrat });
        }
        continue;
      }

      const client = findClientByCode(clientMap, codeClient);
      if (!client) {
        if (!preview.clients_manquants.find(c => c.code === codeClient)) {
          preview.clients_manquants.push({ code: codeClient, numero_contrat: numContrat });
        }
        continue;
      }

      preview.clients_matches++;
      preview.contrats_a_creer++;

      const dupResF = await query('SELECT id FROM contrats WHERE numero_contrat = $1', [numContrat]);
      if (dupResF.rows.length > 0) {
        if (!preview.contrats_a_maj) preview.contrats_a_maj = 0;
        preview.contrats_a_maj++;
      }

      const statut = IMPORT_STATUS_MAP[activite] || 'Actif';
      preview.statuts[statut] = (preview.statuts[statut] || 0) + 1;

      let nbRubriques = 0;
      for (const rub of TELEPHONIE_RUBRIQUE_MAP) {
        const val = parseNumber(row[rub.colIndex]);
        if (val === 1) {
          nbRubriques++;
          preview.lignes_abonnement++;
        }
      }

      const ftc = parseNumber(row[33]);
      if (ftc > 0) preview.lignes_ftc++;

      if (preview.apercu.length < 10) {
        preview.apercu.push({
          code_client: codeClient,
          client: client.raison_sociale,
          numero_contrat: numContrat,
          statut,
          rubriques: nbRubriques,
          montant_abonnement: parseNumber(row[12]),
          ftc,
        });
      }
    }
  }

  return preview;
}

/** @deprecated Rétro-compatibilité. Utiliser le wizard générique. */
export async function previewImportTelephonie(buffer) {
  return previewImportContrats(buffer, 'Telephonie');
}

/** @deprecated Utiliser import-contrats/importContrats.service.js executeImport() à la place */
export async function importContrats(buffer, typeContrat, userId, userName, ipAddress, logicielsBuffer) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length < 2) throw ApiError.badRequest('Le fichier est vide ou ne contient pas de données');

  const headers = rows[0];
  const isFormatB = detectFormatB(headers);
  const isInfoFormat = typeContrat === 'Informatique' && detectInformatiqueFormat(headers);
  const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''));

  // Parser le fichier logiciels si fourni (Informatique uniquement)
  let logicielsMap = {};
  if (logicielsBuffer && typeContrat === 'Informatique') {
    logicielsMap = parseLogicielsFile(XLSX, logicielsBuffer);
  }

  const rapport = {
    contrats_crees: 0,
    lignes_abonnement_creees: 0,
    lignes_logiciels_creees: 0,
    lignes_ftc_creees: 0,
    exclus_incoherence: 0,
    client_manquant: 0,
    doublons_ignores: 0,
    erreurs: [],
    format: isInfoFormat ? 'informatique' : isFormatB ? 'ligne_par_rubrique' : 'flags',
    type_contrat: typeContrat,
  };

  if (isInfoFormat) {
    await importInformatique(dataRows, headers, typeContrat, logicielsMap, rapport);
  } else if (isFormatB) {
    await importFormatB(dataRows, headers, typeContrat, rapport);
  } else {
    await importFormatFlags(dataRows, typeContrat, rapport);
  }

  try {
    const { log } = await import('../activity-logs/activityLog.service.js');
    await log({
      userId,
      userNom: userName,
      action: `import_contrats_${typeContrat.toLowerCase()}`,
      module: 'contrats',
      description: `Import de ${rapport.contrats_crees} contrats ${typeContrat} depuis fichier XLSX (format: ${rapport.format})`,
      entityType: 'contrat',
      details: rapport,
      statut: 'succes',
      ipAddress,
    });
  } catch (logErr) { console.error('[ActivityLog]', logErr.message); }

  return rapport;
}

/** @deprecated Rétro-compatibilité. Utiliser le wizard générique. */
export async function importContratsTelephonie(buffer, userId, userName, ipAddress) {
  return importContrats(buffer, 'Telephonie', userId, userName, ipAddress);
}

// ---------------------------------------------------------------------------
// Parser fichier logiciels (Logiciels_INFORMATIQUE.xlsx)
// ---------------------------------------------------------------------------

function parseLogicielsFile(XLSX, buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: true });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' });
  if (rows.length < 2) return {};

  const headers = rows[0];
  const normalized = headers.map(h => String(h || '').trim().toLowerCase());

  const numContratIdx = normalized.findIndex(h => h.includes('numerocontrat') || h.includes('numérocontrat') || h.includes('numero contrat') || h.includes('n° contrat'));
  const nomProduitIdx = normalized.findIndex(h => h.includes('nom') || h.includes('produit') || h.includes('désignation') || h.includes('designation'));
  const nbLicencesIdx = normalized.findIndex(h => h.includes('licence') || h.includes('quantit') || h.includes('nombre'));
  const prixUnitaireIdx = normalized.findIndex(h => h.includes('prix unitaire') || h.includes('pu'));
  const prixTotalIdx = normalized.findIndex(h => h.includes('prix total') || h.includes('total'));
  const inclusIdx = normalized.findIndex(h => h.includes('inclus'));

  const map = {};
  const dataRows = rows.slice(1).filter(r => r.some(c => c !== ''));

  for (const row of dataRows) {
    const numContrat = numContratIdx >= 0 ? String(row[numContratIdx] || '').trim() : '';
    if (!numContrat) continue;

    if (!map[numContrat]) map[numContrat] = [];

    const nomProduit = nomProduitIdx >= 0 ? String(row[nomProduitIdx] || '').trim() : '';
    const nbLicences = nbLicencesIdx >= 0 ? parseNumber(row[nbLicencesIdx]) : 1;
    const prixUnitaire = prixUnitaireIdx >= 0 ? parseNumber(row[prixUnitaireIdx]) : 0;
    const prixTotal = prixTotalIdx >= 0 ? parseNumber(row[prixTotalIdx]) : (nbLicences * prixUnitaire);
    const inclusRaw = inclusIdx >= 0 ? String(row[inclusIdx] || '').trim() : '1';
    const inclusAbonnement = inclusRaw === '1' || inclusRaw.toLowerCase() === 'oui' || inclusRaw.toLowerCase() === 'true';

    if (nomProduit || prixTotal > 0) {
      map[numContrat].push({
        designation: nomProduit || 'Logiciel / Licence',
        quantite: nbLicences || 1,
        prix_unitaire_ht: prixUnitaire,
        montant_ht: prixTotal,
        inclus_abonnement: inclusAbonnement,
      });
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Import format INFORMATIQUE (une ligne = un contrat, colonnes = rubriques)
// ---------------------------------------------------------------------------

async function importInformatique(dataRows, headers, typeContrat, logicielsMap, rapport) {
  const colIdx = buildColumnIndex(headers);
  const colMap = buildColumnMapping(headers);
  const numContratIdx = colMap.numero_contrat ?? colIdx['NumeroContrat'] ?? colIdx['numerocontrat'] ?? 0;
  const codeClientIdx = colMap.code_client ?? colIdx['N°client'] ?? colIdx['n°client'] ?? 1;
  const activiteIdx = colMap.activite ?? colIdx['CodeActivite'] ?? colIdx['codeactivite'] ?? null;
  const dateSignatureIdx = colIdx['DateSignature'] ?? colIdx['datesignature'] ?? null;
  const dateDebutIdx = colIdx['DateDebutContrat'] ?? colIdx['datedebutcontrat'] ?? null;
  const dureeMoisIdx = colIdx['DureeContrat'] ?? colIdx['dureecontrat'] ?? null;
  const dateEcheanceIdx = colIdx['DateAnniversaire'] ?? colIdx['dateanniversaire'] ?? null;
  const dateDebutFactIdx = colIdx['DateDebutFact'] ?? colIdx['datedebutfact'] ?? null;
  const frequenceIdx = colIdx['FrequenceFacturation'] ?? colIdx['frequencefacturation'] ?? null;
  const termeIdx = colIdx['TermeFacturation'] ?? colIdx['termefacturation'] ?? null;
  const ftcIdx = colIdx['FTC'] ?? colIdx['ftc'] ?? null;
  const totalAccessoireIdx = colIdx['TOTAL_ACCESOIRE'] ?? colIdx['total_accesoire'] ?? null;
  const augmentationIdx = colIdx['Augmentation'] ?? colIdx['augmentation'] ?? null;
  const adresseIdx = colIdx['Adresse'] ?? colIdx['adresse'] ?? null;
  const cpIdx = colIdx['CP'] ?? colIdx['cp'] ?? null;
  const villeIdx = colIdx['Ville'] ?? colIdx['ville'] ?? null;
  const emailIdx = colIdx['Email'] ?? colIdx['email'] ?? null;
  const ibanIdx = colIdx['IBAN'] ?? colIdx['iban'] ?? null;
  const bicIdx = colIdx['BIC'] ?? colIdx['bic'] ?? null;

  const clientRes = await query(
    'SELECT id, numero_client, raison_sociale FROM clients',
  );
  const clientMap = buildNormalizedClientMap(clientRes.rows);

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const seenContrats = new Set();

    for (let idx = 0; idx < dataRows.length; idx++) {
      const row = dataRows[idx];
      const rowNum = idx + 2;
      const numContrat = String(row[numContratIdx] || '').trim();
      const codeClient = String(row[codeClientIdx] || '').trim();
      if (!numContrat) continue;

      if (IMPORT_EXCLUDED_CONTRACTS.includes(numContrat)) {
        rapport.exclus_incoherence++;
        continue;
      }

      if (seenContrats.has(numContrat)) {
        rapport.doublons_ignores++;
        continue;
      }
      seenContrats.add(numContrat);

      const clientInfo = findClientByCode(clientMap, codeClient);
      if (!clientInfo) {
        rapport.client_manquant++;
        rapport.erreurs.push({ ligne: rowNum, message: `Client introuvable : ${codeClient} (contrat ${numContrat})` });
        continue;
      }

      // Upsert : si le contrat existe déjà, on met à jour et on recrée les lignes
      const dupRes = await dbClient.query(
        'SELECT id FROM contrats WHERE numero_contrat = $1',
        [numContrat],
      );
      if (dupRes.rows.length > 0) {
        const oldId = dupRes.rows[0].id;
        await dbClient.query('DELETE FROM contrat_lignes WHERE contrat_id = $1', [oldId]);
        await dbClient.query('DELETE FROM contrat_machines WHERE contrat_id = $1', [oldId]);
        await dbClient.query('DELETE FROM contrats WHERE id = $1', [oldId]);
      }

      const activiteRaw = activiteIdx != null ? String(row[activiteIdx] || '').trim() : '1';
      const statut = IMPORT_STATUS_MAP[activiteRaw] || 'Actif';
      const periodicite = frequenceIdx != null ? parsePeriodicity(row[frequenceIdx]) : 'Mensuel';
      const ftcMontant = ftcIdx != null ? parseNumber(row[ftcIdx]) : 0;
      const augmentation = augmentationIdx != null ? parseNumber(row[augmentationIdx]) : 0;
      const terme = termeIdx != null ? parseTerm(row[termeIdx]) : null;

      const dateDebut = parseExcelDate(dateDebutIdx != null ? row[dateDebutIdx] : null)
        || parseExcelDate(dateSignatureIdx != null ? row[dateSignatureIdx] : null)
        || new Date().toISOString().split('T')[0];

      const notes = [
        augmentation > 0 ? `Augmentation: ${augmentation}%` : '',
        terme ? `Terme facturation: ${terme}` : '',
        totalAccessoireIdx != null && parseNumber(row[totalAccessoireIdx]) > 0 ? `Total accessoire: ${parseNumber(row[totalAccessoireIdx])}€ HT` : '',
        adresseIdx != null && row[adresseIdx] ? `Adresse: ${String(row[adresseIdx]).trim()}${cpIdx != null ? ' ' + String(row[cpIdx] || '').trim() : ''}${villeIdx != null ? ' ' + String(row[villeIdx] || '').trim() : ''}` : '',
        ibanIdx != null && row[ibanIdx] ? `IBAN: ${String(row[ibanIdx]).trim()}` : '',
        bicIdx != null && row[bicIdx] ? `BIC: ${String(row[bicIdx]).trim()}` : '',
        emailIdx != null && row[emailIdx] ? `Email: ${String(row[emailIdx]).trim()}` : '',
      ].filter(Boolean).join('\n') || null;

      const contratRes = await dbClient.query(
        `INSERT INTO contrats (
          numero_contrat, type_contrat, type_facturation, client_id, periodicite,
          date_signature, date_debut, date_echeance, date_renouvellement,
          date_prochaine_facture, duree_contrat_mois, statut, ftc, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING id`,
        [
          numContrat,
          typeContrat,
          'Periodique',
          clientInfo.id,
          periodicite,
          parseExcelDate(dateSignatureIdx != null ? row[dateSignatureIdx] : null),
          dateDebut,
          parseExcelDate(dateEcheanceIdx != null ? row[dateEcheanceIdx] : null),
          null,
          '2026-06-01',
          dureeMoisIdx != null && row[dureeMoisIdx] ? parseInt(row[dureeMoisIdx]) || null : null,
          statut,
          ftcMontant,
          notes,
        ],
      );

      const contratId = contratRes.rows[0].id;
      let ordre = 0;

      // Rubriques sécurité/informatique depuis les colonnes du fichier
      for (const rub of INFORMATIQUE_RUBRIQUE_MAP) {
        const mtIdx2 = colIdx[rub.mtCol] ?? colIdx[rub.mtCol.toLowerCase()];
        const libIdx = rub.libCol ? (colIdx[rub.libCol] ?? colIdx[rub.libCol.toLowerCase()]) : null;
        const qteIdx = rub.qteCol ? (colIdx[rub.qteCol] ?? colIdx[rub.qteCol.toLowerCase()]) : null;
        const puIdx = rub.puCol ? (colIdx[rub.puCol] ?? colIdx[rub.puCol.toLowerCase()]) : null;

        const mt = mtIdx2 != null ? parseNumber(row[mtIdx2]) : 0;
        const lib = libIdx != null ? String(row[libIdx] || '').trim() : '';

        if (mt > 0 || lib) {
          const qte = qteIdx != null ? (parseNumber(row[qteIdx]) || 1) : 1;
          const pu = puIdx != null ? parseNumber(row[puIdx]) : mt;
          const designation = lib || rub.categorie;

          await dbClient.query(
            `INSERT INTO contrat_lignes (contrat_id, ordre, categorie_ligne, designation, quantite, prix_unitaire_ht, taux_tva, actif, inclus_abonnement)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [contratId, ordre++, rub.categorie, designation, qte, pu, 20, true, true],
          );
          rapport.lignes_abonnement_creees++;
        }
      }

      // Lignes logiciels depuis le fichier secondaire
      const logiciels = logicielsMap[numContrat] || [];
      for (const lic of logiciels) {
        await dbClient.query(
          `INSERT INTO contrat_lignes (contrat_id, ordre, categorie_ligne, designation, quantite, prix_unitaire_ht, taux_tva, actif, inclus_abonnement)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [contratId, ordre++, 'Logiciel / Licence', lic.designation, lic.quantite, lic.prix_unitaire_ht, 20, true, lic.inclus_abonnement],
        );
        rapport.lignes_logiciels_creees = (rapport.lignes_logiciels_creees || 0) + 1;
      }

      if (ftcMontant > 0) {
        await dbClient.query(
          `INSERT INTO contrat_lignes (contrat_id, ordre, categorie_ligne, designation, quantite, prix_unitaire_ht, taux_tva, actif, inclus_abonnement)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [contratId, ordre++, 'Autre', 'FTC', 1, ftcMontant, 20, true, false],
        );
        rapport.lignes_ftc_creees++;
      }

      rapport.contrats_crees++;
    }

    await dbClient.query('COMMIT');
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Import format B (ligne par rubrique, groupé par numéro contrat)
// ---------------------------------------------------------------------------

async function importFormatB(dataRows, headers, typeContrat, rapport) {
  const colMap = buildColumnMapping(headers);
  const codeClientIdx = colMap.code_client ?? 1;
  const numContratIdx = colMap.numero_contrat ?? 2;
  const activiteIdx = colMap.activite ?? 3;
  const categorieIdx = colMap.categorie_ligne;
  const prixIdx = colMap.prix_unitaire_ht;
  const montantIdx = colMap.montant_ht;
  const quantiteIdx = colMap.quantite;
  const designationIdx = colMap.designation;
  const ftcIdx = colMap.ftc;
  const dateSignatureIdx = colMap.date_signature ?? 4;
  const dateDebutIdx = colMap.date_debut ?? 36;
  const dateEcheanceIdx = colMap.date_echeance ?? 10;
  const renouvellementIdx = colMap.renouvellement_annuel ?? 5;
  const prochaineFactIdx = colMap.prochaine_facturation ?? 7;
  const dureeMoisIdx = colMap.duree_mois ?? 11;
  const frequenceIdx = colMap.frequence_facturation ?? 31;
  const termeIdx = colMap.terme_facturation ?? 32;
  const augmentationIdx = colMap.pourcentage_augmentation ?? 30;

  const groupedByContrat = {};
  for (const row of dataRows) {
    const numContrat = String(row[numContratIdx] || '').trim();
    if (!numContrat) continue;
    if (!groupedByContrat[numContrat]) groupedByContrat[numContrat] = [];
    groupedByContrat[numContrat].push(row);
  }

  const clientRes = await query(
    'SELECT id, numero_client, raison_sociale FROM clients',
  );
  const clientMap = buildNormalizedClientMap(clientRes.rows);

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    for (const [numContrat, groupRows] of Object.entries(groupedByContrat)) {
      const firstRow = groupRows[0];
      const codeClient = String(firstRow[codeClientIdx] || '').trim();
      const activite = String(firstRow[activiteIdx] || '').trim();

      if (IMPORT_EXCLUDED_CONTRACTS.includes(numContrat)) {
        rapport.exclus_incoherence++;
        continue;
      }
      if (IMPORT_MISSING_CLIENTS.includes(codeClient)) {
        rapport.client_manquant++;
        continue;
      }

      const clientInfo = findClientByCode(clientMap, codeClient);
      if (!clientInfo) {
        rapport.client_manquant++;
        rapport.erreurs.push({ ligne: 0, message: `Client introuvable : ${codeClient} (contrat ${numContrat})` });
        continue;
      }

      // Upsert : supprimer l'ancien contrat s'il existe pour le recréer
      const dupRes = await dbClient.query(
        'SELECT id FROM contrats WHERE numero_contrat = $1',
        [numContrat],
      );
      if (dupRes.rows.length > 0) {
        const oldId = dupRes.rows[0].id;
        await dbClient.query('DELETE FROM contrat_lignes WHERE contrat_id = $1', [oldId]);
        await dbClient.query('DELETE FROM contrat_machines WHERE contrat_id = $1', [oldId]);
        await dbClient.query('DELETE FROM contrats WHERE id = $1', [oldId]);
      }

      const statut = IMPORT_STATUS_MAP[activite] || 'Actif';
      const periodicite = parsePeriodicity(firstRow[frequenceIdx]);
      const typeFacturation = parseTerm(firstRow[termeIdx]);
      const pourcentageAugm = parseNumber(firstRow[augmentationIdx]);
      const ftcMontant = ftcIdx != null ? parseNumber(firstRow[ftcIdx]) : 0;

      const contratRes = await dbClient.query(
        `INSERT INTO contrats (
          numero_contrat, type_contrat, type_facturation, client_id, periodicite,
          date_signature, date_debut, date_echeance, date_renouvellement,
          date_prochaine_facture, duree_contrat_mois, statut, ftc, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING id`,
        [
          numContrat,
          typeContrat,
          'Periodique',
          clientInfo.id,
          periodicite,
          parseExcelDate(firstRow[dateSignatureIdx]),
          parseExcelDate(firstRow[dateDebutIdx]) || parseExcelDate(firstRow[dateSignatureIdx]) || new Date().toISOString().split('T')[0],
          parseExcelDate(firstRow[dateEcheanceIdx]),
          parseExcelDate(firstRow[renouvellementIdx]),
          parseExcelDate(firstRow[prochaineFactIdx]),
          firstRow[dureeMoisIdx] ? parseInt(firstRow[dureeMoisIdx]) || null : null,
          statut,
          ftcMontant,
          [
            pourcentageAugm > 0 ? `Augmentation: ${pourcentageAugm}%` : '',
            typeFacturation ? `Terme facturation: ${typeFacturation}` : '',
          ].filter(Boolean).join('\n') || null,
        ],
      );

      const contratId = contratRes.rows[0].id;
      let ordre = 0;

      for (const row of groupRows) {
        const prixUnitaire = prixIdx != null ? parseNumber(row[prixIdx]) : 0;
        const quantite = quantiteIdx != null ? (parseInt(row[quantiteIdx]) || 1) : 1;
        const designation = designationIdx != null ? (String(row[designationIdx] || '').trim()) : '';
        const categorie = normalizeCategorie(categorieIdx != null ? row[categorieIdx] : null, typeContrat);

        await dbClient.query(
          `INSERT INTO contrat_lignes (contrat_id, ordre, categorie_ligne, designation, quantite, prix_unitaire_ht, taux_tva, actif)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [contratId, ordre++, categorie, designation || categorie, quantite, prixUnitaire, 20, true],
        );
        rapport.lignes_abonnement_creees++;
      }

      if (ftcMontant > 0) {
        await dbClient.query(
          `INSERT INTO contrat_lignes (contrat_id, ordre, categorie_ligne, designation, quantite, prix_unitaire_ht, taux_tva, actif)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [contratId, ordre++, 'Hors Forfait', 'FTC', 1, ftcMontant, 20, true],
        );
        rapport.lignes_ftc_creees++;
      }

      rapport.contrats_crees++;
    }

    await dbClient.query('COMMIT');
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Import format flags (une ligne = un contrat, flags 0/1 pour rubriques)
// ---------------------------------------------------------------------------

async function importFormatFlags(dataRows, typeContrat, rapport) {
  const clientRes = await query(
    'SELECT id, numero_client, raison_sociale FROM clients',
  );
  const clientMap = buildNormalizedClientMap(clientRes.rows);

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    for (let idx = 0; idx < dataRows.length; idx++) {
      const row = dataRows[idx];
      const rowNum = idx + 2;
      const codeClient = String(row[1] || '').trim();
      const numContrat = String(row[2] || '').trim();
      const activite = String(row[3] || '').trim();

      if (IMPORT_EXCLUDED_CONTRACTS.includes(numContrat)) {
        rapport.exclus_incoherence++;
        continue;
      }
      if (IMPORT_MISSING_CLIENTS.includes(codeClient)) {
        rapport.client_manquant++;
        continue;
      }

      const clientInfo = findClientByCode(clientMap, codeClient);
      if (!clientInfo) {
        rapport.client_manquant++;
        rapport.erreurs.push({ ligne: rowNum, message: `Client introuvable : ${codeClient}` });
        continue;
      }

      // Upsert : supprimer l'ancien contrat s'il existe pour le recréer
      const dupRes = await dbClient.query(
        'SELECT id FROM contrats WHERE numero_contrat = $1',
        [numContrat],
      );
      if (dupRes.rows.length > 0) {
        const oldId = dupRes.rows[0].id;
        await dbClient.query('DELETE FROM contrat_lignes WHERE contrat_id = $1', [oldId]);
        await dbClient.query('DELETE FROM contrat_machines WHERE contrat_id = $1', [oldId]);
        await dbClient.query('DELETE FROM contrats WHERE id = $1', [oldId]);
      }

      const statut = IMPORT_STATUS_MAP[activite] || 'Actif';
      const periodicite = parsePeriodicity(row[31]);
      const typeFacturation = parseTerm(row[32]);
      const montantAbonnement = parseNumber(row[12]);
      const montantMateriel = parseNumber(row[13]);
      const montantLogiciel = parseNumber(row[14]);
      const pourcentageAugm = parseNumber(row[30]);
      const ftcMontant = parseNumber(row[33]);
      const iban = String(row[34] || '').trim() || null;
      const email = String(row[35] || '').trim() || null;

      const contratRes = await dbClient.query(
        `INSERT INTO contrats (
          numero_contrat, type_contrat, type_facturation, client_id, periodicite,
          date_signature, date_debut, date_echeance, date_renouvellement,
          date_prochaine_facture, duree_contrat_mois, statut,
          numero_dossier_financement, organisme_credit, montant_finance, loyer_ht,
          ftc, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        RETURNING id`,
        [
          numContrat,
          typeContrat,
          'Periodique',
          clientInfo.id,
          periodicite,
          parseExcelDate(row[4]),
          parseExcelDate(row[36]) || parseExcelDate(row[4]) || new Date().toISOString().split('T')[0],
          parseExcelDate(row[10]),
          parseExcelDate(row[5]),
          parseExcelDate(row[7]),
          row[11] ? parseInt(row[11]) || null : null,
          statut,
          String(row[16] || '').trim() || null,
          String(row[17] || '').trim() || null,
          parseNumber(row[18]),
          parseNumber(row[19]),
          ftcMontant,
          [
            montantAbonnement > 0 ? `Montant abonnement total: ${montantAbonnement}€ HT` : '',
            montantMateriel > 0 ? `Montant matériel: ${montantMateriel}€ HT` : '',
            montantLogiciel > 0 ? `Montant logiciel: ${montantLogiciel}€ HT` : '',
            pourcentageAugm > 0 ? `Augmentation: ${pourcentageAugm}%` : '',
            row[9] ? `Adresse site: ${String(row[9]).trim()}` : '',
            row[23] ? `Prochaine visite: ${String(row[23]).trim()}` : '',
            iban ? `IBAN: ${iban}` : '',
            email ? `Email facturation: ${email}` : '',
            typeFacturation ? `Terme facturation: ${typeFacturation}` : '',
          ].filter(Boolean).join('\n') || null,
        ],
      );

      const contratId = contratRes.rows[0].id;
      let ordre = 0;

      for (const rub of TELEPHONIE_RUBRIQUE_MAP) {
        const val = parseNumber(row[rub.colIndex]);
        if (val === 1) {
          await dbClient.query(
            `INSERT INTO contrat_lignes (contrat_id, ordre, categorie_ligne, designation, quantite, prix_unitaire_ht, taux_tva, actif)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [contratId, ordre++, rub.categorie, rub.categorie, 1, 0, 20, true],
          );
          rapport.lignes_abonnement_creees++;
        }
      }

      if (ftcMontant > 0) {
        await dbClient.query(
          `INSERT INTO contrat_lignes (contrat_id, ordre, categorie_ligne, designation, quantite, prix_unitaire_ht, taux_tva, actif)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [contratId, ordre++, 'Hors Forfait', 'FTC', 1, ftcMontant, 20, true],
        );
        rapport.lignes_ftc_creees++;
      }

      rapport.contrats_crees++;
    }

    await dbClient.query('COMMIT');
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function ensureContratExists(contratId) {
  const result = await query('SELECT id FROM contrats WHERE id = $1 AND deleted_at IS NULL', [contratId]);
  if (result.rows.length === 0) throw ApiError.notFound('Contrat non trouvé');
}
