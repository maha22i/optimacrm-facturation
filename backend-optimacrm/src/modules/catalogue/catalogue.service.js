import { pool, query } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { bucket, isFirebaseReady } from '../../config/firebase.js';
import fs from 'fs/promises';
import path from 'path';

const LIST_FIELDS = `
  p.id, p.reference, p.designation, p.description, p.categorie, p.unite,
  p.prix_unitaire_ht, p.taux_tva, p.actif, p.type_document,
  p.fournisseur_id, p.marque_id, p.famille_id, p.modele,
  p.reference_fournisseur, p.code_barre,
  p.contribution_environnement, p.frais_divers,
  p.prix_achat, p.prix_revient, p.prix_vendeur, p.prix_public, p.marge_pourcentage,
  p.quantite_stock, p.alerte_stock_mini, p.quantite_reapprovisionnement,
  p.hors_catalogue, p.image_url,
  p.created_at, p.updated_at
`;

const DETAIL_TABLES = {
  COPIEUR: 'produit_details_copieur',
  TELEPHONIE: 'produit_details_telephonie',
  INFORMATIQUE: 'produit_details_informatique',
  SECURITE: 'produit_details_securite',
};

const DETAIL_FIELDS = {
  COPIEUR: ['cartouche', 'consommation', 'interface', 'dimensions', 'conditionnement', 'poids', 'resolution', 'nb_pages', 'largeur_impression'],
  TELEPHONIE: ['operateur', 'type_ligne', 'debit_download', 'debit_upload', 'engagement_mois', 'nombre_lignes', 'nombre_postes', 'inclus_appels', 'data_mobile', 'protocole', 'codec'],
  INFORMATIQUE: ['type_materiel', 'processeur', 'memoire_ram', 'stockage', 'systeme_exploitation', 'garantie_mois', 'licence_type', 'nombre_utilisateurs'],
  SECURITE: ['type_equipement', 'resolution_camera', 'angle_vue', 'vision_nocturne', 'stockage_jours', 'protocole', 'ip_rating'],
};

function computePrixRevient(data) {
  const pa = parseFloat(data.prix_achat) || 0;
  const ce = parseFloat(data.contribution_environnement) || 0;
  const fd = parseFloat(data.frais_divers) || 0;
  return +(pa + ce + fd).toFixed(2);
}

function computePrixPublic(data) {
  const pr = computePrixRevient(data);
  const marge = parseFloat(data.marge_pourcentage);
  if (!isNaN(marge) && marge > 0) {
    return +(pr * (1 + marge / 100)).toFixed(2);
  }
  return data.prix_public != null ? parseFloat(data.prix_public) : null;
}

// ── LIST ────────────────────────────────────────────────────────────────────────

export async function listProduits({ page = 1, limit = 20, categorie, search, actif, fournisseur_id }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let i = 1;

  if (actif !== undefined) {
    conditions.push(`p.actif = $${i++}`);
    params.push(actif === 'true' || actif === true);
  }
  if (categorie) {
    conditions.push(`p.categorie = $${i++}`);
    params.push(categorie);
  }
  if (fournisseur_id) {
    conditions.push(`p.fournisseur_id = $${i++}`);
    params.push(parseInt(fournisseur_id));
  }
  if (search) {
    conditions.push(`(p.designation ILIKE $${i} OR p.reference ILIKE $${i} OR p.description ILIKE $${i} OR p.modele ILIKE $${i} OR m.nom ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [prodRes, countRes] = await Promise.all([
    query(
      `SELECT ${LIST_FIELDS},
              f.nom AS fournisseur_nom,
              m.nom AS marque_nom
       FROM catalogue_produits p
       LEFT JOIN fournisseurs f ON f.id = p.fournisseur_id
       LEFT JOIN marques m ON m.id = p.marque_id
       ${where}
       ORDER BY p.categorie, p.designation
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS total FROM catalogue_produits p LEFT JOIN marques m ON m.id = p.marque_id ${where}`, params),
  ]);

  return {
    produits: prodRes.rows,
    pagination: { page, limit, total: countRes.rows[0].total, totalPages: Math.ceil(countRes.rows[0].total / limit) },
  };
}

export async function getCategories() {
  const result = await query(
    'SELECT DISTINCT categorie FROM catalogue_produits WHERE categorie IS NOT NULL ORDER BY categorie'
  );
  return result.rows.map(r => r.categorie);
}

// ── GET BY ID (complet) ─────────────────────────────────────────────────────────

export async function getProduitById(id) {
  const result = await query(
    `SELECT ${LIST_FIELDS},
            f.nom AS fournisseur_nom,
            m.nom AS marque_nom,
            fam.nom AS famille_nom
     FROM catalogue_produits p
     LEFT JOIN fournisseurs f ON f.id = p.fournisseur_id
     LEFT JOIN marques m ON m.id = p.marque_id
     LEFT JOIN familles_produits fam ON fam.id = p.famille_id
     WHERE p.id = $1`,
    [id]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Produit non trouvé');

  const produit = result.rows[0];

  const cat = produit.categorie;
  let details = null;
  if (cat && DETAIL_TABLES[cat]) {
    const detRes = await query(`SELECT * FROM ${DETAIL_TABLES[cat]} WHERE produit_id = $1`, [id]);
    if (detRes.rows.length > 0) {
      const { produit_id, ...rest } = detRes.rows[0];
      details = rest;
    }
  }

  const tarifsRes = await query(
    `SELECT t.id, t.client_id, t.prix_vente, t.taux_tva, t.notes,
            c.numero_client, c.raison_sociale AS client_nom
     FROM produit_tarifs_clients t
     JOIN clients c ON c.id = t.client_id
     WHERE t.produit_id = $1
     ORDER BY c.raison_sociale`,
    [id]
  );

  const comptaRes = await query(
    'SELECT compte_vente, compte_achat, code_analytique, centre_cout FROM produit_comptabilite WHERE produit_id = $1',
    [id]
  );

  return {
    ...produit,
    details,
    tarifs_clients: tarifsRes.rows,
    comptabilite: comptaRes.rows[0] || null,
  };
}

// ── CREATE ──────────────────────────────────────────────────────────────────────

export async function createProduit(data) {
  if (data.reference) {
    const dupRef = await query('SELECT id FROM catalogue_produits WHERE reference = $1', [data.reference]);
    if (dupRef.rows.length > 0) throw ApiError.conflict('Un produit avec cette référence existe déjà');
  }

  const prix_revient = computePrixRevient(data);
  const prix_public = computePrixPublic(data);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const prodResult = await client.query(
      `INSERT INTO catalogue_produits (
        reference, designation, description, categorie, unite,
        prix_unitaire_ht, taux_tva, type_document,
        fournisseur_id, marque_id, famille_id, modele,
        reference_fournisseur, code_barre,
        contribution_environnement, frais_divers,
        prix_achat, prix_revient, prix_vendeur, prix_public, marge_pourcentage,
        quantite_stock, alerte_stock_mini, quantite_reapprovisionnement,
        hors_catalogue
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
      ) RETURNING id`,
      [
        data.reference,
        data.designation,
        data.description || null,
        data.categorie || null,
        data.unite || 'unité',
        data.prix_unitaire_ht ?? 0,
        data.taux_tva ?? 20,
        data.type_document || 'MARCHANDISE',
        data.fournisseur_id || null,
        data.marque_id || null,
        data.famille_id || null,
        data.modele || null,
        data.reference_fournisseur || null,
        data.code_barre || null,
        data.contribution_environnement ?? 0,
        data.frais_divers ?? 0,
        data.prix_achat ?? null,
        prix_revient || null,
        data.prix_vendeur ?? null,
        prix_public,
        data.marge_pourcentage ?? null,
        data.quantite_stock ?? 0,
        data.alerte_stock_mini ?? 0,
        data.quantite_reapprovisionnement ?? 0,
        data.hors_catalogue ?? false,
      ]
    );

    const produitId = prodResult.rows[0].id;

    if (data.categorie && DETAIL_TABLES[data.categorie] && data.details) {
      await upsertDetails(client, produitId, data.categorie, data.details);
    }

    if (data.comptabilite) {
      await upsertComptabilite(client, produitId, data.comptabilite);
    }

    await client.query('COMMIT');
    return getProduitById(produitId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── UPDATE ──────────────────────────────────────────────────────────────────────

export async function updateProduit(id, data) {
  const existing = await query('SELECT id, categorie FROM catalogue_produits WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Produit non trouvé');

  if (data.reference) {
    const dup = await query('SELECT id FROM catalogue_produits WHERE reference = $1 AND id != $2', [data.reference, id]);
    if (dup.rows.length > 0) throw ApiError.conflict('Un produit avec cette référence existe déjà');
  }

  const prix_revient = computePrixRevient(data);
  const prix_public = computePrixPublic(data);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const allowedFields = [
      'reference', 'designation', 'description', 'categorie', 'unite',
      'prix_unitaire_ht', 'taux_tva', 'actif', 'type_document',
      'fournisseur_id', 'marque_id', 'famille_id', 'modele',
      'reference_fournisseur', 'code_barre',
      'contribution_environnement', 'frais_divers',
      'prix_achat', 'prix_vendeur', 'marge_pourcentage',
      'quantite_stock', 'alerte_stock_mini', 'quantite_reapprovisionnement',
      'hors_catalogue',
    ];

    const sets = [];
    const vals = [];
    let i = 1;

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        sets.push(`${field} = $${i++}`);
        vals.push(data[field] === '' ? null : data[field]);
      }
    }

    sets.push(`prix_revient = $${i++}`);
    vals.push(prix_revient || null);
    sets.push(`prix_public = $${i++}`);
    vals.push(prix_public);

    sets.push('updated_at = NOW()');
    vals.push(id);

    await client.query(
      `UPDATE catalogue_produits SET ${sets.join(', ')} WHERE id = $${i}`,
      vals
    );

    const oldCat = existing.rows[0].categorie;
    const newCat = data.categorie !== undefined ? data.categorie : oldCat;

    if (oldCat && oldCat !== newCat && DETAIL_TABLES[oldCat]) {
      await client.query(`DELETE FROM ${DETAIL_TABLES[oldCat]} WHERE produit_id = $1`, [id]);
    }

    if (newCat && DETAIL_TABLES[newCat] && data.details) {
      await upsertDetails(client, id, newCat, data.details);
    }

    if (data.comptabilite) {
      await upsertComptabilite(client, id, data.comptabilite);
    }

    await client.query('COMMIT');
    return getProduitById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── DELETE (soft) ───────────────────────────────────────────────────────────────

export async function deleteProduit(id) {
  const result = await query(
    `UPDATE catalogue_produits SET actif = false, updated_at = NOW() WHERE id = $1
     RETURNING id, reference, designation, actif`,
    [id]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Produit non trouvé');
  return result.rows[0];
}

// ── DELETE ALL ──────────────────────────────────────────────────────────────────

export async function deleteAllProduits() {
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    await conn.query('UPDATE devis_lignes SET catalogue_id = NULL');
    await conn.query('UPDATE contrat_lignes SET catalogue_produit_id = NULL');
    await conn.query('UPDATE contrat_machines SET catalogue_produit_id = NULL');
    // CASCADE supprime : détails catégorie, tarifs clients, comptabilité
    const result = await conn.query('DELETE FROM catalogue_produits RETURNING id');
    await conn.query('COMMIT');
    return { deletedCount: result.rowCount };
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    conn.release();
  }
}

// ── DUPLICATE ───────────────────────────────────────────────────────────────────

export async function duplicateProduit(id) {
  const original = await getProduitById(id);
  if (!original) throw ApiError.notFound('Produit non trouvé');

  const newRef = `${original.reference}-COPY`;
  const dupRef = await query('SELECT id FROM catalogue_produits WHERE reference = $1', [newRef]);
  const finalRef = dupRef.rows.length > 0 ? `${original.reference}-COPY-${Date.now()}` : newRef;

  const data = {
    ...original,
    reference: finalRef,
    image_url: null,
  };

  return createProduit(data);
}

// ── TARIFS CLIENTS ──────────────────────────────────────────────────────────────

export async function listTarifsClients(produitId) {
  const result = await query(
    `SELECT t.id, t.client_id, t.prix_vente, t.taux_tva, t.notes,
            c.numero_client, c.raison_sociale AS client_nom
     FROM produit_tarifs_clients t
     JOIN clients c ON c.id = t.client_id
     WHERE t.produit_id = $1
     ORDER BY c.raison_sociale`,
    [produitId]
  );
  return result.rows;
}

export async function createTarifClient(produitId, data) {
  const dup = await query(
    'SELECT id FROM produit_tarifs_clients WHERE produit_id = $1 AND client_id = $2',
    [produitId, data.client_id]
  );
  if (dup.rows.length > 0) throw ApiError.conflict('Un tarif existe déjà pour ce client');

  const result = await query(
    `INSERT INTO produit_tarifs_clients (produit_id, client_id, prix_vente, taux_tva, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [produitId, data.client_id, data.prix_vente, data.taux_tva ?? 20, data.notes || null]
  );
  return result.rows[0];
}

export async function updateTarifClient(produitId, tarifId, data) {
  const sets = [];
  const vals = [];
  let i = 1;

  for (const field of ['prix_vente', 'taux_tva', 'notes']) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${i++}`);
      vals.push(data[field] === '' ? null : data[field]);
    }
  }
  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  sets.push('updated_at = NOW()');
  vals.push(produitId, tarifId);

  const result = await query(
    `UPDATE produit_tarifs_clients SET ${sets.join(', ')} WHERE produit_id = $${i} AND id = $${i + 1} RETURNING *`,
    vals
  );
  if (result.rows.length === 0) throw ApiError.notFound('Tarif non trouvé');
  return result.rows[0];
}

export async function deleteTarifClient(produitId, tarifId) {
  const result = await query(
    'DELETE FROM produit_tarifs_clients WHERE produit_id = $1 AND id = $2 RETURNING id',
    [produitId, tarifId]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Tarif non trouvé');
  return { deleted: true };
}

// ── IMAGE UPLOAD ────────────────────────────────────────────────────────────────

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function deleteOldImage(imageUrl) {
  if (!imageUrl) return;
  if (imageUrl.startsWith('http') && isFirebaseReady()) {
    try {
      const u = new URL(imageUrl);
      const encoded = u.pathname.split('/o/')[1]?.split('?')[0];
      const fbPath = encoded ? decodeURIComponent(encoded) : null;
      if (fbPath) await bucket.file(fbPath).delete().catch(() => {});
    } catch { /* ignore */ }
  } else if (imageUrl.startsWith('/uploads/')) {
    const localPath = path.resolve('uploads', imageUrl.replace(/^\/uploads\//, ''));
    await fs.unlink(localPath).catch(() => {});
  }
}

export async function uploadImage(id, file) {
  const existing = await query('SELECT id, image_url FROM catalogue_produits WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Produit non trouvé');

  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    throw ApiError.badRequest('Format non supporté. Formats acceptés : JPG, PNG, WEBP');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw ApiError.badRequest('Le fichier ne doit pas dépasser 5 Mo');
  }

  await deleteOldImage(existing.rows[0].image_url);

  const filename = `produit-${id}-${Date.now()}${ext}`;
  let imageUrl;

  if (isFirebaseReady()) {
    const firebaseFile = bucket.file(`images/produits/${filename}`);
    await firebaseFile.save(file.buffer, {
      metadata: { contentType: MIME_MAP[ext] || 'application/octet-stream' },
      public: true,
    });
    imageUrl = `https://storage.googleapis.com/${bucket.name}/images/produits/${filename}`;
  } else {
    await fs.mkdir(path.resolve('uploads/images/produits'), { recursive: true });
    await fs.writeFile(path.resolve('uploads/images/produits', filename), file.buffer);
    imageUrl = `/uploads/images/produits/${filename}`;
  }

  await query('UPDATE catalogue_produits SET image_url = $1, updated_at = NOW() WHERE id = $2', [imageUrl, id]);
  return { image_url: imageUrl };
}

export async function deleteImage(id) {
  const existing = await query('SELECT id, image_url FROM catalogue_produits WHERE id = $1', [id]);
  if (existing.rows.length === 0) throw ApiError.notFound('Produit non trouvé');

  await deleteOldImage(existing.rows[0].image_url);
  await query('UPDATE catalogue_produits SET image_url = NULL, updated_at = NOW() WHERE id = $1', [id]);
  return { deleted: true };
}

// ── EXPORT ──────────────────────────────────────────────────────────────────────

export async function getProduitsForExport({ categorie, search, actif }) {
  const conditions = [];
  const params = [];
  let i = 1;

  if (actif !== undefined) {
    conditions.push(`p.actif = $${i++}`);
    params.push(actif === 'true' || actif === true);
  }
  if (categorie) {
    conditions.push(`p.categorie = $${i++}`);
    params.push(categorie);
  }
  if (search) {
    conditions.push(`(p.designation ILIKE $${i} OR p.reference ILIKE $${i} OR p.description ILIKE $${i} OR p.modele ILIKE $${i} OR m.nom ILIKE $${i})`);
    params.push(`%${search}%`);
    i++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query(
    `SELECT ${LIST_FIELDS},
            f.nom AS fournisseur_nom,
            m.nom AS marque_nom,
            fam.nom AS famille_nom
     FROM catalogue_produits p
     LEFT JOIN fournisseurs f ON f.id = p.fournisseur_id
     LEFT JOIN marques m ON m.id = p.marque_id
     LEFT JOIN familles_produits fam ON fam.id = p.famille_id
     ${where}
     ORDER BY p.categorie, p.designation`,
    params,
  );

  return result.rows;
}

// ── NAVIGATION (précédent / suivant) ────────────────────────────────────────────

export async function getAdjacentIds(id) {
  const result = await query(
    `WITH ordered AS (
       SELECT id, ROW_NUMBER() OVER (ORDER BY categorie, designation) AS rn
       FROM catalogue_produits
     )
     SELECT
       (SELECT id FROM ordered WHERE rn = o.rn - 1) AS prev_id,
       (SELECT id FROM ordered WHERE rn = o.rn + 1) AS next_id
     FROM ordered o
     WHERE o.id = $1`,
    [id]
  );
  if (result.rows.length === 0) return { prev_id: null, next_id: null };
  return result.rows[0];
}

// ── HELPERS ─────────────────────────────────────────────────────────────────────

async function upsertDetails(client, produitId, categorie, details) {
  const table = DETAIL_TABLES[categorie];
  const fields = DETAIL_FIELDS[categorie];
  if (!table || !fields) return;

  const existing = await client.query(`SELECT produit_id FROM ${table} WHERE produit_id = $1`, [produitId]);

  const filteredFields = fields.filter(f => details[f] !== undefined);
  if (filteredFields.length === 0 && existing.rows.length === 0) return;

  if (existing.rows.length > 0) {
    if (filteredFields.length === 0) return;
    const sets = filteredFields.map((f, idx) => `${f} = $${idx + 2}`);
    const vals = [produitId, ...filteredFields.map(f => details[f] === '' ? null : details[f])];
    await client.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE produit_id = $1`, vals);
  } else {
    const cols = ['produit_id', ...filteredFields];
    const placeholders = cols.map((_, idx) => `$${idx + 1}`);
    const vals = [produitId, ...filteredFields.map(f => details[f] === '' ? null : details[f])];
    await client.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`, vals);
  }
}

async function upsertComptabilite(client, produitId, compta) {
  const fields = ['compte_vente', 'compte_achat', 'code_analytique', 'centre_cout'];
  const existing = await client.query('SELECT produit_id FROM produit_comptabilite WHERE produit_id = $1', [produitId]);

  if (existing.rows.length > 0) {
    const sets = fields.map((f, idx) => `${f} = $${idx + 2}`);
    const vals = [produitId, ...fields.map(f => compta[f] === '' ? null : (compta[f] ?? null))];
    await client.query(`UPDATE produit_comptabilite SET ${sets.join(', ')} WHERE produit_id = $1`, vals);
  } else {
    const cols = ['produit_id', ...fields];
    const placeholders = cols.map((_, idx) => `$${idx + 1}`);
    const vals = [produitId, ...fields.map(f => compta[f] === '' ? null : (compta[f] ?? null))];
    await client.query(`INSERT INTO produit_comptabilite (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`, vals);
  }
}
