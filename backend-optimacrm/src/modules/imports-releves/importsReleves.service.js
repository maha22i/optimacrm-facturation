import { query, pool, getClient } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

// ---------------------------------------------------------------------------
// Numérotation
// ---------------------------------------------------------------------------

export async function generateNumeroBatch(dbClient) {
  const result = await dbClient.query("SELECT nextval('imports_releves_batch_seq')::int AS seq");
  const year = new Date().getFullYear();
  return `IMP-${year}-${String(result.rows[0].seq).padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Liste des imports
// ---------------------------------------------------------------------------

export async function listImports({ page = 1, limit = 20, statut, user_id, date_debut, date_fin, search }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let idx = 1;

  if (statut) { conditions.push(`ir.statut = $${idx++}`); params.push(statut); }
  if (user_id) { conditions.push(`ir.user_id = $${idx++}`); params.push(user_id); }
  if (date_debut) { conditions.push(`ir.date_import >= $${idx++}`); params.push(date_debut); }
  if (date_fin) { conditions.push(`ir.date_import <= $${idx++}`); params.push(date_fin); }
  if (search) {
    conditions.push(`(ir.nom_fichier ILIKE $${idx} OR ir.numero_batch ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countRes = await query(`SELECT COUNT(*) FROM imports_releves ir ${where}`, params);
  const total = parseInt(countRes.rows[0].count);

  const dataRes = await query(
    `SELECT ir.*,
       fstats.nb_factures, fstats.montant_total_ht
     FROM imports_releves ir
     LEFT JOIN LATERAL (
       SELECT COUNT(DISTINCT f.id) as nb_factures,
              COALESCE(SUM(DISTINCT f.total_ht), 0) as montant_total_ht
       FROM releves_compteurs rc2
       JOIN facture_lignes fl ON fl.releve_compteur_id = rc2.id
       JOIN factures f ON f.id = fl.facture_id
       WHERE rc2.import_id = ir.id
     ) fstats ON true
     ${where}
     ORDER BY ir.date_import DESC, ir.id DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  return {
    imports: dataRes.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ---------------------------------------------------------------------------
// Détail d'un import
// ---------------------------------------------------------------------------

export async function getImportById(id) {
  const { rows: [importRow] } = await query(
    `SELECT ir.*,
       fstats.nb_factures, fstats.montant_total_ht
     FROM imports_releves ir
     LEFT JOIN LATERAL (
       SELECT COUNT(DISTINCT f.id) as nb_factures,
              COALESCE(SUM(DISTINCT f.total_ht), 0) as montant_total_ht
       FROM releves_compteurs rc2
       JOIN facture_lignes fl ON fl.releve_compteur_id = rc2.id
       JOIN factures f ON f.id = fl.facture_id
       WHERE rc2.import_id = ir.id
     ) fstats ON true
     WHERE ir.id = $1`,
    [id]
  );
  if (!importRow) throw ApiError.notFound('Import introuvable');
  return importRow;
}

// ---------------------------------------------------------------------------
// Relevés d'un import
// ---------------------------------------------------------------------------

export async function getImportReleves(importId, { page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const countRes = await query(
    `SELECT COUNT(*) FROM releves_compteurs WHERE import_id = $1`,
    [importId]
  );
  const total = parseInt(countRes.rows[0].count);

  const { rows: releves } = await query(
    `SELECT rc.*,
       pm.numero_serie, pm.modele, pm.marque, pm.designation,
       c.raison_sociale
     FROM releves_compteurs rc
     LEFT JOIN parc_machines pm ON pm.id = rc.machine_id
     LEFT JOIN clients c ON c.id = pm.client_id
     WHERE rc.import_id = $1
     ORDER BY rc.date_releve DESC, rc.id DESC
     LIMIT $2 OFFSET $3`,
    [importId, limit, offset]
  );

  return {
    releves,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ---------------------------------------------------------------------------
// Factures liées à un import
// ---------------------------------------------------------------------------

export async function getImportFactures(importId) {
  const { rows } = await query(
    `SELECT DISTINCT f.*, c.raison_sociale as client_nom,
       (SELECT COUNT(*) FROM facture_lignes fl2
        JOIN releves_compteurs rc2 ON rc2.id = fl2.releve_compteur_id
        WHERE fl2.facture_id = f.id AND rc2.import_id = $1) as nb_releves_source
     FROM factures f
     JOIN facture_lignes fl ON fl.facture_id = f.id
     JOIN releves_compteurs rc ON rc.id = fl.releve_compteur_id
     JOIN clients c ON c.id = f.client_id
     WHERE rc.import_id = $1
     ORDER BY f.date_creation DESC`,
    [importId]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Vérification de doublon
// ---------------------------------------------------------------------------

export async function checkDuplicate(hash) {
  const { rows: [existing] } = await query(
    `SELECT * FROM imports_releves WHERE hash_fichier = $1 AND statut = 'Actif'`,
    [hash]
  );
  return existing || null;
}

// ---------------------------------------------------------------------------
// Statistiques
// ---------------------------------------------------------------------------

export async function getImportsStats() {
  const moisDebut = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().slice(0, 10);

  const totalRes = await query(`SELECT COUNT(*) FROM imports_releves`);
  const moisRes = await query(`SELECT COUNT(*) FROM imports_releves WHERE date_import >= $1`, [moisDebut]);
  const nonFacturesRes = await query(
    `SELECT COUNT(*) FROM releves_compteurs rc
     JOIN imports_releves ir ON ir.id = rc.import_id
     WHERE rc.import_id IS NOT NULL AND rc.est_facture = false AND ir.statut = 'Actif'`
  );
  const annulesRes = await query(`SELECT COUNT(*) FROM imports_releves WHERE statut = 'Annule'`);

  return {
    total_imports: parseInt(totalRes.rows[0].count),
    imports_ce_mois: parseInt(moisRes.rows[0].count),
    releves_non_factures: parseInt(nonFacturesRes.rows[0].count),
    imports_annules: parseInt(annulesRes.rows[0].count),
  };
}

// ---------------------------------------------------------------------------
// Annulation d'un import
// ---------------------------------------------------------------------------

export async function annulerImport(importId, motif, userId) {
  const alsClient = getClient();
  const dbClient = alsClient || await pool.connect();
  const ownConnection = !alsClient;

  try {
    if (ownConnection) await dbClient.query('BEGIN');

    const { rows: [importRow] } = await dbClient.query(
      `SELECT * FROM imports_releves WHERE id = $1`, [importId]
    );
    if (!importRow) throw ApiError.notFound('Import introuvable');

    if (importRow.statut === 'Annule') {
      throw ApiError.badRequest('Cet import est déjà annulé');
    }

    const { rows: [facCheck] } = await dbClient.query(
      `SELECT COUNT(*)::int as nb, ARRAY_AGG(DISTINCT facture_numero) as factures
       FROM releves_compteurs WHERE import_id = $1 AND est_facture = true`,
      [importId]
    );

    if (facCheck.nb > 0) {
      const err = ApiError.conflict(
        `Impossible d'annuler : ${facCheck.nb} relevé(s) ont déjà été facturés`
      );
      err.factures = facCheck.factures;
      err.errorCode = 'IMPORT_HAS_INVOICES';
      throw err;
    }

    await dbClient.query(
      `DELETE FROM releves_compteurs WHERE import_id = $1`, [importId]
    );

    const { rows: [updated] } = await dbClient.query(
      `UPDATE imports_releves
       SET statut = 'Annule',
           date_annulation = NOW(),
           user_annulation_id = $2,
           motif_annulation = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [importId, userId, motif]
    );

    if (ownConnection) await dbClient.query('COMMIT');
    return updated;
  } catch (err) {
    if (ownConnection) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (ownConnection) dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Timeline machine
// ---------------------------------------------------------------------------

export async function getMachineTimeline(machineId) {
  const { rows } = await query(
    `SELECT
       rc.id as releve_id, rc.date_releve, rc.compteur_nb, rc.compteur_couleur,
       rc.volume_nb, rc.volume_couleur, rc.est_facture, rc.import_id,
       i.numero_batch, i.date_import, i.statut as import_statut,
       (SELECT json_agg(json_build_object(
         'id', f.id, 'numero', f.numero_facture,
         'date', f.date_creation, 'montant_ttc', f.total_ttc,
         'statut', f.statut
       ))
        FROM facture_lignes fl
        JOIN factures f ON f.id = fl.facture_id
        WHERE fl.releve_compteur_id = rc.id
       ) as factures
     FROM releves_compteurs rc
     LEFT JOIN imports_releves i ON i.id = rc.import_id
     WHERE rc.machine_id = $1
     ORDER BY rc.date_releve DESC`,
    [machineId]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Rapport d'erreurs
// ---------------------------------------------------------------------------

export async function getImportRapport(importId) {
  const { rows: [importRow] } = await query(
    `SELECT id, numero_batch, nom_fichier, rapport_erreurs FROM imports_releves WHERE id = $1`,
    [importId]
  );
  if (!importRow) throw ApiError.notFound('Import introuvable');
  return importRow;
}
