import { query, pool } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { validateIBAN, validateBIC, validateMandatClient, formatAmount } from './sepa.validators.js';
import { generateSepaXml } from './sepa.xmlGenerator.js';

// ─────────────────────────────────────────────────────────────────────────────
// CRÉANCIER
// ─────────────────────────────────────────────────────────────────────────────

export async function getCreancier() {
  const { rows } = await query('SELECT * FROM sepa_creancier ORDER BY id LIMIT 1');
  return rows[0] || null;
}

export async function upsertCreancier(data) {
  const { nom, ics, iban, bic } = data;

  if (!ics || !iban || !bic) {
    throw ApiError.badRequest('ICS, IBAN et BIC sont requis');
  }

  const ibanCheck = validateIBAN(iban);
  if (!ibanCheck.valid) throw ApiError.badRequest(ibanCheck.error);

  const bicCheck = validateBIC(bic);
  if (!bicCheck.valid) throw ApiError.badRequest(bicCheck.error);

  const existing = await query('SELECT id FROM sepa_creancier LIMIT 1');

  if (existing.rows.length > 0) {
    const { rows } = await query(
      `UPDATE sepa_creancier
       SET nom = $1, ics = $2, iban = $3, bic = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [nom || 'GROUPE INNOV', ics.trim(), ibanCheck.cleaned, bicCheck.cleaned, existing.rows[0].id]
    );
    return rows[0];
  }

  const { rows } = await query(
    `INSERT INTO sepa_creancier (nom, ics, iban, bic)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [nom || 'GROUPE INNOV', ics.trim(), ibanCheck.cleaned, bicCheck.cleaned]
  );
  return rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTURES ÉLIGIBLES
// ─────────────────────────────────────────────────────────────────────────────

export async function getFacturesEligibles() {
  const { rows } = await query(`
    SELECT
      f.id AS facture_id,
      f.numero_facture,
      f.total_ttc,
      f.statut,
      f.date_creation,
      f.client_id,
      f.code_client,
      f.client_raison_sociale,
      c.numero_client,
      c.raison_sociale,
      c.iban,
      c.bic,
      c.reference_mandat_sepa,
      c.date_mandat_sepa,
      c.sequence_mandat
    FROM factures f
    JOIN clients c ON c.id = f.client_id
    WHERE f.statut IN ('Validée', 'Envoyée')
      AND f.total_ttc > 0
      AND f.id NOT IN (
        SELECT srl.facture_id FROM sepa_remise_lignes srl
      )
    ORDER BY f.date_creation DESC
  `);

  return rows.map(row => {
    const validation = validateMandatClient(row);
    return {
      ...row,
      pret: validation.valid,
      champs_manquants: validation.errors,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GÉNÉRATION DU FICHIER SEPA
// ─────────────────────────────────────────────────────────────────────────────

export async function genererRemiseSepa({ facture_ids, date_prelevement, user }) {
  if (!facture_ids || !Array.isArray(facture_ids) || facture_ids.length === 0) {
    throw ApiError.badRequest('Aucune facture sélectionnée');
  }
  if (!date_prelevement) {
    throw ApiError.badRequest('Date de prélèvement requise');
  }

  // Vérifier créancier
  const creancier = await getCreancier();
  if (!creancier || !creancier.ics || !creancier.iban || !creancier.bic) {
    throw ApiError.badRequest('Paramètres créancier SEPA non configurés (ICS, IBAN, BIC requis)');
  }

  // Récupérer les factures avec données client
  const { rows: factures } = await query(`
    SELECT
      f.id AS facture_id,
      f.numero_facture,
      f.total_ttc,
      f.statut,
      f.client_id,
      f.code_client,
      f.client_raison_sociale,
      c.numero_client,
      c.raison_sociale,
      c.iban,
      c.bic,
      c.reference_mandat_sepa,
      c.date_mandat_sepa,
      c.sequence_mandat
    FROM factures f
    JOIN clients c ON c.id = f.client_id
    WHERE f.id = ANY($1)
    ORDER BY f.id
  `, [facture_ids]);

  if (factures.length === 0) {
    throw ApiError.badRequest('Aucune facture trouvée pour les IDs fournis');
  }

  // Vérifier que toutes les factures sont éligibles
  const errors = [];
  for (const f of factures) {
    if (!['Validée', 'Envoyée'].includes(f.statut)) {
      errors.push(`Facture ${f.numero_facture} : statut "${f.statut}" non éligible`);
      continue;
    }
    if (parseFloat(f.total_ttc) <= 0) {
      errors.push(`Facture ${f.numero_facture} : montant TTC doit être > 0`);
      continue;
    }

    const validation = validateMandatClient(f);
    if (!validation.valid) {
      errors.push(`Facture ${f.numero_facture} (${f.raison_sociale}) : ${validation.errors.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    throw ApiError.badRequest(`Validation échouée : ${errors.join(' | ')}`);
  }

  // Vérifier que ces factures ne sont pas déjà dans une remise
  const { rows: existing } = await query(
    `SELECT facture_id FROM sepa_remise_lignes WHERE facture_id = ANY($1)`,
    [facture_ids]
  );
  if (existing.length > 0) {
    const ids = existing.map(r => r.facture_id).join(', ');
    throw ApiError.badRequest(`Factures déjà incluses dans une remise existante : ${ids}`);
  }

  // Générer le XML
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // Créer la remise
    const msgId = `OPTIMACRM-${Date.now()}`;
    const nbTransactions = factures.length;
    const montantTotal = formatAmount(
      factures.reduce((sum, f) => sum + parseFloat(f.total_ttc), 0)
    );

    const { rows: [remise] } = await dbClient.query(
      `INSERT INTO sepa_remises (msg_id, pmt_inf_id, date_prelevement, nb_transactions, montant_total, user_id, user_nom)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [msgId, 'TEMP', date_prelevement, nbTransactions, montantTotal, user?.id || null, user ? `${user.first_name} ${user.last_name}` : null]
    );

    const pmtInfId = `REF Remise - ${remise.id}`;
    await dbClient.query(
      'UPDATE sepa_remises SET pmt_inf_id = $1 WHERE id = $2',
      [pmtInfId, remise.id]
    );

    // Insérer les lignes
    for (const f of factures) {
      const instrId = `REF${f.facture_id}`;
      await dbClient.query(
        `INSERT INTO sepa_remise_lignes (remise_id, facture_id, instr_id, end_to_end_id, montant, rum, iban_debiteur)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [remise.id, f.facture_id, instrId, f.numero_facture, f.total_ttc, f.reference_mandat_sepa, f.iban]
      );
    }

    // Générer le XML
    const xml = generateSepaXml(creancier, factures, date_prelevement, msgId, pmtInfId);

    // Archiver le XML
    await dbClient.query(
      'UPDATE sepa_remises SET fichier_xml = $1 WHERE id = $2',
      [xml, remise.id]
    );

    await dbClient.query('COMMIT');

    return {
      remise_id: remise.id,
      msg_id: msgId,
      pmt_inf_id: pmtInfId,
      nb_transactions: nbTransactions,
      montant_total: montantTotal,
      date_prelevement,
      xml,
    };
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORIQUE DES REMISES
// ─────────────────────────────────────────────────────────────────────────────

export async function listRemises() {
  const { rows } = await query(`
    SELECT id, msg_id, pmt_inf_id, date_creation, date_prelevement,
           nb_transactions, montant_total, statut, user_nom
    FROM sepa_remises
    ORDER BY date_creation DESC
  `);
  return rows;
}

export async function getRemiseXml(id) {
  const { rows } = await query('SELECT * FROM sepa_remises WHERE id = $1', [id]);
  if (rows.length === 0) throw ApiError.notFound('Remise non trouvée');
  if (!rows[0].fichier_xml) throw ApiError.notFound('Fichier XML non disponible');
  return rows[0];
}

export async function getRemiseDetail(id) {
  const { rows: [remise] } = await query('SELECT * FROM sepa_remises WHERE id = $1', [id]);
  if (!remise) throw ApiError.notFound('Remise non trouvée');

  const { rows: lignes } = await query(
    `SELECT srl.*, f.numero_facture, f.client_raison_sociale
     FROM sepa_remise_lignes srl
     LEFT JOIN factures f ON f.id = srl.facture_id
     WHERE srl.remise_id = $1
     ORDER BY srl.id`,
    [id]
  );

  return { ...remise, lignes };
}
