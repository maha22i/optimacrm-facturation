import { query, pool } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

// ---------------------------------------------------------------------------
// Numérotation
// ---------------------------------------------------------------------------

async function generateNumeroDevis(client) {
  const year = new Date().getFullYear();
  const result = await client.query("SELECT nextval('devis_numero_seq')::int AS seq");
  return `DEV-${year}-${String(result.rows[0].seq).padStart(5, '0')}`;
}

async function generateNumeroBonCommande(client) {
  const year = new Date().getFullYear();
  const result = await client.query("SELECT nextval('bon_commande_numero_seq')::int AS seq");
  return `BC-${year}-${String(result.rows[0].seq).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// Calcul montants
// ---------------------------------------------------------------------------

export function calculerMontantsLigne(ligne) {
  if (['COMMENTAIRE', 'SAUT_DE_LIGNE', 'SOUS_TOTAL'].includes(ligne.type)) {
    return { montant_ht: 0, montant_tva: 0, montant_ttc: 0 };
  }

  const qte = parseFloat(ligne.quantite) || 0;
  const prixUnit = parseFloat(ligne.prix_unitaire_ht) || 0;
  const brut = qte * prixUnit;

  let remise = 0;
  if (ligne.remise_ligne_type === 'POURCENTAGE') {
    remise = brut * ((parseFloat(ligne.remise_ligne_valeur) || 0) / 100);
  } else {
    remise = parseFloat(ligne.remise_ligne_valeur) || 0;
  }

  const montant_ht = Math.round((brut - remise) * 100) / 100;
  const tva = parseFloat(ligne.taux_tva) || 0;
  const montant_tva = Math.round(montant_ht * (tva / 100) * 100) / 100;
  const montant_ttc = Math.round((montant_ht + montant_tva) * 100) / 100;

  return { montant_ht, montant_tva, montant_ttc };
}

function calculerTotauxDevis(lignes, remiseGlobaleType, remiseGlobaleValeur) {
  const lignesActives = lignes.filter(l =>
    !l.est_optionnel && !['COMMENTAIRE', 'SAUT_DE_LIGNE', 'SOUS_TOTAL'].includes(l.type)
  );

  const totalHt = lignesActives.reduce((sum, l) => sum + parseFloat(l.montant_ht || 0), 0);

  let montantRemise = 0;
  if (remiseGlobaleType === 'POURCENTAGE') {
    montantRemise = totalHt * ((parseFloat(remiseGlobaleValeur) || 0) / 100);
  } else {
    montantRemise = parseFloat(remiseGlobaleValeur) || 0;
  }
  montantRemise = Math.round(montantRemise * 100) / 100;

  const totalHtApresRemise = Math.round((totalHt - montantRemise) * 100) / 100;

  const tvaParTaux = {};
  for (const l of lignesActives) {
    const taux = parseFloat(l.taux_tva) || 0;
    if (!tvaParTaux[taux]) tvaParTaux[taux] = 0;
    tvaParTaux[taux] += parseFloat(l.montant_ht || 0);
  }

  let totalTva = 0;
  const ratio = totalHt > 0 ? totalHtApresRemise / totalHt : 0;
  for (const [taux, baseHt] of Object.entries(tvaParTaux)) {
    const baseApresRemise = baseHt * ratio;
    totalTva += baseApresRemise * (parseFloat(taux) / 100);
  }
  totalTva = Math.round(totalTva * 100) / 100;

  const totalTtc = Math.round((totalHtApresRemise + totalTva) * 100) / 100;

  return {
    montant_ht: Math.round(totalHt * 100) / 100,
    montant_remise: montantRemise,
    montant_ht_apres_remise: totalHtApresRemise,
    montant_tva: totalTva,
    montant_ttc: totalTtc,
  };
}

export async function recalculerDevis(dbClient, devisId) {
  const lignesRes = await dbClient.query(
    'SELECT * FROM devis_lignes WHERE devis_id = $1 ORDER BY ordre',
    [devisId]
  );

  const devisRes = await dbClient.query(
    'SELECT remise_globale_type, remise_globale_valeur FROM devis WHERE id = $1',
    [devisId]
  );
  const devis = devisRes.rows[0];

  const totaux = calculerTotauxDevis(
    lignesRes.rows,
    devis.remise_globale_type,
    devis.remise_globale_valeur
  );

  await dbClient.query(
    `UPDATE devis SET
      montant_ht = $1, montant_remise = $2, montant_ht_apres_remise = $3,
      montant_tva = $4, montant_ttc = $5, updated_at = NOW()
     WHERE id = $6`,
    [totaux.montant_ht, totaux.montant_remise, totaux.montant_ht_apres_remise,
     totaux.montant_tva, totaux.montant_ttc, devisId]
  );

  return totaux;
}

// ---------------------------------------------------------------------------
// Historique
// ---------------------------------------------------------------------------

async function ajouterHistorique(dbClient, devisId, userId, action, detail = null) {
  await dbClient.query(
    'INSERT INTO devis_historique (devis_id, user_id, action, detail) VALUES ($1, $2, $3, $4)',
    [devisId, userId, action, detail]
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEVIS_FIELDS = `
  d.id, d.numero_devis, d.client_id, d.contact_id,
  d.adresse_facturation_id, d.adresse_livraison_id,
  d.statut, d.date_creation, d.date_emission, d.date_validite,
  d.date_acceptation, d.date_transformation,
  d.objet, d.reference_client, d.commercial_id,
  d.nom_client_libre, d.commercial,
  d.date_relance, d.prevision_signature, d.probabilite_signature,
  d.situation_affaire, d.date_validation, d.type_produit,
  d.total_achat_ht, d.marge_realisee, d.taux_marge, d.taux_marque,
  d.facture_liee, d.ordre_service, d.provenance,
  d.conditions_paiement, d.mode_paiement, d.devise,
  d.remise_globale_type, d.remise_globale_valeur,
  d.montant_ht, d.montant_remise, d.montant_ht_apres_remise,
  d.montant_tva, d.montant_ttc,
  d.notes_internes, d.conditions_generales, d.message_client,
  d.signature_client, d.date_signature, d.ip_signature,
  d.facture_id, d.bon_commande_id,
  d.created_at, d.updated_at
`;

function ensureModifiable(devis) {
  if (['FACTURE', 'EXPIRE'].includes(devis.statut)) {
    throw ApiError.badRequest('Ce devis ne peut plus être modifié (statut: ' + devis.statut + ')');
  }
}

async function getDevisOrFail(devisId) {
  const res = await query(
    `SELECT ${DEVIS_FIELDS} FROM devis d WHERE d.id = $1 AND d.deleted_at IS NULL`,
    [devisId]
  );
  if (res.rows.length === 0) throw ApiError.notFound('Devis non trouvé');
  return res.rows[0];
}

// ---------------------------------------------------------------------------
// CRUD Devis
// ---------------------------------------------------------------------------

export async function listDevis({ page = 1, limit = 10, statut, client_id, commercial_id, date_debut, date_fin, search }) {
  const offset = (page - 1) * limit;
  const conditions = ['d.deleted_at IS NULL'];
  const params = [];
  let i = 1;

  if (statut) {
    conditions.push(`d.statut = $${i++}`);
    params.push(statut);
  }
  if (client_id) {
    conditions.push(`d.client_id = $${i++}`);
    params.push(parseInt(client_id));
  }
  if (commercial_id) {
    conditions.push(`d.commercial_id = $${i++}`);
    params.push(commercial_id);
  }
  if (date_debut) {
    conditions.push(`d.date_creation >= $${i++}`);
    params.push(date_debut);
  }
  if (date_fin) {
    conditions.push(`d.date_creation <= $${i++}`);
    params.push(date_fin);
  }
  if (search) {
    conditions.push(`(
      d.numero_devis ILIKE $${i} OR
      d.objet ILIKE $${i} OR
      d.reference_client ILIKE $${i} OR
      d.nom_client_libre ILIKE $${i} OR
      c.raison_sociale ILIKE $${i}
    )`);
    params.push(`%${search}%`);
    i++;
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const [devisRes, countRes] = await Promise.all([
    query(
      `SELECT ${DEVIS_FIELDS},
        c.raison_sociale AS client_raison_sociale_fiche,
        c.numero_client,
        COALESCE(NULLIF(TRIM(d.nom_client_libre), ''), c.raison_sociale) AS client_nom
       FROM devis d
       LEFT JOIN clients c ON c.id = d.client_id
       ${where}
       ORDER BY d.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, limit, offset]
    ),
    query(`SELECT COUNT(*)::int AS total FROM devis d LEFT JOIN clients c ON c.id = d.client_id ${where}`, params),
  ]);

  return {
    devis: devisRes.rows,
    pagination: {
      page,
      limit,
      total: countRes.rows[0].total,
      totalPages: Math.ceil(countRes.rows[0].total / limit),
    },
  };
}

export async function getDevisStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

  const [totalMois, enAttente, acceptesMois, conversion] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(montant_ttc), 0)::decimal AS montant
       FROM devis WHERE deleted_at IS NULL AND date_creation >= $1`,
      [startOfMonth]
    ),
    query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(montant_ttc), 0)::decimal AS montant
       FROM devis WHERE deleted_at IS NULL AND statut = 'ENVOYE'`
    ),
    query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(montant_ttc), 0)::decimal AS montant
       FROM devis WHERE deleted_at IS NULL AND statut = 'ACCEPTE' AND date_acceptation >= $1`,
      [startOfMonth]
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE statut IN ('ACCEPTE','FACTURE'))::int AS acceptes,
         COUNT(*) FILTER (WHERE statut IN ('ACCEPTE','FACTURE','ENVOYE','REFUSE','EXPIRE'))::int AS total
       FROM devis WHERE deleted_at IS NULL`
    ),
  ]);

  const convRow = conversion.rows[0];
  const taux = convRow.total > 0 ? Math.round((convRow.acceptes / convRow.total) * 10000) / 100 : 0;

  return {
    total_mois: { count: totalMois.rows[0].count, montant: parseFloat(totalMois.rows[0].montant) },
    en_attente: { count: enAttente.rows[0].count, montant: parseFloat(enAttente.rows[0].montant) },
    acceptes_mois: { count: acceptesMois.rows[0].count, montant: parseFloat(acceptesMois.rows[0].montant) },
    taux_conversion: taux,
  };
}

export async function getDevisById(id) {
  const devis = await getDevisOrFail(id);

  const [lignesRes, champsRes, historiqueRes, clientRes, contactRes, adresseFactRes, adrLivRes] = await Promise.all([
    query('SELECT * FROM devis_lignes WHERE devis_id = $1 ORDER BY ordre', [id]),
    query('SELECT * FROM devis_champs_personnalises WHERE devis_id = $1 ORDER BY ordre', [id]),
    query('SELECT h.*, u.first_name, u.last_name FROM devis_historique h LEFT JOIN users u ON u.id = h.user_id WHERE h.devis_id = $1 ORDER BY h.created_at DESC', [id]),
    query('SELECT id, numero_client, raison_sociale, email_principal, telephone_principal, siret, tva_intracommunautaire FROM clients WHERE id = $1', [devis.client_id]),
    devis.contact_id ? query('SELECT * FROM client_contacts WHERE id = $1', [devis.contact_id]) : { rows: [] },
    devis.adresse_facturation_id ? query('SELECT * FROM client_adresses WHERE id = $1', [devis.adresse_facturation_id]) : { rows: [] },
    devis.adresse_livraison_id ? query('SELECT * FROM client_adresses WHERE id = $1', [devis.adresse_livraison_id]) : { rows: [] },
  ]);

  return {
    ...devis,
    client: clientRes.rows[0] || null,
    contact: contactRes.rows[0] || null,
    adresse_facturation: adresseFactRes.rows[0] || null,
    adresse_livraison: adrLivRes.rows[0] || null,
    lignes: lignesRes.rows,
    champs_personnalises: champsRes.rows,
    historique: historiqueRes.rows,
  };
}

export async function createDevis(data, userId) {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const numero = await generateNumeroDevis(dbClient);
    const dateValidite = data.date_validite || (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return d.toISOString().split('T')[0];
    })();

    const result = await dbClient.query(
      `INSERT INTO devis (
        numero_devis, client_id, contact_id, adresse_facturation_id, adresse_livraison_id,
        statut, date_emission, date_validite, objet, reference_client, commercial_id,
        conditions_paiement, mode_paiement, devise,
        remise_globale_type, remise_globale_valeur,
        notes_internes, conditions_generales, message_client
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *`,
      [
        numero,
        data.client_id,
        data.contact_id || null,
        data.adresse_facturation_id || null,
        data.adresse_livraison_id || null,
        'BROUILLON',
        data.date_emission || null,
        dateValidite,
        data.objet,
        data.reference_client || null,
        data.commercial_id || null,
        data.conditions_paiement || '30_JOURS',
        data.mode_paiement || 'VIREMENT',
        data.devise || 'EUR',
        data.remise_globale_type || 'POURCENTAGE',
        data.remise_globale_valeur ?? 0,
        data.notes_internes || null,
        data.conditions_generales || null,
        data.message_client || null,
      ]
    );

    const devis = result.rows[0];

    if (data.lignes && Array.isArray(data.lignes)) {
      for (let idx = 0; idx < data.lignes.length; idx++) {
        const l = data.lignes[idx];
        const montants = calculerMontantsLigne(l);
        await dbClient.query(
          `INSERT INTO devis_lignes (
            devis_id, ordre, type, reference, designation, description_detaillee, unite,
            quantite, prix_unitaire_ht, remise_ligne_type, remise_ligne_valeur, taux_tva,
            montant_ht, montant_tva, montant_ttc, est_optionnel, catalogue_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            devis.id, idx, l.type || 'PRODUIT',
            l.reference || null, l.designation || null, l.description_detaillee || null, l.unite || null,
            l.quantite ?? 1, l.prix_unitaire_ht ?? 0,
            l.remise_ligne_type || 'POURCENTAGE', l.remise_ligne_valeur ?? 0, l.taux_tva ?? 20,
            montants.montant_ht, montants.montant_tva, montants.montant_ttc,
            l.est_optionnel ?? false, l.catalogue_id || null,
          ]
        );
      }
    }

    await recalculerDevis(dbClient, devis.id);
    await ajouterHistorique(dbClient, devis.id, userId, 'CREATION', `Devis ${numero} créé`);

    await dbClient.query('COMMIT');
    return getDevisById(devis.id);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

export async function updateDevis(id, data, userId) {
  const devis = await getDevisOrFail(id);
  ensureModifiable(devis);

  const allowedFields = [
    'client_id', 'contact_id', 'adresse_facturation_id', 'adresse_livraison_id',
    'date_emission', 'date_validite', 'objet', 'reference_client', 'commercial_id',
    'nom_client_libre',
    'conditions_paiement', 'mode_paiement', 'devise',
    'remise_globale_type', 'remise_globale_valeur',
    'notes_internes', 'conditions_generales', 'message_client',
  ];

  const sets = [];
  const vals = [];
  let i = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${i++}`);
      vals.push(data[field]);
    }
  }

  if (sets.length === 0 && !data.lignes) {
    throw ApiError.badRequest('Aucun champ à mettre à jour');
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    if (sets.length > 0) {
      sets.push('updated_at = NOW()');
      vals.push(id);
      await dbClient.query(
        `UPDATE devis SET ${sets.join(', ')} WHERE id = $${i}`,
        vals
      );
    }

    if (data.lignes && Array.isArray(data.lignes)) {
      await dbClient.query('DELETE FROM devis_lignes WHERE devis_id = $1', [id]);
      for (let idx = 0; idx < data.lignes.length; idx++) {
        const l = data.lignes[idx];
        const montants = calculerMontantsLigne(l);
        await dbClient.query(
          `INSERT INTO devis_lignes (
            devis_id, ordre, type, reference, designation, description_detaillee, unite,
            quantite, prix_unitaire_ht, remise_ligne_type, remise_ligne_valeur, taux_tva,
            montant_ht, montant_tva, montant_ttc, est_optionnel, catalogue_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
          [
            id, idx, l.type || 'PRODUIT',
            l.reference || null, l.designation || null, l.description_detaillee || null, l.unite || null,
            l.quantite ?? 1, l.prix_unitaire_ht ?? 0,
            l.remise_ligne_type || 'POURCENTAGE', l.remise_ligne_valeur ?? 0, l.taux_tva ?? 20,
            montants.montant_ht, montants.montant_tva, montants.montant_ttc,
            l.est_optionnel ?? false, l.catalogue_id || null,
          ]
        );
      }
    }

    await recalculerDevis(dbClient, id);
    await ajouterHistorique(dbClient, id, userId, 'MODIFICATION', 'Devis modifié');
    await dbClient.query('COMMIT');

    return getDevisById(id);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

export async function deleteDevis(id, userId) {
  const devis = await getDevisOrFail(id);
  if (!['BROUILLON', 'REFUSE'].includes(devis.statut)) {
    throw ApiError.badRequest('Seuls les devis en BROUILLON ou REFUSE peuvent être supprimés');
  }

  await query('UPDATE devis SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1', [id]);
  const dbClient = await pool.connect();
  try {
    await ajouterHistorique(dbClient, id, userId, 'SUPPRESSION', 'Devis supprimé');
  } finally {
    dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Actions de workflow
// ---------------------------------------------------------------------------

export async function envoyerDevis(id, userId, emailData) {
  const devis = await getDevisOrFail(id);
  if (devis.statut !== 'BROUILLON' && devis.statut !== 'ENVOYE') {
    throw ApiError.badRequest('Le devis doit être en BROUILLON ou ENVOYE pour être envoyé');
  }

  const now = new Date().toISOString().split('T')[0];
  await query(
    `UPDATE devis SET statut = 'ENVOYE', date_emission = COALESCE(date_emission, $1), updated_at = NOW()
     WHERE id = $2`,
    [now, id]
  );

  const dbClient = await pool.connect();
  try {
    await ajouterHistorique(dbClient, id, userId, 'ENVOI', `Devis envoyé par email à ${emailData?.destinataire || 'client'}`);
  } finally {
    dbClient.release();
  }

  return getDevisById(id);
}

export async function accepterDevis(id, userId) {
  const devis = await getDevisOrFail(id);
  if (devis.statut !== 'ENVOYE') {
    throw ApiError.badRequest('Seul un devis ENVOYE peut être accepté');
  }

  const now = new Date().toISOString().split('T')[0];
  await query(
    `UPDATE devis SET statut = 'ACCEPTE', date_acceptation = $1, updated_at = NOW() WHERE id = $2`,
    [now, id]
  );

  const dbClient = await pool.connect();
  try {
    await ajouterHistorique(dbClient, id, userId, 'ACCEPTATION', 'Devis accepté');
  } finally {
    dbClient.release();
  }

  return getDevisById(id);
}

export async function refuserDevis(id, userId, motif) {
  const devis = await getDevisOrFail(id);
  if (devis.statut !== 'ENVOYE') {
    throw ApiError.badRequest('Seul un devis ENVOYE peut être refusé');
  }

  await query(
    `UPDATE devis SET statut = 'REFUSE', updated_at = NOW() WHERE id = $1`,
    [id]
  );

  const dbClient = await pool.connect();
  try {
    await ajouterHistorique(dbClient, id, userId, 'REFUS', motif || 'Devis refusé');
  } finally {
    dbClient.release();
  }

  return getDevisById(id);
}

export async function dupliquerDevis(id, userId) {
  const original = await getDevisById(id);

  const dataNouveau = {
    client_id: original.client_id,
    contact_id: original.contact_id,
    adresse_facturation_id: original.adresse_facturation_id,
    adresse_livraison_id: original.adresse_livraison_id,
    objet: `${original.objet} (copie)`,
    reference_client: original.reference_client,
    commercial_id: original.commercial_id,
    conditions_paiement: original.conditions_paiement,
    mode_paiement: original.mode_paiement,
    devise: original.devise,
    remise_globale_type: original.remise_globale_type,
    remise_globale_valeur: original.remise_globale_valeur,
    notes_internes: original.notes_internes,
    conditions_generales: original.conditions_generales,
    message_client: original.message_client,
    lignes: original.lignes.map(l => ({
      type: l.type,
      reference: l.reference,
      designation: l.designation,
      description_detaillee: l.description_detaillee,
      unite: l.unite,
      quantite: l.quantite,
      prix_unitaire_ht: l.prix_unitaire_ht,
      remise_ligne_type: l.remise_ligne_type,
      remise_ligne_valeur: l.remise_ligne_valeur,
      taux_tva: l.taux_tva,
      est_optionnel: l.est_optionnel,
      catalogue_id: l.catalogue_id,
    })),
  };

  return createDevis(dataNouveau, userId);
}

export async function transformerEnFacture(id, userId) {
  const devis = await getDevisOrFail(id);
  if (devis.statut !== 'ACCEPTE') {
    throw ApiError.badRequest('Seul un devis ACCEPTE peut être transformé en facture');
  }

  // Pour l'instant, on marque le devis comme FACTURE
  // La création effective de la facture sera implémentée avec le module Factures
  const now = new Date().toISOString().split('T')[0];
  await query(
    `UPDATE devis SET statut = 'FACTURE', date_transformation = $1, updated_at = NOW() WHERE id = $2`,
    [now, id]
  );

  const dbClient = await pool.connect();
  try {
    await ajouterHistorique(dbClient, id, userId, 'TRANSFORMATION_FACTURE', 'Devis transformé en facture');
  } finally {
    dbClient.release();
  }

  return getDevisById(id);
}

export async function transformerEnBonCommande(id, userId) {
  const devis = await getDevisOrFail(id);
  if (!['ACCEPTE', 'ENVOYE'].includes(devis.statut)) {
    throw ApiError.badRequest('Le devis doit être ENVOYE ou ACCEPTE pour créer un bon de commande');
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const numeroBC = await generateNumeroBonCommande(dbClient);

    const bcResult = await dbClient.query(
      `INSERT INTO bons_commande (numero_bc, devis_id, client_id, statut, date_emission, notes)
       VALUES ($1, $2, $3, 'EN_ATTENTE', CURRENT_DATE, $4)
       RETURNING *`,
      [numeroBC, id, devis.client_id, `Bon de commande issu du devis ${devis.numero_devis}`]
    );

    const bc = bcResult.rows[0];

    await dbClient.query(
      'UPDATE devis SET bon_commande_id = $1, updated_at = NOW() WHERE id = $2',
      [bc.id, id]
    );

    await ajouterHistorique(dbClient, id, userId, 'CREATION_BON_COMMANDE', `Bon de commande ${numeroBC} créé`);

    await dbClient.query('COMMIT');
    return bc;
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Lignes individuelles
// ---------------------------------------------------------------------------

export async function ajouterLigne(devisId, data, userId) {
  const devis = await getDevisOrFail(devisId);
  ensureModifiable(devis);

  const maxOrdreRes = await query(
    'SELECT COALESCE(MAX(ordre), -1) + 1 AS next_ordre FROM devis_lignes WHERE devis_id = $1',
    [devisId]
  );

  const montants = calculerMontantsLigne(data);

  const result = await query(
    `INSERT INTO devis_lignes (
      devis_id, ordre, type, reference, designation, description_detaillee, unite,
      quantite, prix_unitaire_ht, remise_ligne_type, remise_ligne_valeur, taux_tva,
      montant_ht, montant_tva, montant_ttc, est_optionnel, catalogue_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    RETURNING *`,
    [
      devisId, maxOrdreRes.rows[0].next_ordre, data.type || 'PRODUIT',
      data.reference || null, data.designation || null, data.description_detaillee || null, data.unite || null,
      data.quantite ?? 1, data.prix_unitaire_ht ?? 0,
      data.remise_ligne_type || 'POURCENTAGE', data.remise_ligne_valeur ?? 0, data.taux_tva ?? 20,
      montants.montant_ht, montants.montant_tva, montants.montant_ttc,
      data.est_optionnel ?? false, data.catalogue_id || null,
    ]
  );

  const dbClient = await pool.connect();
  try {
    await recalculerDevis(dbClient, devisId);
  } finally {
    dbClient.release();
  }

  return result.rows[0];
}

export async function modifierLigne(devisId, ligneId, data, userId) {
  const devis = await getDevisOrFail(devisId);
  ensureModifiable(devis);

  const existingRes = await query(
    'SELECT * FROM devis_lignes WHERE id = $1 AND devis_id = $2',
    [ligneId, devisId]
  );
  if (existingRes.rows.length === 0) throw ApiError.notFound('Ligne non trouvée');

  const merged = { ...existingRes.rows[0], ...data };
  const montants = calculerMontantsLigne(merged);

  const allowedFields = [
    'type', 'reference', 'designation', 'description_detaillee', 'unite',
    'quantite', 'prix_unitaire_ht', 'remise_ligne_type', 'remise_ligne_valeur',
    'taux_tva', 'est_optionnel', 'catalogue_id',
  ];

  const sets = [];
  const vals = [];
  let i = 1;
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${i++}`);
      vals.push(data[field]);
    }
  }

  sets.push(`montant_ht = $${i++}`);
  vals.push(montants.montant_ht);
  sets.push(`montant_tva = $${i++}`);
  vals.push(montants.montant_tva);
  sets.push(`montant_ttc = $${i++}`);
  vals.push(montants.montant_ttc);

  vals.push(ligneId, devisId);
  const result = await query(
    `UPDATE devis_lignes SET ${sets.join(', ')} WHERE id = $${i} AND devis_id = $${i + 1} RETURNING *`,
    vals
  );

  const dbClient = await pool.connect();
  try {
    await recalculerDevis(dbClient, devisId);
  } finally {
    dbClient.release();
  }

  return result.rows[0];
}

export async function supprimerLigne(devisId, ligneId, userId) {
  const devis = await getDevisOrFail(devisId);
  ensureModifiable(devis);

  const result = await query(
    'DELETE FROM devis_lignes WHERE id = $1 AND devis_id = $2 RETURNING id',
    [ligneId, devisId]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Ligne non trouvée');

  const dbClient = await pool.connect();
  try {
    await recalculerDevis(dbClient, devisId);
  } finally {
    dbClient.release();
  }
}

export async function reorderLignes(devisId, ordreIds, userId) {
  const devis = await getDevisOrFail(devisId);
  ensureModifiable(devis);

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');
    for (let idx = 0; idx < ordreIds.length; idx++) {
      await dbClient.query(
        'UPDATE devis_lignes SET ordre = $1 WHERE id = $2 AND devis_id = $3',
        [idx, ordreIds[idx], devisId]
      );
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
// Champs personnalisés
// ---------------------------------------------------------------------------

export async function listChamps(devisId) {
  await getDevisOrFail(devisId);
  const result = await query(
    'SELECT * FROM devis_champs_personnalises WHERE devis_id = $1 ORDER BY ordre',
    [devisId]
  );
  return result.rows;
}

export async function ajouterChamp(devisId, data) {
  await getDevisOrFail(devisId);

  const maxOrdreRes = await query(
    'SELECT COALESCE(MAX(ordre), -1) + 1 AS next FROM devis_champs_personnalises WHERE devis_id = $1',
    [devisId]
  );

  const result = await query(
    `INSERT INTO devis_champs_personnalises (devis_id, cle, label, valeur, type, ordre, afficher_sur_pdf)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      devisId,
      data.cle,
      data.label,
      data.valeur || null,
      data.type || 'TEXTE',
      maxOrdreRes.rows[0].next,
      data.afficher_sur_pdf ?? true,
    ]
  );
  return result.rows[0];
}

export async function modifierChamp(devisId, champId, data) {
  await getDevisOrFail(devisId);

  const allowedFields = ['cle', 'label', 'valeur', 'type', 'ordre', 'afficher_sur_pdf'];
  const sets = [];
  const vals = [];
  let i = 1;

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sets.push(`${field} = $${i++}`);
      vals.push(data[field]);
    }
  }

  if (sets.length === 0) throw ApiError.badRequest('Aucun champ à mettre à jour');

  vals.push(champId, devisId);
  const result = await query(
    `UPDATE devis_champs_personnalises SET ${sets.join(', ')} WHERE id = $${i} AND devis_id = $${i + 1} RETURNING *`,
    vals
  );
  if (result.rows.length === 0) throw ApiError.notFound('Champ personnalisé non trouvé');
  return result.rows[0];
}

export async function supprimerChamp(devisId, champId) {
  await getDevisOrFail(devisId);
  const result = await query(
    'DELETE FROM devis_champs_personnalises WHERE id = $1 AND devis_id = $2 RETURNING id',
    [champId, devisId]
  );
  if (result.rows.length === 0) throw ApiError.notFound('Champ personnalisé non trouvé');
}

export async function ajouterChampDepuisTemplate(devisId, templateId) {
  await getDevisOrFail(devisId);

  const templateRes = await query(
    'SELECT * FROM champs_personnalises_templates WHERE id = $1 AND actif = true',
    [templateId]
  );
  if (templateRes.rows.length === 0) throw ApiError.notFound('Template non trouvé');

  const t = templateRes.rows[0];
  return ajouterChamp(devisId, {
    cle: t.cle,
    label: t.label,
    valeur: t.valeur_defaut || '',
    type: t.type,
    afficher_sur_pdf: t.afficher_sur_pdf,
  });
}

// ---------------------------------------------------------------------------
// Expiration automatique
// ---------------------------------------------------------------------------

export async function expirerDevisObsoletes() {
  const result = await query(
    `UPDATE devis SET statut = 'EXPIRE', updated_at = NOW()
     WHERE statut = 'ENVOYE' AND date_validite < CURRENT_DATE AND deleted_at IS NULL
     RETURNING id, numero_devis`
  );

  for (const row of result.rows) {
    const dbClient = await pool.connect();
    try {
      await ajouterHistorique(dbClient, row.id, null, 'EXPIRATION', 'Devis expiré automatiquement');
    } finally {
      dbClient.release();
    }
  }

  return result.rows.length;
}
