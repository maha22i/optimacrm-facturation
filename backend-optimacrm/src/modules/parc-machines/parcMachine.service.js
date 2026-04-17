import { query, pool } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const MACHINE_FIELDS = `
  pm.id, pm.numero_serie, pm.matricule, pm.designation, pm.marque, pm.modele,
  pm.categorie, pm.reference_produit, pm.client_id, pm.site_installation,
  pm.contrat_id, pm.numero_contrat,
  pm.date_installation, pm.date_fin_garantie, pm.date_retrait,
  pm.statut,
  pm.dernier_compteur_nb, pm.dernier_compteur_couleur, pm.date_dernier_releve,
  pm.cout_copie_nb, pm.cout_copie_couleur, pm.volume_offert_nb, pm.volume_offert_couleur,
  pm.vitesse_ppm, pm.format_max, pm.recto_verso, pm.reseau,
  pm.type_equipement_tel, pm.nb_postes, pm.protocole,
  pm.type_equipement_info, pm.processeur, pm.ram, pm.stockage, pm.systeme_exploitation,
  pm.notes, pm.created_at, pm.updated_at
`;

const ALLOWED_UPDATE_FIELDS = [
  'numero_serie', 'matricule', 'designation', 'marque', 'modele', 'categorie',
  'reference_produit', 'client_id', 'site_installation', 'contrat_id', 'numero_contrat',
  'date_installation', 'date_fin_garantie', 'date_retrait', 'statut',
  'cout_copie_nb', 'cout_copie_couleur', 'volume_offert_nb', 'volume_offert_couleur',
  'vitesse_ppm', 'format_max', 'recto_verso', 'reseau',
  'type_equipement_tel', 'nb_postes', 'protocole',
  'type_equipement_info', 'processeur', 'ram', 'stockage', 'systeme_exploitation',
  'notes',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
// PARC MACHINES — CRUD
// ---------------------------------------------------------------------------

export async function listMachines({ page = 1, limit = 20, search, categorie, statut, client_id, alerte_compteur, sort = 'pm.created_at', order = 'DESC' }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let i = 1;

  if (categorie) {
    conditions.push(`pm.categorie = $${i++}`);
    params.push(categorie);
  }
  if (statut) {
    conditions.push(`pm.statut = $${i++}`);
    params.push(statut);
  }
  if (client_id) {
    conditions.push(`pm.client_id = $${i++}`);
    params.push(parseInt(client_id));
  }
  if (alerte_compteur === 'true' || alerte_compteur === true) {
    conditions.push(`pm.categorie = 'Copieur' AND pm.statut = 'En service' AND (pm.date_dernier_releve IS NULL OR pm.date_dernier_releve < NOW() - INTERVAL '90 days')`);
  }
  if (search) {
    conditions.push(`(
      pm.numero_serie ILIKE $${i} OR
      pm.designation ILIKE $${i} OR
      pm.marque ILIKE $${i} OR
      pm.modele ILIKE $${i} OR
      cl.raison_sociale ILIKE $${i}
    )`);
    params.push(`%${search}%`);
    i++;
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const allowedSorts = ['pm.created_at', 'pm.numero_serie', 'pm.designation', 'pm.statut', 'pm.categorie', 'pm.date_dernier_releve'];
  const safeSort = allowedSorts.includes(sort) ? sort : 'pm.created_at';
  const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const countResult = await query(
    `SELECT COUNT(*) FROM parc_machines pm LEFT JOIN clients cl ON pm.client_id = cl.id ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0].count);

  const dataParams = [...params, limit, offset];
  const result = await query(
    `SELECT ${MACHINE_FIELDS},
            cl.raison_sociale AS client_raison_sociale,
            cl.numero_client AS client_code
     FROM parc_machines pm
     LEFT JOIN clients cl ON pm.client_id = cl.id
     ${where}
     ORDER BY ${safeSort} ${safeOrder}
     LIMIT $${i++} OFFSET $${i++}`,
    dataParams,
  );

  return {
    machines: result.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

export async function getMachineById(id) {
  const result = await query(
    `SELECT ${MACHINE_FIELDS},
            cl.raison_sociale AS client_raison_sociale,
            cl.numero_client AS client_code,
            cl.email_principal AS client_email,
            cl.telephone_principal AS client_telephone
     FROM parc_machines pm
     LEFT JOIN clients cl ON pm.client_id = cl.id
     WHERE pm.id = $1`,
    [id],
  );
  if (result.rows.length === 0) throw ApiError.notFound('Machine non trouvée');

  const machine = result.rows[0];

  const relevesResult = await query(
    `SELECT * FROM releves_compteurs WHERE machine_id = $1 ORDER BY date_releve DESC LIMIT 5`,
    [id],
  );
  machine.derniers_releves = relevesResult.rows;

  if (machine.client_id) {
    const countResult = await query(
      'SELECT COUNT(*) FROM parc_machines WHERE client_id = $1',
      [machine.client_id],
    );
    machine.client_nb_machines = parseInt(countResult.rows[0].count);
  }

  if (machine.numero_contrat) {
    const contratResult = await query(
      `SELECT id, numero_contrat, type_contrat, statut, date_echeance, loyer_ht
       FROM contrats WHERE numero_contrat = $1 AND deleted_at IS NULL LIMIT 1`,
      [machine.numero_contrat],
    );
    machine.contrat_detail = contratResult.rows[0] || null;
  }

  return machine;
}

export async function getMachinesByClient(clientId) {
  const result = await query(
    `SELECT ${MACHINE_FIELDS}
     FROM parc_machines pm
     LEFT JOIN clients cl ON pm.client_id = cl.id
     WHERE pm.client_id = $1
     ORDER BY pm.designation`,
    [clientId],
  );
  return result.rows;
}

export async function createMachine(data) {
  const existing = await query('SELECT id FROM parc_machines WHERE numero_serie = $1', [data.numero_serie]);
  if (existing.rows.length > 0) throw ApiError.conflict(`Le numéro de série "${data.numero_serie}" existe déjà`);

  if (data.client_id) {
    const client = await query('SELECT id FROM clients WHERE id = $1', [data.client_id]);
    if (client.rows.length === 0) throw ApiError.notFound('Client non trouvé');
  }

  const result = await query(
    `INSERT INTO parc_machines (
      numero_serie, matricule, designation, marque, modele, categorie, reference_produit,
      client_id, site_installation, contrat_id, numero_contrat,
      date_installation, date_fin_garantie, date_retrait, statut,
      vitesse_ppm, format_max, recto_verso, reseau,
      type_equipement_tel, nb_postes, protocole,
      type_equipement_info, processeur, ram, stockage, systeme_exploitation,
      notes
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
    ) RETURNING *`,
    [
      data.numero_serie, data.matricule || null, data.designation,
      data.marque || null, data.modele || null, data.categorie || 'Copieur',
      data.reference_produit || null,
      data.client_id || null, data.site_installation || null,
      data.contrat_id || null, data.numero_contrat || null,
      data.date_installation || null, data.date_fin_garantie || null, data.date_retrait || null,
      data.statut || 'En service',
      data.vitesse_ppm || null, data.format_max || null,
      data.recto_verso ?? true, data.reseau ?? true,
      data.type_equipement_tel || null, data.nb_postes || null, data.protocole || null,
      data.type_equipement_info || null, data.processeur || null,
      data.ram || null, data.stockage || null, data.systeme_exploitation || null,
      data.notes || null,
    ],
  );
  return result.rows[0];
}

export async function updateMachine(id, data) {
  const existing = await query('SELECT id FROM parc_machines WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Machine non trouvée');

  if (data.numero_serie) {
    const dup = await query('SELECT id FROM parc_machines WHERE numero_serie = $1 AND id != $2', [data.numero_serie, id]);
    if (dup.rows.length > 0) throw ApiError.conflict(`Le numéro de série "${data.numero_serie}" est déjà utilisé`);
  }

  const { sets, vals, nextIndex } = buildUpdateQuery(data, ALLOWED_UPDATE_FIELDS);
  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  sets.push(`updated_at = NOW()`);
  vals.push(id);

  const result = await query(
    `UPDATE parc_machines SET ${sets.join(', ')} WHERE id = $${nextIndex} RETURNING *`,
    vals,
  );
  return result.rows[0];
}

export async function deleteMachine(id) {
  const existing = await query('SELECT id FROM parc_machines WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Machine non trouvée');
  await query('DELETE FROM parc_machines WHERE id = $1', [id]);
  return { id };
}

export async function duplicateMachine(id) {
  const machine = await getMachineById(id);
  delete machine.derniers_releves;
  delete machine.client_nb_machines;
  delete machine.contrat_detail;
  delete machine.client_raison_sociale;
  delete machine.client_code;
  delete machine.client_email;
  delete machine.client_telephone;

  const newData = {
    ...machine,
    numero_serie: machine.numero_serie + '-COPIE',
    dernier_compteur_nb: 0,
    dernier_compteur_couleur: 0,
    date_dernier_releve: null,
  };
  delete newData.id;
  delete newData.created_at;
  delete newData.updated_at;

  return createMachine(newData);
}

// ---------------------------------------------------------------------------
// STATS
// ---------------------------------------------------------------------------

export async function getStats() {
  const totalResult = await query('SELECT COUNT(*) FROM parc_machines');
  const total = parseInt(totalResult.rows[0].count);

  const statutResult = await query(
    `SELECT statut, COUNT(*)::int AS count FROM parc_machines GROUP BY statut`,
  );
  const statutMap = {};
  for (const row of statutResult.rows) statutMap[row.statut] = row.count;

  const catResult = await query(
    `SELECT categorie, COUNT(*)::int AS count FROM parc_machines GROUP BY categorie`,
  );
  const parCategorie = {};
  for (const row of catResult.rows) parCategorie[row.categorie] = row.count;

  const alerteResult = await query(
    `SELECT COUNT(*)::int AS count FROM parc_machines
     WHERE categorie = 'Copieur'
       AND statut = 'En service'
       AND (date_dernier_releve IS NULL OR date_dernier_releve < NOW() - INTERVAL '90 days')`,
  );

  return {
    total,
    en_service: statutMap['En service'] || 0,
    en_stock: statutMap['En stock'] || 0,
    en_sav: statutMap['En SAV'] || 0,
    hors_service: statutMap['Hors service'] || 0,
    retourne: statutMap['Retourné'] || 0,
    par_categorie: parCategorie,
    alertes_compteurs: alerteResult.rows[0].count,
  };
}

// ---------------------------------------------------------------------------
// RELEVÉS COMPTEURS
// ---------------------------------------------------------------------------

export async function listReleves(machineId, { page = 1, limit = 50 } = {}) {
  const machine = await query('SELECT id, categorie FROM parc_machines WHERE id = $1', [machineId]);
  if (machine.rows.length === 0) throw ApiError.notFound('Machine non trouvée');

  const offset = (page - 1) * limit;
  const countResult = await query('SELECT COUNT(*) FROM releves_compteurs WHERE machine_id = $1', [machineId]);
  const total = parseInt(countResult.rows[0].count);

  const result = await query(
    `SELECT * FROM releves_compteurs WHERE machine_id = $1 ORDER BY date_releve DESC, id DESC LIMIT $2 OFFSET $3`,
    [machineId, limit, offset],
  );

  return {
    releves: result.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
  };
}

export async function createReleve(machineId, data) {
  const machine = await query('SELECT * FROM parc_machines WHERE id = $1', [machineId]);
  if (machine.rows.length === 0) throw ApiError.notFound('Machine non trouvée');

  const m = machine.rows[0];
  const compteur_nb = parseInt(data.compteur_nb) || 0;
  const compteur_couleur = parseInt(data.compteur_couleur) || 0;

  const lastReleve = await query(
    'SELECT * FROM releves_compteurs WHERE machine_id = $1 ORDER BY date_releve DESC, id DESC LIMIT 1',
    [machineId],
  );

  let volume_nb = 0;
  let volume_couleur = 0;

  if (lastReleve.rows.length > 0) {
    const prev = lastReleve.rows[0];
    volume_nb = compteur_nb - (prev.compteur_nb || 0);
    volume_couleur = compteur_couleur - (prev.compteur_couleur || 0);

    if (volume_nb < 0) {
      throw ApiError.badRequest(`Le compteur N/B (${compteur_nb}) ne peut pas être inférieur au relevé précédent (${prev.compteur_nb})`);
    }
    if (volume_couleur < 0) {
      throw ApiError.badRequest(`Le compteur Couleur (${compteur_couleur}) ne peut pas être inférieur au relevé précédent (${prev.compteur_couleur})`);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO releves_compteurs (
        machine_id, date_releve, date_debut_periode, date_fin_periode,
        compteur_nb, compteur_couleur, volume_nb, volume_couleur,
        source, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        machineId,
        data.date_releve,
        data.date_debut_periode || null,
        data.date_fin_periode || null,
        compteur_nb, compteur_couleur,
        volume_nb, volume_couleur,
        data.source || 'Manuel',
        data.notes || null,
      ],
    );

    await client.query(
      `UPDATE parc_machines
       SET dernier_compteur_nb = $1, dernier_compteur_couleur = $2, date_dernier_releve = $3, updated_at = NOW()
       WHERE id = $4`,
      [compteur_nb, compteur_couleur, data.date_releve, machineId],
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateReleve(machineId, releveId, data) {
  const machine = await query('SELECT id FROM parc_machines WHERE id = $1', [machineId]);
  if (machine.rows.length === 0) throw ApiError.notFound('Machine non trouvée');

  const releve = await query('SELECT * FROM releves_compteurs WHERE id = $1 AND machine_id = $2', [releveId, machineId]);
  if (releve.rows.length === 0) throw ApiError.notFound('Relevé non trouvé');

  const sets = [];
  const vals = [];
  let idx = 1;
  const allowed = ['date_releve', 'date_debut_periode', 'date_fin_periode', 'compteur_nb', 'compteur_couleur', 'notes'];

  for (const field of allowed) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${idx++}`);
      vals.push(data[field]);
    }
  }

  if (data.compteur_nb !== undefined || data.compteur_couleur !== undefined) {
    const compteur_nb = data.compteur_nb ?? releve.rows[0].compteur_nb;
    const compteur_couleur = data.compteur_couleur ?? releve.rows[0].compteur_couleur;

    const prevReleve = await query(
      'SELECT * FROM releves_compteurs WHERE machine_id = $1 AND date_releve < $2 ORDER BY date_releve DESC, id DESC LIMIT 1',
      [machineId, releve.rows[0].date_releve],
    );

    let volume_nb = compteur_nb;
    let volume_couleur = compteur_couleur;
    if (prevReleve.rows.length > 0) {
      volume_nb = compteur_nb - (prevReleve.rows[0].compteur_nb || 0);
      volume_couleur = compteur_couleur - (prevReleve.rows[0].compteur_couleur || 0);
    }

    sets.push(`volume_nb = $${idx++}`);
    vals.push(volume_nb);
    sets.push(`volume_couleur = $${idx++}`);
    vals.push(volume_couleur);
  }

  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  vals.push(releveId);
  const result = await query(
    `UPDATE releves_compteurs SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals,
  );

  await refreshMachineCounters(machineId);
  return result.rows[0];
}

export async function deleteReleve(machineId, releveId) {
  const releve = await query('SELECT id FROM releves_compteurs WHERE id = $1 AND machine_id = $2', [releveId, machineId]);
  if (releve.rows.length === 0) throw ApiError.notFound('Relevé non trouvé');

  await query('DELETE FROM releves_compteurs WHERE id = $1', [releveId]);
  await refreshMachineCounters(machineId);
  return { id: releveId };
}

async function refreshMachineCounters(machineId) {
  const latest = await query(
    'SELECT compteur_nb, compteur_couleur, date_releve FROM releves_compteurs WHERE machine_id = $1 ORDER BY date_releve DESC, id DESC LIMIT 1',
    [machineId],
  );

  if (latest.rows.length > 0) {
    const r = latest.rows[0];
    await query(
      `UPDATE parc_machines SET dernier_compteur_nb = $1, dernier_compteur_couleur = $2, date_dernier_releve = $3, updated_at = NOW() WHERE id = $4`,
      [r.compteur_nb, r.compteur_couleur, r.date_releve, machineId],
    );
  } else {
    await query(
      `UPDATE parc_machines SET dernier_compteur_nb = 0, dernier_compteur_couleur = 0, date_dernier_releve = NULL, updated_at = NOW() WHERE id = $1`,
      [machineId],
    );
  }
}

export async function checkNumeroSerieExists(numeroSerie, excludeId) {
  const params = [numeroSerie];
  let sql = 'SELECT id FROM parc_machines WHERE numero_serie = $1';
  if (excludeId) {
    sql += ' AND id != $2';
    params.push(excludeId);
  }
  const result = await query(sql, params);
  return result.rows.length > 0;
}
