import { query, pool, getClient } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

// ---------------------------------------------------------------------------
// Numérotation AV-<année>-<seq>
// ---------------------------------------------------------------------------

async function generateNumeroAvoir(dbClient) {
  const year = new Date().getFullYear();
  const { rows } = await dbClient.query(
    `SELECT COUNT(*) AS cnt FROM avoirs WHERE numero LIKE $1`,
    [`AV-${year}-%`]
  );
  const seq = parseInt(rows[0].cnt) + 1;
  const numero = `AV-${year}-${String(seq).padStart(4, '0')}`;
  
  const { rows: existing } = await dbClient.query(
    'SELECT id FROM avoirs WHERE numero = $1', [numero]
  );
  if (existing.length > 0) {
    return `AV-${year}-${String(seq + 1).padStart(4, '0')}`;
  }
  return numero;
}

// ---------------------------------------------------------------------------
// Calculs
// ---------------------------------------------------------------------------

function calculerTotauxAvoir(lignes) {
  let totalHt = 0;
  let totalTva = 0;

  for (const l of lignes) {
    const qte = parseFloat(l.quantite) || 0;
    const pu = parseFloat(l.prix_unitaire_ht) || 0;
    const taux = parseFloat(l.taux_tva) || 20;
    const ht = Math.round(qte * pu * 100) / 100;
    const tva = Math.round(ht * (taux / 100) * 100) / 100;
    totalHt += ht;
    totalTva += tva;
  }

  totalHt = Math.round(totalHt * 100) / 100;
  totalTva = Math.round(totalTva * 100) / 100;
  const totalTtc = Math.round((totalHt + totalTva) * 100) / 100;

  return { montant_ht: totalHt, montant_tva: totalTva, montant_ttc: totalTtc };
}

async function getResteAvoirable(dbClient, factureId) {
  const { rows: [facture] } = await dbClient.query(
    'SELECT total_ttc FROM factures WHERE id = $1', [factureId]
  );
  if (!facture) throw new ApiError(404, 'Facture introuvable');

  const { rows: [sum] } = await dbClient.query(
    `SELECT COALESCE(SUM(montant_ttc), 0) AS total_avoirs
     FROM avoirs WHERE facture_id = $1 AND statut != 'Annulé'`,
    [factureId]
  );

  const factureTtc = parseFloat(facture.total_ttc);
  const totalAvoirs = parseFloat(sum.total_avoirs);
  return {
    facture_ttc: factureTtc,
    total_avoirs_existants: totalAvoirs,
    reste_avoirable: Math.round((factureTtc - totalAvoirs) * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Liste avoirs
// ---------------------------------------------------------------------------

export async function listAvoirs({ page = 1, limit = 10, statut, client_id, date_debut, date_fin, search }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let idx = 1;

  if (statut) { conditions.push(`a.statut = $${idx++}`); params.push(statut); }
  if (client_id) { conditions.push(`a.client_id = $${idx++}`); params.push(client_id); }
  if (date_debut) { conditions.push(`a.date_avoir >= $${idx++}`); params.push(date_debut); }
  if (date_fin) { conditions.push(`a.date_avoir <= $${idx++}`); params.push(date_fin); }
  if (search) {
    conditions.push(`(a.numero ILIKE $${idx} OR c.raison_sociale ILIKE $${idx} OR f.numero_facture ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countRes = await query(`SELECT COUNT(*) FROM avoirs a LEFT JOIN clients c ON c.id = a.client_id LEFT JOIN factures f ON f.id = a.facture_id ${where}`, params);
  const total = parseInt(countRes.rows[0].count);

  const dataRes = await query(
    `SELECT a.*, c.raison_sociale AS client_nom, f.numero_facture
     FROM avoirs a
     LEFT JOIN clients c ON c.id = a.client_id
     LEFT JOIN factures f ON f.id = a.facture_id
     ${where}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  return {
    avoirs: dataRes.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ---------------------------------------------------------------------------
// Détail avoir
// ---------------------------------------------------------------------------

export async function getAvoirById(id) {
  const { rows: [avoir] } = await query(
    `SELECT a.*, c.raison_sociale AS client_nom, f.numero_facture,
            f.client_raison_sociale AS facture_client_raison_sociale,
            f.date_creation AS facture_date_creation,
            f.total_ttc AS facture_total_ttc,
            fi.numero_facture AS facture_imputee_numero
     FROM avoirs a
     LEFT JOIN clients c ON c.id = a.client_id
     LEFT JOIN factures f ON f.id = a.facture_id
     LEFT JOIN factures fi ON fi.id = a.facture_imputee_id
     WHERE a.id = $1`,
    [id]
  );
  if (!avoir) throw new ApiError(404, 'Avoir introuvable');

  const { rows: lignes } = await query(
    'SELECT * FROM avoir_lignes WHERE avoir_id = $1 ORDER BY id', [id]
  );

  const avoirableInfo = await getResteAvoirablePublic(avoir.facture_id);

  return { ...avoir, lignes, ...avoirableInfo };
}

async function getResteAvoirablePublic(factureId) {
  const { rows: [sum] } = await query(
    `SELECT COALESCE(SUM(montant_ttc), 0) AS total_avoirs
     FROM avoirs WHERE facture_id = $1 AND statut != 'Annulé'`,
    [factureId]
  );
  const { rows: [facture] } = await query(
    'SELECT total_ttc FROM factures WHERE id = $1', [factureId]
  );
  if (!facture) return {};
  return {
    facture_total_ttc: parseFloat(facture.total_ttc),
    total_avoirs_existants: parseFloat(sum.total_avoirs),
    reste_avoirable: Math.round((parseFloat(facture.total_ttc) - parseFloat(sum.total_avoirs)) * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Avoirs possibles pour une facture
// ---------------------------------------------------------------------------

export async function getAvoirsPossibles(factureId) {
  const { rows: [facture] } = await query(
    `SELECT f.*, c.raison_sociale AS client_nom
     FROM factures f
     LEFT JOIN clients c ON c.id = f.client_id
     WHERE f.id = $1`,
    [factureId]
  );
  if (!facture) throw new ApiError(404, 'Facture introuvable');
  if (!['Validée', 'Envoyée'].includes(facture.statut)) {
    throw new ApiError(400, `La facture doit être au statut Validée ou Envoyée (actuellement: ${facture.statut})`);
  }

  const { rows: lignes } = await query(
    'SELECT * FROM facture_lignes WHERE facture_id = $1 ORDER BY position', [factureId]
  );

  const { rows: [sum] } = await query(
    `SELECT COALESCE(SUM(montant_ttc), 0) AS total_avoirs
     FROM avoirs WHERE facture_id = $1 AND statut != 'Annulé'`,
    [factureId]
  );

  const { rows: avoirsExistants } = await query(
    `SELECT id, numero, montant_ttc, statut, type_avoir, date_avoir
     FROM avoirs WHERE facture_id = $1 ORDER BY created_at DESC`,
    [factureId]
  );

  const totalAvoirs = parseFloat(sum.total_avoirs);
  const factureTtc = parseFloat(facture.total_ttc);

  return {
    facture,
    lignes,
    total_ttc: factureTtc,
    total_avoirs_existants: totalAvoirs,
    reste_avoirable: Math.round((factureTtc - totalAvoirs) * 100) / 100,
    avoirs_existants: avoirsExistants,
  };
}

// ---------------------------------------------------------------------------
// Créer avoir
// ---------------------------------------------------------------------------

export async function createAvoir(data, userId) {
  const alsClient = getClient();
  const dbClient = alsClient || await pool.connect();
  const ownConnection = !alsClient;
  try {
    if (ownConnection) await dbClient.query('BEGIN');

    const { rows: [facture] } = await dbClient.query(
      'SELECT * FROM factures WHERE id = $1', [data.facture_id]
    );
    if (!facture) throw new ApiError(404, 'Facture introuvable');
    if (!['Validée', 'Envoyée'].includes(facture.statut)) {
      throw new ApiError(400, `La facture doit être au statut Validée ou Envoyée pour émettre un avoir`);
    }

    let lignes = [];
    if (data.type_avoir === 'TOTAL') {
      const { rows: factLignes } = await dbClient.query(
        `SELECT * FROM facture_lignes WHERE facture_id = $1
         AND type_ligne NOT IN ('COMMENTAIRE', 'SOUS_TOTAL', 'SAUT_DE_LIGNE')
         ORDER BY position`,
        [data.facture_id]
      );
      lignes = factLignes.map(l => ({
        facture_ligne_id: l.id,
        designation: l.designation,
        quantite: parseFloat(l.quantite) || 1,
        prix_unitaire_ht: parseFloat(l.prix_unitaire) || 0,
        taux_tva: parseFloat(l.taux_tva) || 20,
      }));
    } else {
      if (!data.lignes || data.lignes.length === 0) {
        throw new ApiError(400, 'Au moins une ligne est requise pour un avoir partiel');
      }
      lignes = data.lignes.map(l => ({
        facture_ligne_id: l.facture_ligne_id || null,
        designation: l.designation,
        quantite: parseFloat(l.quantite) || 1,
        prix_unitaire_ht: parseFloat(l.prix_unitaire_ht) || 0,
        taux_tva: parseFloat(l.taux_tva) || 20,
      }));
    }

    if (lignes.length === 0) throw new ApiError(400, 'Au moins une ligne est requise');

    const totaux = calculerTotauxAvoir(lignes);
    if (totaux.montant_ttc <= 0) throw new ApiError(400, 'Le montant de l\'avoir doit être supérieur à 0');

    const avoirable = await getResteAvoirable(dbClient, data.facture_id);
    if (totaux.montant_ttc > avoirable.reste_avoirable + 0.01) {
      throw new ApiError(400,
        `Le montant TTC de l'avoir (${totaux.montant_ttc} €) dépasse le reste avoirable (${avoirable.reste_avoirable} €). ` +
        `Facture TTC: ${avoirable.facture_ttc} €, avoirs existants: ${avoirable.total_avoirs_existants} €.`
      );
    }

    const numero = await generateNumeroAvoir(dbClient);

    const { rows: [avoir] } = await dbClient.query(
      `INSERT INTO avoirs (
        numero, facture_id, client_id, type_avoir, motif, date_avoir,
        montant_ht, montant_tva, montant_ttc, statut
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Brouillon')
      RETURNING *`,
      [
        numero, data.facture_id, facture.client_id,
        data.type_avoir, data.motif || null,
        data.date_avoir || new Date().toISOString().slice(0, 10),
        totaux.montant_ht, totaux.montant_tva, totaux.montant_ttc,
      ]
    );

    for (const l of lignes) {
      const ht = Math.round((parseFloat(l.quantite) || 0) * (parseFloat(l.prix_unitaire_ht) || 0) * 100) / 100;
      const tva = Math.round(ht * ((parseFloat(l.taux_tva) || 20) / 100) * 100) / 100;
      const ttc = Math.round((ht + tva) * 100) / 100;

      await dbClient.query(
        `INSERT INTO avoir_lignes (avoir_id, facture_ligne_id, designation, quantite, prix_unitaire_ht, taux_tva, montant_ht, montant_ttc)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [avoir.id, l.facture_ligne_id || null, l.designation, l.quantite, l.prix_unitaire_ht, l.taux_tva, ht, ttc]
      );
    }

    if (ownConnection) await dbClient.query('COMMIT');
    return getAvoirById(avoir.id);
  } catch (err) {
    if (ownConnection) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (ownConnection) dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Modifier avoir (Brouillon uniquement)
// ---------------------------------------------------------------------------

export async function updateAvoir(id, data, userId) {
  const alsClient = getClient();
  const dbClient = alsClient || await pool.connect();
  const ownConnection = !alsClient;
  try {
    if (ownConnection) await dbClient.query('BEGIN');

    const { rows: [avoir] } = await dbClient.query('SELECT * FROM avoirs WHERE id = $1', [id]);
    if (!avoir) throw new ApiError(404, 'Avoir introuvable');
    if (avoir.statut !== 'Brouillon') throw new ApiError(400, 'Seuls les avoirs en brouillon peuvent être modifiés');

    if (data.motif !== undefined) {
      await dbClient.query('UPDATE avoirs SET motif = $1, updated_at = NOW() WHERE id = $2', [data.motif, id]);
    }
    if (data.date_avoir) {
      await dbClient.query('UPDATE avoirs SET date_avoir = $1, updated_at = NOW() WHERE id = $2', [data.date_avoir, id]);
    }

    if (data.lignes) {
      await dbClient.query('DELETE FROM avoir_lignes WHERE avoir_id = $1', [id]);

      const lignes = data.lignes.map(l => ({
        facture_ligne_id: l.facture_ligne_id || null,
        designation: l.designation,
        quantite: parseFloat(l.quantite) || 1,
        prix_unitaire_ht: parseFloat(l.prix_unitaire_ht) || 0,
        taux_tva: parseFloat(l.taux_tva) || 20,
      }));

      if (lignes.length === 0) throw new ApiError(400, 'Au moins une ligne est requise');

      const totaux = calculerTotauxAvoir(lignes);
      if (totaux.montant_ttc <= 0) throw new ApiError(400, 'Le montant doit être supérieur à 0');

      const avoirable = await getResteAvoirable(dbClient, avoir.facture_id);
      const resteHorsAvoirActuel = avoirable.reste_avoirable + parseFloat(avoir.montant_ttc);
      if (totaux.montant_ttc > resteHorsAvoirActuel + 0.01) {
        throw new ApiError(400, `Le montant TTC (${totaux.montant_ttc} €) dépasse le reste avoirable (${resteHorsAvoirActuel.toFixed(2)} €)`);
      }

      for (const l of lignes) {
        const ht = Math.round((parseFloat(l.quantite) || 0) * (parseFloat(l.prix_unitaire_ht) || 0) * 100) / 100;
        const tva = Math.round(ht * ((parseFloat(l.taux_tva) || 20) / 100) * 100) / 100;
        const ttc = Math.round((ht + tva) * 100) / 100;

        await dbClient.query(
          `INSERT INTO avoir_lignes (avoir_id, facture_ligne_id, designation, quantite, prix_unitaire_ht, taux_tva, montant_ht, montant_ttc)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [id, l.facture_ligne_id || null, l.designation, l.quantite, l.prix_unitaire_ht, l.taux_tva, ht, ttc]
        );
      }

      await dbClient.query(
        `UPDATE avoirs SET montant_ht = $1, montant_tva = $2, montant_ttc = $3, updated_at = NOW() WHERE id = $4`,
        [totaux.montant_ht, totaux.montant_tva, totaux.montant_ttc, id]
      );
    }

    if (ownConnection) await dbClient.query('COMMIT');
    return getAvoirById(id);
  } catch (err) {
    if (ownConnection) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (ownConnection) dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Valider avoir (Brouillon → Validé)
// ---------------------------------------------------------------------------

export async function validerAvoir(id, userId) {
  const { rows: [avoir] } = await query('SELECT * FROM avoirs WHERE id = $1', [id]);
  if (!avoir) throw new ApiError(404, 'Avoir introuvable');
  if (avoir.statut !== 'Brouillon') throw new ApiError(400, 'Seul un brouillon peut être validé');

  await query(`UPDATE avoirs SET statut = 'Validé', updated_at = NOW() WHERE id = $1`, [id]);
  return getAvoirById(id);
}

// ---------------------------------------------------------------------------
// Utiliser avoir (Validé → Remboursé | Imputé)
// ---------------------------------------------------------------------------

export async function utiliserAvoir(id, data, userId) {
  const alsClient = getClient();
  const dbClient = alsClient || await pool.connect();
  const ownConnection = !alsClient;
  try {
    if (ownConnection) await dbClient.query('BEGIN');

    const { rows: [avoir] } = await dbClient.query('SELECT * FROM avoirs WHERE id = $1', [id]);
    if (!avoir) throw new ApiError(404, 'Avoir introuvable');
    if (avoir.statut !== 'Validé') throw new ApiError(400, 'L\'avoir doit être au statut Validé');

    if (data.mode === 'REMBOURSEMENT') {
      await dbClient.query(
        `UPDATE avoirs SET statut = 'Remboursé', mode_utilisation = 'REMBOURSEMENT', updated_at = NOW() WHERE id = $1`,
        [id]
      );
    } else if (data.mode === 'IMPUTATION') {
      if (!data.facture_imputee_id) throw new ApiError(400, 'facture_imputee_id est requis pour une imputation');

      const { rows: [factureCible] } = await dbClient.query(
        'SELECT * FROM factures WHERE id = $1', [data.facture_imputee_id]
      );
      if (!factureCible) throw new ApiError(404, 'Facture cible introuvable');
      if (!['Brouillon', 'Validée'].includes(factureCible.statut)) {
        throw new ApiError(400, 'La facture cible doit être au statut Brouillon ou Validée');
      }

      const { rows: posRows } = await dbClient.query(
        'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM facture_lignes WHERE facture_id = $1',
        [data.facture_imputee_id]
      );

      await dbClient.query(
        `INSERT INTO facture_lignes (facture_id, position, type_ligne, designation, description, quantite, prix_unitaire, total_ht)
         VALUES ($1, $2, 'PRODUIT', $3, $4, 1, $5, $5)`,
        [
          data.facture_imputee_id,
          posRows[0].next_pos,
          `Imputation avoir ${avoir.numero}`,
          `Avoir sur facture n° ${(await dbClient.query('SELECT numero_facture FROM factures WHERE id = $1', [avoir.facture_id])).rows[0]?.numero_facture || ''}`,
          -Math.abs(parseFloat(avoir.montant_ht)),
        ]
      );

      const { rows: lignes } = await dbClient.query(
        'SELECT * FROM facture_lignes WHERE facture_id = $1', [data.facture_imputee_id]
      );
      const { rows: [f] } = await dbClient.query(
        'SELECT frais_techniques, eco_contribution, taux_tva FROM factures WHERE id = $1', [data.facture_imputee_id]
      );
      const lignesCalculables = lignes.filter(l => !['COMMENTAIRE', 'SOUS_TOTAL', 'SAUT_DE_LIGNE'].includes(l.type_ligne));
      const total_ht = lignesCalculables.reduce((sum, l) => sum + parseFloat(l.total_ht || 0), 0);
      const ftc = parseFloat(f.frais_techniques) || 0;
      const ect = parseFloat(f.eco_contribution) || 0;
      const base_tva = total_ht + ftc + ect;
      const montant_tva = Math.round(base_tva * (parseFloat(f.taux_tva) / 100) * 100) / 100;
      const total_ttc = Math.round((base_tva + montant_tva) * 100) / 100;

      await dbClient.query(
        `UPDATE factures SET total_ht = $1, montant_tva = $2, total_ttc = $3, net_a_payer = $3, updated_at = NOW() WHERE id = $4`,
        [Math.round(total_ht * 100) / 100, montant_tva, total_ttc, data.facture_imputee_id]
      );

      await dbClient.query(
        `UPDATE avoirs SET statut = 'Imputé', mode_utilisation = 'IMPUTATION', facture_imputee_id = $1, updated_at = NOW() WHERE id = $2`,
        [data.facture_imputee_id, id]
      );
    } else {
      throw new ApiError(400, 'mode doit être REMBOURSEMENT ou IMPUTATION');
    }

    if (ownConnection) await dbClient.query('COMMIT');
    return getAvoirById(id);
  } catch (err) {
    if (ownConnection) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (ownConnection) dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Annuler avoir
// ---------------------------------------------------------------------------

export async function annulerAvoir(id, userId) {
  const { rows: [avoir] } = await query('SELECT * FROM avoirs WHERE id = $1', [id]);
  if (!avoir) throw new ApiError(404, 'Avoir introuvable');
  if (avoir.statut === 'Annulé') throw new ApiError(400, 'Avoir déjà annulé');
  if (avoir.statut === 'Imputé') {
    const { rows: [factureCible] } = await query(
      'SELECT statut FROM factures WHERE id = $1', [avoir.facture_imputee_id]
    );
    if (factureCible && !['Brouillon'].includes(factureCible.statut)) {
      throw new ApiError(400, 'Impossible d\'annuler un avoir imputé sur une facture validée ou envoyée');
    }
  }

  await query(`UPDATE avoirs SET statut = 'Annulé', updated_at = NOW() WHERE id = $1`, [id]);
  return getAvoirById(id);
}

// ---------------------------------------------------------------------------
// Avoirs rattachés à une facture
// ---------------------------------------------------------------------------

export async function getAvoirsParFacture(factureId) {
  const { rows } = await query(
    `SELECT a.*, c.raison_sociale AS client_nom
     FROM avoirs a
     LEFT JOIN clients c ON c.id = a.client_id
     WHERE a.facture_id = $1
     ORDER BY a.created_at DESC`,
    [factureId]
  );

  const { rows: [facture] } = await query(
    'SELECT total_ttc FROM factures WHERE id = $1', [factureId]
  );

  const totalAvoirs = rows
    .filter(a => a.statut !== 'Annulé')
    .reduce((sum, a) => sum + parseFloat(a.montant_ttc), 0);

  return {
    avoirs: rows,
    facture_total_ttc: facture ? parseFloat(facture.total_ttc) : 0,
    total_avoirs: Math.round(totalAvoirs * 100) / 100,
    net_du: facture ? Math.round((parseFloat(facture.total_ttc) - totalAvoirs) * 100) / 100 : 0,
  };
}
