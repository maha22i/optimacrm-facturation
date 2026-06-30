import { query, pool } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { toDateStr, addMonthsUTC, subDayUTC, periodEnd } from '../../utils/dateUtils.js';

// ---------------------------------------------------------------------------
// Numérotation
// ---------------------------------------------------------------------------

async function generateNumeroFacture(dbClient) {
  const result = await dbClient.query("SELECT nextval('facture_numero_seq')::int AS seq");
  return `FA-${String(result.rows[0].seq).padStart(5, '0')}`;
}


// ---------------------------------------------------------------------------
// Calculs
// ---------------------------------------------------------------------------

function calculerTotauxFacture(lignes, frais_techniques = 0, eco_contribution = 0, taux_tva = 20) {
  const lignesCalculables = lignes.filter(l =>
    !['COMMENTAIRE', 'SOUS_TOTAL', 'SAUT_DE_LIGNE'].includes(l.type_ligne)
  );

  const total_ht = lignesCalculables.reduce((sum, l) => sum + parseFloat(l.total_ht || 0), 0);
  const ftc = parseFloat(frais_techniques) || 0;
  const ect = parseFloat(eco_contribution) || 0;

  const base_tva = total_ht + ftc + ect;
  const montant_tva = Math.round(base_tva * (parseFloat(taux_tva) / 100) * 100) / 100;
  const total_ttc = Math.round((base_tva + montant_tva) * 100) / 100;

  return {
    total_ht: Math.round(total_ht * 100) / 100,
    frais_techniques: Math.round(ftc * 100) / 100,
    eco_contribution: Math.round(ect * 100) / 100,
    montant_tva,
    total_ttc,
  };
}

function calculerTotalLigne(ligne) {
  if (['COMMENTAIRE', 'SOUS_TOTAL', 'SAUT_DE_LIGNE'].includes(ligne.type_ligne)) {
    return 0;
  }
  const qte = parseFloat(ligne.quantite) || 0;
  const pu = parseFloat(ligne.prix_unitaire) || 0;
  const brut = qte * pu;

  let remise = 0;
  if (parseFloat(ligne.remise_pourcentage) > 0) {
    remise = brut * (parseFloat(ligne.remise_pourcentage) / 100);
  } else if (parseFloat(ligne.remise_montant) > 0) {
    remise = parseFloat(ligne.remise_montant);
  }

  return Math.round((brut - remise) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Historique
// ---------------------------------------------------------------------------

async function ajouterHistorique(dbClient, factureId, action, description, utilisateur) {
  await dbClient.query(
    `INSERT INTO facture_historique (facture_id, action, description, utilisateur) VALUES ($1, $2, $3, $4)`,
    [factureId, action, description, utilisateur]
  );
}

// ---------------------------------------------------------------------------
// Snapshot client
// ---------------------------------------------------------------------------

async function getClientSnapshot(dbClient, clientId) {
  const { rows: [client] } = await dbClient.query(
    `SELECT c.*, ca.ligne1, ca.ligne2, ca.code_postal, ca.ville
     FROM clients c
     LEFT JOIN client_adresses ca ON ca.client_id = c.id AND ca.est_defaut = true AND ca.type = 'FACTURATION'
     WHERE c.id = $1`,
    [clientId]
  );
  if (!client) throw new ApiError(404, 'Client introuvable');

  return {
    code_client: client.numero_client,
    client_raison_sociale: client.raison_sociale,
    client_adresse: [client.ligne1, client.ligne2].filter(Boolean).join(', '),
    client_cp: client.code_postal || '',
    client_ville: client.ville || '',
    client_email: client.email_principal,
    client_tva_numero: client.tva_intracommunautaire,
    mode_reglement: client.mode_paiement_prefere || 'Prélèvement',
  };
}

// ---------------------------------------------------------------------------
// Liste factures
// ---------------------------------------------------------------------------

export async function listFactures({ page, limit, statut, client_id, date_debut, date_fin, type_origine, type_contrat, search }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  let idx = 1;
  let joinContrats = false;

  if (statut) { conditions.push(`f.statut = $${idx++}`); params.push(statut); }
  if (client_id) { conditions.push(`f.client_id = $${idx++}`); params.push(client_id); }
  if (date_debut) { conditions.push(`f.date_creation >= $${idx++}`); params.push(date_debut); }
  if (date_fin) { conditions.push(`f.date_creation <= $${idx++}`); params.push(date_fin); }
  if (type_origine) { conditions.push(`f.type_origine = $${idx++}`); params.push(type_origine); }
  if (type_contrat) {
    joinContrats = true;
    conditions.push(`ct.type_contrat = $${idx++}`);
    params.push(type_contrat);
  }
  if (search) {
    conditions.push(`(f.numero_facture ILIKE $${idx} OR f.client_raison_sociale ILIKE $${idx} OR f.code_client ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const joinCt = joinContrats ? 'JOIN contrats ct ON ct.id = f.contrat_id' : '';

  const countRes = await query(`SELECT COUNT(*) FROM factures f ${joinCt} ${where}`, params);
  const total = parseInt(countRes.rows[0].count);

  const dataRes = await query(
    `SELECT f.*, c.raison_sociale AS client_nom
     FROM factures f
     LEFT JOIN clients c ON c.id = f.client_id
     ${joinCt}
     ${where}
     ORDER BY f.date_creation DESC, f.id DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );

  return {
    factures: dataRes.rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getAllFactureIds({ statut, client_id, date_debut, date_fin, type_origine, type_contrat, search }) {
  const conditions = [];
  const params = [];
  let idx = 1;
  let joinContrats = false;

  if (statut) { conditions.push(`f.statut = $${idx++}`); params.push(statut); }
  if (client_id) { conditions.push(`f.client_id = $${idx++}`); params.push(client_id); }
  if (date_debut) { conditions.push(`f.date_creation >= $${idx++}`); params.push(date_debut); }
  if (date_fin) { conditions.push(`f.date_creation <= $${idx++}`); params.push(date_fin); }
  if (type_origine) { conditions.push(`f.type_origine = $${idx++}`); params.push(type_origine); }
  if (type_contrat) {
    joinContrats = true;
    conditions.push(`ct.type_contrat = $${idx++}`);
    params.push(type_contrat);
  }
  if (search) {
    conditions.push(`(f.numero_facture ILIKE $${idx} OR f.client_raison_sociale ILIKE $${idx} OR f.code_client ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const joinCt = joinContrats ? 'JOIN contrats ct ON ct.id = f.contrat_id' : '';
  const { rows } = await query(`SELECT f.id FROM factures f ${joinCt} ${where} ORDER BY f.date_creation DESC, f.id DESC`, params);
  return rows.map(r => r.id);
}

// ---------------------------------------------------------------------------
// Détail facture
// ---------------------------------------------------------------------------

export async function getFactureById(id) {
  const { rows: [facture] } = await query(
    `SELECT f.*, c.raison_sociale AS client_nom, c.telephone_principal AS client_telephone
     FROM factures f
     LEFT JOIN clients c ON c.id = f.client_id
     WHERE f.id = $1`,
    [id]
  );
  if (!facture) throw new ApiError(404, 'Facture introuvable');

  const [lignesRes, reglementsRes, historiqueRes, clientLiveRes] = await Promise.all([
    query(
      `SELECT fl.*,
         CASE WHEN rc.id IS NOT NULL THEN json_build_object(
           'id', rc.id,
           'date_releve', rc.date_releve,
           'machine_numero_serie', pm.numero_serie,
           'compteur_nb', rc.compteur_nb,
           'compteur_couleur', rc.compteur_couleur,
           'import_id', rc.import_id,
           'numero_batch', ir.numero_batch,
           'date_import', ir.date_import,
           'user_nom', ir.user_nom
         ) ELSE NULL END AS releve_info
       FROM facture_lignes fl
       LEFT JOIN releves_compteurs rc ON rc.id = fl.releve_compteur_id
       LEFT JOIN parc_machines pm ON pm.id = rc.machine_id
       LEFT JOIN imports_releves ir ON ir.id = rc.import_id
       WHERE fl.facture_id = $1
       ORDER BY fl.position`, [id]
    ),
    query(
      `SELECT * FROM facture_reglements WHERE facture_id = $1 ORDER BY date_reglement DESC`, [id]
    ),
    query(
      `SELECT * FROM facture_historique WHERE facture_id = $1 ORDER BY created_at DESC`, [id]
    ),
    facture.client_id ? query(
      `SELECT c.numero_client, c.raison_sociale, c.email_principal, c.telephone_principal,
              c.tva_intracommunautaire,
              ca.ligne1, ca.ligne2, ca.code_postal, ca.ville
       FROM clients c
       LEFT JOIN client_adresses ca ON ca.client_id = c.id AND ca.est_defaut = true AND ca.type = 'FACTURATION'
       WHERE c.id = $1`, [facture.client_id]
    ) : { rows: [] },
  ]);

  const clientLive = clientLiveRes.rows[0] || null;

  return {
    ...facture,
    lignes: lignesRes.rows,
    reglements: reglementsRes.rows,
    historique: historiqueRes.rows,
    client_live: clientLive ? {
      numero_client: clientLive.numero_client,
      raison_sociale: clientLive.raison_sociale,
      email: clientLive.email_principal,
      telephone: clientLive.telephone_principal,
      tva_numero: clientLive.tva_intracommunautaire,
      adresse: [clientLive.ligne1, clientLive.ligne2].filter(Boolean).join(', '),
      code_postal: clientLive.code_postal || '',
      ville: clientLive.ville || '',
    } : null,
  };
}

// ---------------------------------------------------------------------------
// Statistiques
// ---------------------------------------------------------------------------

export async function getFacturesStats() {
  const [caTotal, enAttente, envoyees] = await Promise.all([
    query(
      `SELECT COALESCE(SUM(total_ttc), 0) AS montant, COUNT(*)::int AS count FROM factures
       WHERE statut != 'Annulée' AND est_avoir = false`
    ),
    query(
      `SELECT COALESCE(SUM(net_a_payer), 0) AS montant, COUNT(*)::int AS count FROM factures
       WHERE statut IN ('Validée', 'Envoyée') AND net_a_payer > 0 AND est_avoir = false`
    ),
    query(
      `SELECT COALESCE(SUM(total_ttc), 0) AS montant, COUNT(*)::int AS count FROM factures
       WHERE statut = 'Envoyée' AND est_avoir = false`
    ),
  ]);

  return {
    ca_mois: { count: parseInt(caTotal.rows[0].count), montant: parseFloat(caTotal.rows[0].montant) },
    en_attente: { count: parseInt(enAttente.rows[0].count), montant: parseFloat(enAttente.rows[0].montant) },
    envoyees_mois: { count: parseInt(envoyees.rows[0].count), montant: parseFloat(envoyees.rows[0].montant) },
  };
}

// ---------------------------------------------------------------------------
// Créer facture manuelle
// ---------------------------------------------------------------------------

export async function createFacture(data, userId) {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const snapshot = await getClientSnapshot(dbClient, data.client_id);
    const numero = await generateNumeroFacture(dbClient);

    const dateCreation = data.date_creation || new Date().toISOString().slice(0, 10);
    const dateEcheance = data.date_echeance || dateCreation;

    const { rows: [facture] } = await dbClient.query(
      `INSERT INTO factures (
        numero_facture, type_origine, contrat_id, devis_id, client_id,
        code_client, client_raison_sociale, client_adresse, client_cp, client_ville,
        client_email, client_tva_numero,
        site_concerne_nom, site_concerne_adresse, site_concerne_cp, site_concerne_ville, site_concerne_email,
        numero_contrat, numero_serie, modele_machine,
        date_creation, date_echeance, periode_debut, periode_fin,
        mode_reglement, frais_techniques, eco_contribution, taux_tva, notes, statut
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
      ) RETURNING *`,
      [
        numero,
        data.type_origine || 'Manuelle',
        data.contrat_id || null,
        data.devis_id || null,
        data.client_id,
        snapshot.code_client,
        snapshot.client_raison_sociale,
        data.client_adresse || snapshot.client_adresse,
        data.client_cp || snapshot.client_cp,
        data.client_ville || snapshot.client_ville,
        data.client_email || snapshot.client_email,
        snapshot.client_tva_numero,
        data.site_concerne_nom || snapshot.client_raison_sociale,
        data.site_concerne_adresse || snapshot.client_adresse,
        data.site_concerne_cp || snapshot.client_cp,
        data.site_concerne_ville || snapshot.client_ville,
        data.site_concerne_email || snapshot.client_email,
        data.numero_contrat || null,
        data.numero_serie || null,
        data.modele_machine || null,
        dateCreation,
        dateEcheance,
        data.periode_debut || null,
        data.periode_fin || null,
        data.mode_reglement || snapshot.mode_reglement,
        data.frais_techniques || 0,
        data.eco_contribution || 0,
        data.taux_tva || 20,
        data.notes || null,
        'Brouillon',
      ]
    );

    if (data.lignes && data.lignes.length > 0) {
      for (let i = 0; i < data.lignes.length; i++) {
        const l = data.lignes[i];
        const totalHt = calculerTotalLigne({ ...l, type_ligne: l.type_ligne || 'PRODUIT' });
        await dbClient.query(
          `INSERT INTO facture_lignes (
            facture_id, position, type_ligne, reference, designation, description,
            ligne_periode_debut, ligne_periode_fin,
            ancien_compteur, nouveau_compteur, compteur_periode_debut, compteur_periode_fin,
            quantite, prix_unitaire, remise_pourcentage, remise_montant, taux_tva, total_ht
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            facture.id, i, l.type_ligne || 'PRODUIT', l.reference || null,
            l.designation || '', l.description || null,
            l.ligne_periode_debut || null, l.ligne_periode_fin || null,
            l.ancien_compteur || null, l.nouveau_compteur || null,
            l.compteur_periode_debut || null, l.compteur_periode_fin || null,
            l.quantite || 1, l.prix_unitaire || 0,
            l.remise_pourcentage || 0, l.remise_montant || 0,
            l.taux_tva || 20, totalHt,
          ]
        );
      }
    }

    await recalculerFacture(dbClient, facture.id);
    await ajouterHistorique(dbClient, facture.id, 'Création', `Facture ${numero} créée`, userId);

    await dbClient.query('COMMIT');
    return getFactureById(facture.id);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Modifier facture (brouillon uniquement)
// ---------------------------------------------------------------------------

export async function updateFacture(id, data, userId) {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const { rows: [existing] } = await dbClient.query('SELECT * FROM factures WHERE id = $1', [id]);
    if (!existing) throw new ApiError(404, 'Facture introuvable');
    if (!['Brouillon', 'Annulée'].includes(existing.statut)) throw new ApiError(400, 'Seules les factures en brouillon ou annulées peuvent être modifiées');

    const wasAnnulee = existing.statut === 'Annulée';

    await dbClient.query(
      `UPDATE factures SET
        client_id = COALESCE($1, client_id),
        date_echeance = COALESCE($2, date_echeance),
        periode_debut = COALESCE($3, periode_debut),
        periode_fin = COALESCE($4, periode_fin),
        mode_reglement = COALESCE($5, mode_reglement),
        frais_techniques = COALESCE($6, frais_techniques),
        eco_contribution = COALESCE($7, eco_contribution),
        taux_tva = COALESCE($8, taux_tva),
        notes = $9,
        site_concerne_nom = COALESCE($10, site_concerne_nom),
        site_concerne_adresse = COALESCE($11, site_concerne_adresse),
        site_concerne_cp = COALESCE($12, site_concerne_cp),
        site_concerne_ville = COALESCE($13, site_concerne_ville),
        site_concerne_email = COALESCE($14, site_concerne_email),
        statut = CASE WHEN statut = 'Annulée' THEN 'Brouillon' ELSE statut END,
        updated_at = NOW()
      WHERE id = $15`,
      [
        data.client_id, data.date_echeance, data.periode_debut, data.periode_fin,
        data.mode_reglement, data.frais_techniques, data.eco_contribution, data.taux_tva,
        data.notes !== undefined ? data.notes : existing.notes,
        data.site_concerne_nom, data.site_concerne_adresse, data.site_concerne_cp,
        data.site_concerne_ville, data.site_concerne_email, id,
      ]
    );

    if (data.lignes) {
      await dbClient.query('DELETE FROM facture_lignes WHERE facture_id = $1', [id]);
      for (let i = 0; i < data.lignes.length; i++) {
        const l = data.lignes[i];
        const totalHt = calculerTotalLigne({ ...l, type_ligne: l.type_ligne || 'PRODUIT' });
        await dbClient.query(
          `INSERT INTO facture_lignes (
            facture_id, position, type_ligne, reference, designation, description,
            ligne_periode_debut, ligne_periode_fin,
            ancien_compteur, nouveau_compteur, compteur_periode_debut, compteur_periode_fin,
            quantite, prix_unitaire, remise_pourcentage, remise_montant, taux_tva, total_ht
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            id, i, l.type_ligne || 'PRODUIT', l.reference || null,
            l.designation || '', l.description || null,
            l.ligne_periode_debut || null, l.ligne_periode_fin || null,
            l.ancien_compteur || null, l.nouveau_compteur || null,
            l.compteur_periode_debut || null, l.compteur_periode_fin || null,
            l.quantite || 1, l.prix_unitaire || 0,
            l.remise_pourcentage || 0, l.remise_montant || 0,
            l.taux_tva || 20, totalHt,
          ]
        );
      }
    }

    if (data.client_id && data.client_id !== existing.client_id) {
      const snapshot = await getClientSnapshot(dbClient, data.client_id);
      await dbClient.query(
        `UPDATE factures SET
          code_client = $1, client_raison_sociale = $2, client_adresse = $3,
          client_cp = $4, client_ville = $5, client_email = $6, client_tva_numero = $7
        WHERE id = $8`,
        [snapshot.code_client, snapshot.client_raison_sociale, snapshot.client_adresse,
         snapshot.client_cp, snapshot.client_ville, snapshot.client_email, snapshot.client_tva_numero, id]
      );
    }

    await recalculerFacture(dbClient, id);
    const histDesc = wasAnnulee ? 'Facture réouverte et modifiée (ex-annulée → brouillon)' : 'Facture modifiée';
    await ajouterHistorique(dbClient, id, 'Modification', histDesc, userId);

    await dbClient.query('COMMIT');
    return getFactureById(id);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Supprimer
// ---------------------------------------------------------------------------

export async function deleteFacture(id, userId) {
  const { rows: [f] } = await query('SELECT * FROM factures WHERE id = $1', [id]);
  if (!f) throw new ApiError(404, 'Facture introuvable');
  if (!['Brouillon', 'Annulée'].includes(f.statut)) throw new ApiError(400, 'Seules les factures en brouillon ou annulées peuvent être supprimées');

  if (f.contrat_id && f.type_origine === 'Contrat') {
    await rollbackContratFacturation(f.contrat_id, f.id);
  }

  await query('DELETE FROM factures WHERE id = $1', [id]);
}

export async function supprimerLot(ids, userId) {
  const supprimees = [];
  const erreurs = [];

  for (const id of ids) {
    try {
      const { rows: [f] } = await query('SELECT id, numero_facture, statut, contrat_id, type_origine FROM factures WHERE id = $1', [id]);
      if (!f) {
        erreurs.push({ id, message: 'Facture introuvable' });
        continue;
      }
      if (!['Brouillon', 'Annulée'].includes(f.statut)) {
        erreurs.push({ id, numero: f.numero_facture, message: `Statut "${f.statut}" non supprimable` });
        continue;
      }

      if (f.contrat_id && f.type_origine === 'Contrat') {
        await rollbackContratFacturation(f.contrat_id, f.id);
      }

      await query('DELETE FROM factures WHERE id = $1', [id]);
      supprimees.push({ id, numero_facture: f.numero_facture });
    } catch (err) {
      erreurs.push({ id, message: err.message });
    }
  }

  return { supprimees: supprimees.length, erreurs, details: supprimees };
}

// ---------------------------------------------------------------------------
// Recalculer les totaux
// ---------------------------------------------------------------------------

async function recalculerFacture(dbClient, factureId) {
  const { rows: lignes } = await dbClient.query(
    'SELECT * FROM facture_lignes WHERE facture_id = $1', [factureId]
  );
  const { rows: [f] } = await dbClient.query(
    'SELECT frais_techniques, eco_contribution, taux_tva FROM factures WHERE id = $1', [factureId]
  );

  const totaux = calculerTotauxFacture(lignes, f.frais_techniques, f.eco_contribution, f.taux_tva);

  await dbClient.query(
    `UPDATE factures SET
      total_ht = $1, montant_tva = $2, total_ttc = $3,
      frais_techniques = $4, eco_contribution = $5,
      net_a_payer = $3, total_regle = 0, updated_at = NOW()
    WHERE id = $6`,
    [totaux.total_ht, totaux.montant_tva, totaux.total_ttc,
     totaux.frais_techniques, totaux.eco_contribution, factureId]
  );
}

// ---------------------------------------------------------------------------
// Workflow : Valider
// ---------------------------------------------------------------------------

export async function validerFacture(id, userId) {
  const { rows: [f] } = await query('SELECT * FROM factures WHERE id = $1', [id]);
  if (!f) throw new ApiError(404, 'Facture introuvable');
  if (f.statut !== 'Brouillon') throw new ApiError(400, 'Seul un brouillon peut être validé');

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');
    await dbClient.query(`UPDATE factures SET statut = 'Validée', updated_at = NOW() WHERE id = $1`, [id]);
    await ajouterHistorique(dbClient, id, 'Validation', 'Facture validée', userId);
    await dbClient.query('COMMIT');
  } catch (err) { await dbClient.query('ROLLBACK'); throw err; }
  finally { dbClient.release(); }

  return getFactureById(id);
}

// ---------------------------------------------------------------------------
// Workflow : Envoyer
// ---------------------------------------------------------------------------

export async function envoyerFacture(id, userId) {
  const { rows: [f] } = await query('SELECT * FROM factures WHERE id = $1', [id]);
  if (!f) throw new ApiError(404, 'Facture introuvable');
  if (!['Validée', 'Envoyée'].includes(f.statut)) throw new ApiError(400, 'La facture doit être validée avant envoi');

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');
    await dbClient.query(`UPDATE factures SET statut = 'Envoyée', updated_at = NOW() WHERE id = $1`, [id]);
    await ajouterHistorique(dbClient, id, 'Envoi', 'Facture envoyée', userId);
    await dbClient.query('COMMIT');
  } catch (err) { await dbClient.query('ROLLBACK'); throw err; }
  finally { dbClient.release(); }

  return getFactureById(id);
}

// ---------------------------------------------------------------------------
// Workflow : Annuler
// ---------------------------------------------------------------------------

export async function annulerFacture(id, userId) {
  const { rows: [f] } = await query('SELECT * FROM factures WHERE id = $1', [id]);
  if (!f) throw new ApiError(404, 'Facture introuvable');
  if (f.statut === 'Annulée') throw new ApiError(400, 'Facture déjà annulée');

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');
    await dbClient.query(`UPDATE factures SET statut = 'Annulée', updated_at = NOW() WHERE id = $1`, [id]);
    await ajouterHistorique(dbClient, id, 'Annulation', 'Facture annulée', userId);

    if (f.contrat_id && f.type_origine === 'Contrat') {
      await rollbackContratFacturationTx(dbClient, f.contrat_id, f.id);
    }

    await dbClient.query('COMMIT');
  } catch (err) { await dbClient.query('ROLLBACK'); throw err; }
  finally { dbClient.release(); }

  return getFactureById(id);
}

// ---------------------------------------------------------------------------
// Dupliquer
// ---------------------------------------------------------------------------

export async function dupliquerFacture(id, userId) {
  const original = await getFactureById(id);

  const data = {
    type_origine: 'Manuelle',
    client_id: original.client_id,
    date_echeance: new Date().toISOString().slice(0, 10),
    periode_debut: original.periode_debut,
    periode_fin: original.periode_fin,
    mode_reglement: original.mode_reglement,
    frais_techniques: original.frais_techniques,
    eco_contribution: original.eco_contribution,
    taux_tva: original.taux_tva,
    notes: original.notes,
    site_concerne_nom: original.site_concerne_nom,
    site_concerne_adresse: original.site_concerne_adresse,
    site_concerne_cp: original.site_concerne_cp,
    site_concerne_ville: original.site_concerne_ville,
    site_concerne_email: original.site_concerne_email,
    numero_contrat: original.numero_contrat,
    numero_serie: original.numero_serie,
    modele_machine: original.modele_machine,
    lignes: original.lignes.map(l => ({
      type_ligne: l.type_ligne,
      reference: l.reference,
      designation: l.designation,
      description: l.description,
      ligne_periode_debut: l.ligne_periode_debut,
      ligne_periode_fin: l.ligne_periode_fin,
      ancien_compteur: l.ancien_compteur,
      nouveau_compteur: l.nouveau_compteur,
      quantite: l.quantite,
      prix_unitaire: l.prix_unitaire,
      remise_pourcentage: l.remise_pourcentage,
      remise_montant: l.remise_montant,
      taux_tva: l.taux_tva,
    })),
  };

  return createFacture(data, userId);
}


// ---------------------------------------------------------------------------
// Génération depuis contrat COPIEUR
// ---------------------------------------------------------------------------

export async function genererDepuisContrat(contratId, userId, options = {}) {
  const { periode_debut, periode_fin, releve_compteur_nb_id, releve_compteur_coul_id } = options;

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const { rows: [contrat] } = await dbClient.query(
      `SELECT c.*, cl.raison_sociale AS client_raison_sociale, cl.numero_client AS client_code,
              cl.email_principal AS client_email, cl.tva_intracommunautaire AS client_tva,
              cl.mode_paiement_prefere AS client_mode_paiement
       FROM contrats c
       JOIN clients cl ON cl.id = c.client_id
       WHERE c.id = $1`,
      [contratId]
    );
    if (!contrat) throw new ApiError(404, 'Contrat introuvable');
    if (contrat.statut !== 'Actif') throw new ApiError(400, 'Le contrat doit être actif pour facturer');

    const snapshot = await getClientSnapshot(dbClient, contrat.client_id);
    const numero = await generateNumeroFacture(dbClient);

    const mois = getFrequencyMonths(contrat.periodicite);
    const prochaineFacturation = toDateStr(contrat.prochaine_date_facturation) || toDateStr(contrat.date_prochaine_facture) || new Date().toISOString().slice(0, 10);
    const terme = contrat.terme_facturation || 'TEC';

    let periodeDebut, periodeFin;
    if (periode_debut && periode_fin) {
      periodeDebut = periode_debut;
      periodeFin = periode_fin;
    } else if (terme === 'TEC') {
      periodeDebut = addMonthsUTC(prochaineFacturation, -mois);
      periodeFin = subDayUTC(prochaineFacturation);
    } else {
      periodeDebut = prochaineFacturation;
      periodeFin = periodEnd(prochaineFacturation, mois);
    }
    const dateEcheance = periodeFin;

    const lignes = [];
    let position = 0;

    if (contrat.type_contrat === 'Copieur') {
      const { rows: machines } = await dbClient.query(
        'SELECT * FROM contrat_machines WHERE contrat_id = $1 AND actif = true', [contratId]
      );

      let machineInfo = {};
      const releveIdsToMark = [];
      let isFirstMachine = true;

      for (const m of machines) {
        if (!machineInfo.numero_serie) {
          machineInfo = { numero_serie: m.numero_serie, modele_machine: `${m.marque || ''} ${m.modele || ''}`.trim() };
        }

        const aForfait = (Number(m.volume_forfait_nb) > 0) || (Number(m.volume_forfait_couleur) > 0);

        // Récupérer le relevé non facturé le plus récent (sans filtre de date ni exclusion PREMIER_RELEVE)
        let releve = null;
        if (isFirstMachine && releve_compteur_nb_id) {
          const { rows: [rNb] } = await dbClient.query('SELECT * FROM releves_compteurs WHERE id = $1', [releve_compteur_nb_id]);
          if (rNb) releve = rNb;
        }
        if (!releve && isFirstMachine && releve_compteur_coul_id) {
          const { rows: [rC] } = await dbClient.query('SELECT * FROM releves_compteurs WHERE id = $1', [releve_compteur_coul_id]);
          if (rC) releve = rC;
        }
        if (!releve) {
          const { rows: releveRows } = await dbClient.query(
            `SELECT rc.* FROM releves_compteurs rc
             JOIN parc_machines pm ON pm.id = rc.machine_id
             WHERE pm.numero_serie = $1
               AND rc.est_facture = false
             ORDER BY rc.date_releve DESC
             LIMIT 1`,
            [m.numero_serie]
          );
          if (releveRows.length > 0) releve = releveRows[0];
        }
        isFirstMachine = false;

        if (aForfait) {
          // ── TYPE A — Contrat AVEC FORFAIT ──
          // Les lignes de forfait sont TOUJOURS générées, indépendamment du relevé.

          if (Number(m.volume_forfait_nb) > 0) {
            const totalNb = Math.round(Number(m.volume_forfait_nb) * Number(m.cout_copie_nb) * 100) / 100;
            lignes.push({
              position: position++, type_ligne: 'FORFAIT_NB', reference: 'FORF1',
              designation: 'FORFAIT NOIR ET BLANC',
              description: `Période du ${formatDateFR(periodeDebut)} au ${formatDateFR(periodeFin)}`,
              ligne_periode_debut: periodeDebut, ligne_periode_fin: periodeFin,
              quantite: Number(m.volume_forfait_nb), prix_unitaire: Number(m.cout_copie_nb), total_ht: totalNb,
            });
          }

          if (Number(m.volume_forfait_couleur) > 0) {
            const totalCoul = Math.round(Number(m.volume_forfait_couleur) * Number(m.cout_copie_couleur) * 100) / 100;
            lignes.push({
              position: position++, type_ligne: 'FORFAIT_COULEUR', reference: 'FORF2',
              designation: 'FORFAIT COULEUR',
              description: `Période du ${formatDateFR(periodeDebut)} au ${formatDateFR(periodeFin)}`,
              ligne_periode_debut: periodeDebut, ligne_periode_fin: periodeFin,
              quantite: Number(m.volume_forfait_couleur), prix_unitaire: Number(m.cout_copie_couleur), total_ht: totalCoul,
            });
          }

          // Régularisation : valeurs PRÉ-CALCULÉES à l'import, lues directement depuis releves_compteurs
          if (releve && releve.statut !== 'PREMIER_RELEVE') {
            if (Number(releve.depassement_nb) > 0) {
              lignes.push({
                position: position++, type_ligne: 'REGULARISATION_NB', reference: 'REGUL_NB',
                designation: 'REGULARISATION VOLUME NOIR ET BLANC',
                description: `Dépassement de ${Number(releve.depassement_nb)} copies sur la période`,
                ancien_compteur: Number(releve.ancien_compteur_nb || 0),
                nouveau_compteur: Number(releve.compteur_nb),
                compteur_periode_debut: releve.date_debut_periode,
                compteur_periode_fin: releve.date_fin_periode,
                quantite: Number(releve.depassement_nb), prix_unitaire: Number(m.cout_copie_nb),
                total_ht: Number(releve.montant_depassement_nb),
                releve_compteur_id: releve.id,
              });
            }

            if (Number(releve.depassement_couleur) > 0) {
              lignes.push({
                position: position++, type_ligne: 'REGULARISATION_COULEUR', reference: 'REGUL_COUL',
                designation: 'REGULARISATION VOLUME COULEUR',
                description: `Dépassement de ${Number(releve.depassement_couleur)} copies sur la période`,
                ancien_compteur: Number(releve.ancien_compteur_couleur || 0),
                nouveau_compteur: Number(releve.compteur_couleur),
                compteur_periode_debut: releve.date_debut_periode,
                compteur_periode_fin: releve.date_fin_periode,
                quantite: Number(releve.depassement_couleur), prix_unitaire: Number(m.cout_copie_couleur),
                total_ht: Number(releve.montant_depassement_couleur),
                releve_compteur_id: releve.id,
              });
            }

            releveIdsToMark.push(releve.id);
          } else if (releve && releve.statut === 'PREMIER_RELEVE') {
            releveIdsToMark.push(releve.id);
          }

        } else {
          // ── TYPE B — Contrat AU COMPTEUR (sans forfait) ──
          if (!releve) continue;

          if (['OK', 'DEPASSEMENT', 'AU_COMPTEUR'].includes(releve.statut)) {
            const volumeNb = Number(releve.volume_nb || 0);
            const coutNb = Number(m.cout_copie_nb || 0);
            if (volumeNb > 0 && coutNb > 0) {
              const totalNb = Math.round(volumeNb * coutNb * 100) / 100;
              lignes.push({
                position: position++, type_ligne: 'REGULARISATION_NB', reference: 'COPIES_NB',
                designation: 'COPIES NOIR ET BLANC',
                description: `Consommation période ${formatDateFR(releve.date_debut_periode)} → ${formatDateFR(releve.date_fin_periode)}`,
                ancien_compteur: Number(releve.ancien_compteur_nb || 0),
                nouveau_compteur: Number(releve.compteur_nb),
                compteur_periode_debut: releve.date_debut_periode,
                compteur_periode_fin: releve.date_fin_periode,
                quantite: volumeNb, prix_unitaire: coutNb, total_ht: totalNb,
                releve_compteur_id: releve.id,
              });
            }

            const volumeCoul = Number(releve.volume_couleur || 0);
            const coutCoul = Number(m.cout_copie_couleur || 0);
            if (volumeCoul > 0 && coutCoul > 0) {
              const totalCoul = Math.round(volumeCoul * coutCoul * 100) / 100;
              lignes.push({
                position: position++, type_ligne: 'REGULARISATION_COULEUR', reference: 'COPIES_COUL',
                designation: 'COPIES COULEUR',
                description: `Consommation période ${formatDateFR(releve.date_debut_periode)} → ${formatDateFR(releve.date_fin_periode)}`,
                ancien_compteur: Number(releve.ancien_compteur_couleur || 0),
                nouveau_compteur: Number(releve.compteur_couleur),
                compteur_periode_debut: releve.date_debut_periode,
                compteur_periode_fin: releve.date_fin_periode,
                quantite: volumeCoul, prix_unitaire: coutCoul, total_ht: totalCoul,
                releve_compteur_id: releve.id,
              });
            }

            releveIdsToMark.push(releve.id);
          } else if (releve.statut === 'PREMIER_RELEVE') {
            const cNb = Number(releve.compteur_nb || 0);
            const cCoul = Number(releve.compteur_couleur || 0);
            const coutNb = Number(m.cout_copie_nb || 0);
            const coutCoul = Number(m.cout_copie_couleur || 0);

            if (cNb > 0 && coutNb > 0) {
              lignes.push({
                position: position++, type_ligne: 'REGULARISATION_NB', reference: 'COPIES_NB',
                designation: 'COPIES NOIR ET BLANC (premier relevé)',
                description: `Compteur initial : ${cNb}`,
                nouveau_compteur: cNb,
                quantite: cNb, prix_unitaire: coutNb,
                total_ht: Math.round(cNb * coutNb * 100) / 100,
                releve_compteur_id: releve.id,
              });
            }
            if (cCoul > 0 && coutCoul > 0) {
              lignes.push({
                position: position++, type_ligne: 'REGULARISATION_COULEUR', reference: 'COPIES_COUL',
                designation: 'COPIES COULEUR (premier relevé)',
                description: `Compteur initial : ${cCoul}`,
                nouveau_compteur: cCoul,
                quantite: cCoul, prix_unitaire: coutCoul,
                total_ht: Math.round(cCoul * coutCoul * 100) / 100,
                releve_compteur_id: releve.id,
              });
            }

            releveIdsToMark.push(releve.id);
          }
        }

        const serviceRefs = { service_connectic: 'CNTC', service_collecteur: 'COLL', service_divers: 'DIV', service_autre: 'AUT' };
        const serviceLabels = { service_connectic: 'Service Connectic', service_collecteur: 'Service Collecteur', service_divers: 'Service Divers', service_autre: 'Service Autre' };
        for (const [key, ref] of Object.entries(serviceRefs)) {
          if (parseFloat(m[key]) > 0) {
            lignes.push({
              position: position++, type_ligne: 'SERVICE', reference: ref,
              designation: serviceLabels[key],
              description: `Période du ${formatDateFR(periodeDebut)} au ${formatDateFR(periodeFin)}`,
              ligne_periode_debut: periodeDebut, ligne_periode_fin: periodeFin,
              quantite: 1, prix_unitaire: parseFloat(m[key]),
              total_ht: parseFloat(m[key]),
            });
          }
        }
      }

      if (lignes.length === 0) {
        throw new ApiError(
          400,
          `Aucune ligne à facturer pour le contrat ${contrat.numero_contrat} sur la période ` +
          `${periodeDebut} → ${periodeFin}. Vérifiez que les relevés compteurs ont bien été importés ` +
          `et qu'un coût copie ou un forfait est défini sur les machines du contrat.`
        );
      }

      const { rows: [facture] } = await insertFactureFromContrat(dbClient, {
        numero, contrat, snapshot, periodeDebut, periodeFin, dateEcheance, lignes,
        ...machineInfo,
      });

      const uniqueReleveIds = [...new Set(releveIdsToMark)];
      for (const rid of uniqueReleveIds) {
        await dbClient.query(
          `UPDATE releves_compteurs SET est_facture = true, facture_id = $1, facture_numero = $2 WHERE id = $3`,
          [facture.id, facture.numero_facture, rid]
        );
      }

      await updateContratApresFacturation(dbClient, contrat, facture, mois, periodeFin);
      await ajouterHistorique(dbClient, facture.id, 'Création',
        `Facture générée depuis contrat ${contrat.numero_contrat}`, userId);

      await dbClient.query('COMMIT');
      return getFactureById(facture.id);

    } else {
      // Téléphonie / Informatique / Sécurité
      const { rows: contratLignes } = await dbClient.query(
        'SELECT * FROM contrat_lignes WHERE contrat_id = $1 AND actif = true ORDER BY ordre', [contratId]
      );

      const refMap = {
        'Forfait Fixe': 'REF1', 'Forfait Mobile': 'REF2', 'Lien Internet': 'REF3',
        'Location Matériel': 'REF4', 'Services': 'REF5', 'Autre': 'REF6',
        'Forfait Copie N&B': 'FORF1', 'Forfait Copie Couleur': 'FORF2',
        'Service Connectic': 'CNTC', 'PLC': 'PLC', 'Hors Forfait': 'HF',
      };
      const typeMap = {
        'Forfait Fixe': 'ABONNEMENT', 'Forfait Mobile': 'ABONNEMENT', 'Lien Internet': 'ABONNEMENT',
        'Location Matériel': 'LOCATION', 'Services': 'SERVICE', 'Autre': 'PRODUIT',
        'Forfait Copie N&B': 'FORFAIT_NB', 'Forfait Copie Couleur': 'FORFAIT_COULEUR',
        'Service Connectic': 'SERVICE', 'PLC': 'SERVICE', 'Hors Forfait': 'PRODUIT',
      };

      for (const cl of contratLignes) {
        const qte = parseFloat(cl.quantite) || 1;
        const pu = parseFloat(cl.prix_unitaire_ht) || 0;
        const remPct = parseFloat(cl.remise_pourcentage) || 0;
        const totalHt = Math.round(qte * pu * (1 - remPct / 100) * 100) / 100;

        lignes.push({
          position: position++,
          type_ligne: typeMap[cl.categorie_ligne] || 'PRODUIT',
          reference: cl.reference || refMap[cl.categorie_ligne] || '',
          designation: cl.designation,
          description: `Période du ${formatDateFR(periodeDebut)} au ${formatDateFR(periodeFin)}${cl.complement_info ? '\n' + cl.complement_info : ''}`,
          ligne_periode_debut: periodeDebut, ligne_periode_fin: periodeFin,
          quantite: qte, prix_unitaire: pu,
          remise_pourcentage: remPct, total_ht: totalHt,
        });
      }

      if (lignes.length === 0) {
        throw new ApiError(
          400,
          `Aucune ligne à facturer pour le contrat ${contrat.numero_contrat} : ` +
          `aucune ligne active n'est définie sur ce contrat.`
        );
      }

      const { rows: [facture] } = await insertFactureFromContrat(dbClient, {
        numero, contrat, snapshot, periodeDebut, periodeFin, dateEcheance, lignes,
      });

      await updateContratApresFacturation(dbClient, contrat, facture, mois, periodeFin);
      await ajouterHistorique(dbClient, facture.id, 'Création',
        `Facture générée depuis contrat ${contrat.numero_contrat}`, userId);

      await dbClient.query('COMMIT');
      return getFactureById(facture.id);
    }
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Liste des contrats à facturer (tous les contrats actifs)
// ---------------------------------------------------------------------------

export async function getContratsAFacturer(typeFilter) {
  const today = new Date().toISOString().slice(0, 10);
  const conditions = [`(c.statut = 'Actif' OR c.statut = 'actif')`, `c.deleted_at IS NULL`];
  const params = [];
  let idx = 1;

  if (typeFilter) {
    conditions.push(`c.type_contrat = $${idx++}`);
    params.push(typeFilter);
  }

  const where = 'WHERE ' + conditions.join(' AND ');

  const { rows: contrats } = await query(
    `SELECT c.id, c.numero_contrat, c.type_contrat, c.periodicite,
            c.client_id, cl.raison_sociale AS client_raison_sociale,
            COALESCE(c.prochaine_date_facturation, c.date_prochaine_facture) AS prochaine_date_facturation,
            COALESCE(c.derniere_date_facturation, c.derniere_facture_date) AS derniere_date_facturation,
            COALESCE(c.loyer_ht, 0) AS montant_mensuel_ht,
            c.terme_facturation,
            CASE
              WHEN COALESCE(c.prochaine_date_facturation, c.date_prochaine_facture) IS NULL THEN true
              WHEN COALESCE(c.prochaine_date_facturation, c.date_prochaine_facture) < $${idx} THEN true
              ELSE false
            END AS en_retard
     FROM contrats c
     JOIN clients cl ON cl.id = c.client_id
     ${where}
     ORDER BY
       CASE
         WHEN COALESCE(c.prochaine_date_facturation, c.date_prochaine_facture) IS NULL THEN 0
         WHEN COALESCE(c.prochaine_date_facturation, c.date_prochaine_facture) < $${idx} THEN 0
         ELSE 1
       END,
       COALESCE(c.prochaine_date_facturation, c.date_prochaine_facture) ASC NULLS FIRST`,
    [...params, today]
  );

  return contrats;
}

// ---------------------------------------------------------------------------
// Génération en lot (avec période)
// ---------------------------------------------------------------------------

export async function executerGenerationLot(contratIds, periodeDebut, periodeFin, userId) {
  const resultats = { generees: [], erreurs: [] };

  for (const contratId of contratIds) {
    try {
      const facture = await genererDepuisContrat(contratId, userId, { periode_debut: periodeDebut, periode_fin: periodeFin });
      resultats.generees.push({
        contrat_id: contratId,
        facture_id: facture.id,
        numero_facture: facture.numero_facture,
        numero_contrat: facture.numero_contrat,
        client: facture.client_raison_sociale,
        total_ttc: facture.total_ttc,
      });
    } catch (err) {
      const detail = await getErreurDetailContrat(contratId, periodeDebut, periodeFin);
      resultats.erreurs.push({
        contrat_id: contratId,
        message: err.message,
        ...detail,
      });
    }
  }

  return resultats;
}

async function getErreurDetailContrat(contratId, periodeDebut, periodeFin) {
  try {
    const { rows: [contrat] } = await query(
      `SELECT c.id, c.numero_contrat, c.type_contrat, c.periodicite,
              c.date_debut, c.date_echeance, c.date_prochaine_facture,
              c.derniere_facture_date, c.statut,
              cl.raison_sociale AS client_raison_sociale
       FROM contrats c
       JOIN clients cl ON cl.id = c.client_id
       WHERE c.id = $1`,
      [contratId]
    );
    if (!contrat) return {};

    const { rows: machines } = await query(
      `SELECT cm.numero_serie, cm.modele, cm.marque, cm.actif,
              cm.cout_copie_nb, cm.cout_copie_couleur,
              cm.volume_forfait_nb, cm.volume_forfait_couleur
       FROM contrat_machines cm WHERE cm.contrat_id = $1`,
      [contratId]
    );

    const { rows: lignesContrat } = await query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE actif = true)::int AS actives
       FROM contrat_lignes WHERE contrat_id = $1`,
      [contratId]
    );

    let releves_disponibles = [];
    let raison = 'inconnu';

    if (contrat.type_contrat === 'Copieur') {
      const activeMachines = machines.filter(m => m.actif);
      const hasForfait = activeMachines.some(m =>
        Number(m.volume_forfait_nb) > 0 || Number(m.volume_forfait_couleur) > 0
      );
      const hasCoutCopie = activeMachines.some(m =>
        Number(m.cout_copie_nb) > 0 || Number(m.cout_copie_couleur) > 0
      );
      const hasServices = activeMachines.length > 0;

      if (activeMachines.length === 0) {
        raison = 'aucune_machine_active';
      } else if (!hasForfait && !hasCoutCopie) {
        raison = 'pas_de_tarification';
      } else if (!hasForfait) {
        raison = 'releves_manquants';
      } else {
        raison = 'releves_manquants';
      }

      for (const m of activeMachines) {
        const { rows: rels } = await query(
          `SELECT rc.id, rc.date_releve, rc.date_debut_periode, rc.date_fin_periode,
                  rc.compteur_nb, rc.compteur_couleur, rc.statut, rc.est_facture,
                  pm.numero_serie
           FROM releves_compteurs rc
           JOIN parc_machines pm ON pm.id = rc.machine_id
           WHERE pm.numero_serie = $1
           ORDER BY rc.date_releve DESC
           LIMIT 5`,
          [m.numero_serie]
        );
        if (rels.length > 0) {
          releves_disponibles.push({
            numero_serie: m.numero_serie,
            modele: `${m.marque || ''} ${m.modele || ''}`.trim(),
            releves: rels.map(r => ({
              id: r.id,
              date_releve: r.date_releve,
              periode_debut: r.date_debut_periode,
              periode_fin: r.date_fin_periode,
              compteur_nb: r.compteur_nb,
              compteur_couleur: r.compteur_couleur,
              statut: r.statut,
              est_facture: r.est_facture,
            })),
          });
        }
      }
    } else {
      const actives = lignesContrat[0]?.actives || 0;
      raison = actives === 0 ? 'aucune_ligne_active' : 'inconnu';
    }

    return {
      numero_contrat: contrat.numero_contrat,
      client: contrat.client_raison_sociale,
      type_contrat: contrat.type_contrat,
      periodicite: contrat.periodicite,
      statut: contrat.statut,
      date_debut: contrat.date_debut,
      date_echeance: contrat.date_echeance,
      date_prochaine_facture: contrat.prochaine_date_facturation || contrat.date_prochaine_facture,
      derniere_facture_date: contrat.derniere_facture_date,
      nb_machines: machines.length,
      nb_machines_actives: machines.filter(m => m.actif).length,
      nb_lignes_actives: lignesContrat[0]?.actives || 0,
      raison,
      releves_disponibles,
      periode_demandee: { debut: periodeDebut, fin: periodeFin },
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Validation en lot (Brouillon → Validée)
// ---------------------------------------------------------------------------

export async function validerLot(ids, userId) {
  const resultats = { valides: 0, erreurs: [] };

  for (const id of ids) {
    try {
      await validerFacture(id, userId);
      resultats.valides++;
    } catch (err) {
      resultats.erreurs.push({ id, message: err.message });
    }
  }

  return resultats;
}

// ---------------------------------------------------------------------------
// Envoi email en lot (Validée → Envoyée)
// ---------------------------------------------------------------------------

export async function envoyerLot(ids, userId, { sujet: sujetOverride, corps: corpsOverride } = {}) {
  const { sendFactureEmail, getRenderedTemplate } = await import('../email/email.service.js');
  const { generateFacturePdf } = await import('./pdf.service.js');

  const resultats = { envoyees: 0, erreurs: [] };

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    try {
      const facture = await getFactureById(id);

      if (facture.statut !== 'Validée') {
        resultats.erreurs.push({
          numero: facture.numero_facture,
          client: facture.client_raison_sociale,
          motif: `Statut « ${facture.statut} » — seules les factures validées peuvent être envoyées`,
        });
        continue;
      }

      const email = facture.client_email;
      if (!email) {
        resultats.erreurs.push({
          numero: facture.numero_facture,
          client: facture.client_raison_sociale,
          motif: 'Pas d\'email renseigné pour ce client',
        });
        continue;
      }

      const template = await getRenderedTemplate(facture);
      const { pdf } = await generateFacturePdf(facture.id);

      await sendFactureEmail({
        facture,
        pdfBuffer: pdf,
        destinataire: email,
        sujet: sujetOverride || template.sujet,
        corps: corpsOverride !== undefined ? corpsOverride : template.corps,
      });

      await envoyerFacture(facture.id, userId);
      resultats.envoyees++;

      if (i < ids.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (err) {
      const facture = await getFactureById(id).catch(() => null);
      resultats.erreurs.push({
        numero: facture?.numero_facture || `#${id}`,
        client: facture?.client_raison_sociale || 'Inconnu',
        motif: err.message,
      });
    }
  }

  return resultats;
}

// ---------------------------------------------------------------------------
// Relevés disponibles pour un contrat copieur
// ---------------------------------------------------------------------------

export async function getRelevesDisponibles(contratId) {
  try {
    const tableCheck = await query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'releves_compteurs'
      ) AS table_exists`
    );
    if (!tableCheck.rows[0].table_exists) return [];

    const { rows } = await query(
      `SELECT rc.id, rc.date_releve, rc.compteur_nb, rc.compteur_couleur,
              rc.volume_nb, rc.volume_couleur, rc.date_debut_periode, rc.date_fin_periode,
              pm.numero_serie, pm.modele, pm.marque
       FROM releves_compteurs rc
       JOIN parc_machines pm ON pm.id = rc.machine_id
       JOIN contrat_machines cm ON cm.numero_serie = pm.numero_serie AND cm.actif = true
       WHERE cm.contrat_id = $1 AND rc.est_facture = false
       ORDER BY rc.date_releve DESC`,
      [contratId]
    );
    return rows;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Liste tous les relevés de compteurs
// ---------------------------------------------------------------------------

export async function listRelevesCompteurs() {
  try {
    const tableCheck = await query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables WHERE table_name = 'releves_compteurs'
      ) AS table_exists`
    );
    if (!tableCheck.rows[0].table_exists) return [];

    const { rows } = await query(
      `SELECT rc.id, rc.date_releve, rc.compteur_nb, rc.compteur_couleur,
              rc.volume_nb, rc.volume_couleur, rc.est_facture,
              rc.facture_id, rc.facture_numero,
              pm.numero_serie, pm.modele, pm.marque,
              cm.contrat_id,
              c.numero_contrat,
              cl.raison_sociale AS client_raison_sociale
       FROM releves_compteurs rc
       JOIN parc_machines pm ON pm.id = rc.machine_id
       LEFT JOIN contrat_machines cm ON cm.numero_serie = pm.numero_serie AND cm.actif = true
       LEFT JOIN contrats c ON c.id = cm.contrat_id
       LEFT JOIN clients cl ON cl.id = c.client_id
       ORDER BY rc.date_releve DESC
       LIMIT 100`
    );
    return rows;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Génération depuis devis
// ---------------------------------------------------------------------------

export async function genererDepuisDevis(devisId, userId) {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const { rows: [devis] } = await dbClient.query(
      `SELECT d.*, c.raison_sociale AS client_raison_sociale, c.numero_client AS client_code
       FROM devis d
       JOIN clients c ON c.id = d.client_id
       WHERE d.id = $1`,
      [devisId]
    );
    if (!devis) throw new ApiError(404, 'Devis introuvable');
    if (devis.statut !== 'ACCEPTE') throw new ApiError(400, 'Le devis doit être accepté pour être transformé en facture');

    const { rows: devisLignes } = await dbClient.query(
      'SELECT * FROM devis_lignes WHERE devis_id = $1 ORDER BY ordre', [devisId]
    );

    const snapshot = await getClientSnapshot(dbClient, devis.client_id);
    const numero = await generateNumeroFacture(dbClient);

    const lignes = devisLignes.map((l, i) => ({
      position: i,
      type_ligne: l.type === 'SERVICE' ? 'SERVICE' : (l.type === 'COMMENTAIRE' ? 'COMMENTAIRE' :
        l.type === 'SOUS_TOTAL' ? 'SOUS_TOTAL' : l.type === 'SAUT_DE_LIGNE' ? 'SAUT_DE_LIGNE' : 'PRODUIT'),
      reference: l.reference,
      designation: l.designation,
      description: l.description_detaillee,
      quantite: l.quantite,
      prix_unitaire: l.prix_unitaire_ht,
      remise_pourcentage: l.remise_ligne_type === 'POURCENTAGE' ? l.remise_ligne_valeur : 0,
      remise_montant: l.remise_ligne_type === 'MONTANT_FIXE' ? l.remise_ligne_valeur : 0,
      taux_tva: l.taux_tva,
      total_ht: l.montant_ht,
    }));

    const { rows: [facture] } = await dbClient.query(
      `INSERT INTO factures (
        numero_facture, type_origine, devis_id, client_id,
        code_client, client_raison_sociale, client_adresse, client_cp, client_ville,
        client_email, client_tva_numero,
        site_concerne_nom, site_concerne_adresse, site_concerne_cp, site_concerne_ville,
        date_creation, date_echeance,
        mode_reglement, taux_tva, statut
      ) VALUES (
        $1, 'Devis', $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days',
        $15, 20, 'Brouillon'
      ) RETURNING *`,
      [
        numero, devisId, devis.client_id,
        snapshot.code_client, snapshot.client_raison_sociale, snapshot.client_adresse,
        snapshot.client_cp, snapshot.client_ville, snapshot.client_email, snapshot.client_tva_numero,
        snapshot.client_raison_sociale, snapshot.client_adresse, snapshot.client_cp, snapshot.client_ville,
        snapshot.mode_reglement,
      ]
    );

    for (const l of lignes) {
      await dbClient.query(
        `INSERT INTO facture_lignes (
          facture_id, position, type_ligne, reference, designation, description,
          quantite, prix_unitaire, remise_pourcentage, remise_montant, taux_tva, total_ht
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [facture.id, l.position, l.type_ligne, l.reference, l.designation, l.description,
         l.quantite, l.prix_unitaire, l.remise_pourcentage, l.remise_montant, l.taux_tva, l.total_ht]
      );
    }

    await recalculerFacture(dbClient, facture.id);

    await dbClient.query(`UPDATE devis SET statut = 'FACTURE', facture_id = $1, updated_at = NOW() WHERE id = $2`,
      [facture.id, devisId]);

    await ajouterHistorique(dbClient, facture.id, 'Création',
      `Facture générée depuis devis ${devis.numero_devis}`, userId);

    await dbClient.query('COMMIT');
    return getFactureById(facture.id);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}


// ---------------------------------------------------------------------------
// Gestion des lignes de facture (brouillon uniquement)
// ---------------------------------------------------------------------------

export async function ajouterLigne(factureId, ligne, userId) {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const { rows: [f] } = await dbClient.query('SELECT * FROM factures WHERE id = $1', [factureId]);
    if (!f) throw new ApiError(404, 'Facture introuvable');
    if (!['Brouillon', 'Annulée'].includes(f.statut)) throw new ApiError(400, 'Facture verrouillée');

    if (f.statut === 'Annulée') {
      await dbClient.query(`UPDATE factures SET statut = 'Brouillon', updated_at = NOW() WHERE id = $1`, [factureId]);
    }

    if (!ligne.designation || !ligne.designation.trim()) throw new ApiError(400, 'La désignation est obligatoire');
    if (!ligne.quantite || parseFloat(ligne.quantite) <= 0) throw new ApiError(400, 'La quantité doit être supérieure à 0');
    if (ligne.prix_unitaire === undefined || ligne.prix_unitaire === null) throw new ApiError(400, 'Le prix unitaire est obligatoire');

    const { rows: posRows } = await dbClient.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM facture_lignes WHERE facture_id = $1', [factureId]
    );
    const nextPos = posRows[0].next_pos;

    const totalHt = calculerTotalLigne({
      type_ligne: ligne.type_ligne || 'PRODUIT',
      quantite: ligne.quantite,
      prix_unitaire: ligne.prix_unitaire,
      remise_pourcentage: ligne.remise_pourcentage,
      remise_montant: ligne.remise_montant,
    });

    const { rows: [newLigne] } = await dbClient.query(
      `INSERT INTO facture_lignes (
        facture_id, position, type_ligne, reference, designation, description,
        ligne_periode_debut, ligne_periode_fin,
        quantite, prix_unitaire, remise_pourcentage, remise_montant, taux_tva, total_ht
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        factureId, nextPos, ligne.type_ligne || 'PRODUIT', ligne.reference || null,
        ligne.designation.trim(), ligne.description || null,
        ligne.ligne_periode_debut || null, ligne.ligne_periode_fin || null,
        parseFloat(ligne.quantite), parseFloat(ligne.prix_unitaire),
        parseFloat(ligne.remise_pourcentage) || 0, parseFloat(ligne.remise_montant) || 0,
        parseFloat(ligne.taux_tva) || 20, totalHt,
      ]
    );

    await recalculerFacture(dbClient, factureId);
    await ajouterHistorique(dbClient, factureId, 'AJOUT_LIGNE',
      `Ligne ajoutée : ${ligne.designation.trim()}`, userId);

    await dbClient.query('COMMIT');
    return getFactureById(factureId);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

export async function modifierLigne(factureId, ligneId, ligne, userId) {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const { rows: [f] } = await dbClient.query('SELECT * FROM factures WHERE id = $1', [factureId]);
    if (!f) throw new ApiError(404, 'Facture introuvable');
    if (!['Brouillon', 'Annulée'].includes(f.statut)) throw new ApiError(400, 'Facture verrouillée');

    if (f.statut === 'Annulée') {
      await dbClient.query(`UPDATE factures SET statut = 'Brouillon', updated_at = NOW() WHERE id = $1`, [factureId]);
    }

    const { rows: [existing] } = await dbClient.query(
      'SELECT * FROM facture_lignes WHERE id = $1 AND facture_id = $2', [ligneId, factureId]
    );
    if (!existing) throw new ApiError(404, 'Ligne introuvable');

    if (ligne.designation !== undefined && !ligne.designation.trim()) throw new ApiError(400, 'La désignation est obligatoire');
    if (ligne.quantite !== undefined && parseFloat(ligne.quantite) <= 0) throw new ApiError(400, 'La quantité doit être supérieure à 0');

    const merged = {
      type_ligne: ligne.type_ligne ?? existing.type_ligne,
      quantite: ligne.quantite !== undefined ? parseFloat(ligne.quantite) : parseFloat(existing.quantite),
      prix_unitaire: ligne.prix_unitaire !== undefined ? parseFloat(ligne.prix_unitaire) : parseFloat(existing.prix_unitaire),
      remise_pourcentage: ligne.remise_pourcentage !== undefined ? parseFloat(ligne.remise_pourcentage) : parseFloat(existing.remise_pourcentage),
      remise_montant: ligne.remise_montant !== undefined ? parseFloat(ligne.remise_montant) : parseFloat(existing.remise_montant),
    };
    const totalHt = calculerTotalLigne(merged);

    await dbClient.query(
      `UPDATE facture_lignes SET
        type_ligne = $1, reference = $2, designation = $3, description = $4,
        ligne_periode_debut = $5, ligne_periode_fin = $6,
        quantite = $7, prix_unitaire = $8, remise_pourcentage = $9, remise_montant = $10,
        taux_tva = $11, total_ht = $12
      WHERE id = $13 AND facture_id = $14`,
      [
        merged.type_ligne,
        ligne.reference !== undefined ? (ligne.reference || null) : existing.reference,
        ligne.designation !== undefined ? ligne.designation.trim() : existing.designation,
        ligne.description !== undefined ? (ligne.description || null) : existing.description,
        ligne.ligne_periode_debut !== undefined ? (ligne.ligne_periode_debut || null) : existing.ligne_periode_debut,
        ligne.ligne_periode_fin !== undefined ? (ligne.ligne_periode_fin || null) : existing.ligne_periode_fin,
        merged.quantite, merged.prix_unitaire, merged.remise_pourcentage, merged.remise_montant,
        ligne.taux_tva !== undefined ? parseFloat(ligne.taux_tva) : parseFloat(existing.taux_tva),
        totalHt, ligneId, factureId,
      ]
    );

    await recalculerFacture(dbClient, factureId);
    await ajouterHistorique(dbClient, factureId, 'MODIF_LIGNE',
      `Ligne modifiée : ${ligne.designation !== undefined ? ligne.designation.trim() : existing.designation}`, userId);

    await dbClient.query('COMMIT');
    return getFactureById(factureId);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

export async function supprimerLigne(factureId, ligneId, userId) {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const { rows: [f] } = await dbClient.query('SELECT * FROM factures WHERE id = $1', [factureId]);
    if (!f) throw new ApiError(404, 'Facture introuvable');
    if (!['Brouillon', 'Annulée'].includes(f.statut)) throw new ApiError(400, 'Facture verrouillée');

    if (f.statut === 'Annulée') {
      await dbClient.query(`UPDATE factures SET statut = 'Brouillon', updated_at = NOW() WHERE id = $1`, [factureId]);
    }

    const { rows: [existing] } = await dbClient.query(
      'SELECT * FROM facture_lignes WHERE id = $1 AND facture_id = $2', [ligneId, factureId]
    );
    if (!existing) throw new ApiError(404, 'Ligne introuvable');

    await dbClient.query('DELETE FROM facture_lignes WHERE id = $1 AND facture_id = $2', [ligneId, factureId]);

    await recalculerFacture(dbClient, factureId);
    await ajouterHistorique(dbClient, factureId, 'SUPPR_LIGNE',
      `Ligne supprimée : ${existing.designation}`, userId);

    await dbClient.query('COMMIT');
    return getFactureById(factureId);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

export async function recalculerTotaux(factureId) {
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const { rows: [f] } = await dbClient.query('SELECT * FROM factures WHERE id = $1', [factureId]);
    if (!f) throw new ApiError(404, 'Facture introuvable');

    await recalculerFacture(dbClient, factureId);
    await dbClient.query('COMMIT');
    return getFactureById(factureId);
  } catch (err) {
    await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function formatDateFR(d) {
  if (!d) return '';
  const s = toDateStr(d);
  if (!s) return '';
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
}

function getFrequencyMonths(periodicite) {
  const map = { Mensuel: 1, Bimestriel: 2, Trimestriel: 3, Semestriel: 6, Annuel: 12 };
  return map[periodicite] || 1;
}

// ---------------------------------------------------------------------------
// Rollback prochaine_facturation (suppression/annulation facture contrat)
// ---------------------------------------------------------------------------

async function rollbackContratFacturation(contratId, factureId) {
  const { rows: [contrat] } = await query('SELECT * FROM contrats WHERE id = $1', [contratId]);
  if (!contrat) return;

  const { rows: otherFactures } = await query(
    `SELECT id FROM factures WHERE contrat_id = $1 AND id != $2 AND statut != 'Annulée' ORDER BY date_creation DESC LIMIT 1`,
    [contratId, factureId]
  );

  if (otherFactures.length === 0) return;

  const periodiciteMap = { Mensuel: 1, Bimestriel: 2, Trimestriel: 3, Semestriel: 6, Annuel: 12 };
  const mois = periodiciteMap[contrat.periodicite] || 1;
  const currentNext = toDateStr(contrat.prochaine_date_facturation) || toDateStr(contrat.date_prochaine_facture);
  if (!currentNext) return;

  const prevDateStr = addMonthsUTC(currentNext, -mois);

  await query(
    `UPDATE contrats SET
      date_prochaine_facture = $1,
      prochaine_date_facturation = $1,
      updated_at = NOW()
    WHERE id = $2`,
    [prevDateStr, contratId]
  );
}

async function rollbackContratFacturationTx(dbClient, contratId, factureId) {
  const { rows: [contrat] } = await dbClient.query('SELECT * FROM contrats WHERE id = $1', [contratId]);
  if (!contrat) return;

  const { rows: otherFactures } = await dbClient.query(
    `SELECT id FROM factures WHERE contrat_id = $1 AND id != $2 AND statut NOT IN ('Annulée') ORDER BY date_creation DESC LIMIT 1`,
    [contratId, factureId]
  );

  const periodiciteMap = { Mensuel: 1, Bimestriel: 2, Trimestriel: 3, Semestriel: 6, Annuel: 12 };
  const mois = periodiciteMap[contrat.periodicite] || 1;
  const currentNext = toDateStr(contrat.prochaine_date_facturation) || toDateStr(contrat.date_prochaine_facture);
  if (!currentNext) return;

  const prevDateStr = addMonthsUTC(currentNext, -mois);

  await dbClient.query(
    `UPDATE contrats SET
      date_prochaine_facture = $1,
      prochaine_date_facturation = $1,
      updated_at = NOW()
    WHERE id = $2`,
    [prevDateStr, contratId]
  );
}

async function insertFactureFromContrat(dbClient, { numero, contrat, snapshot, periodeDebut, periodeFin, dateEcheance, lignes, numero_serie, modele_machine }) {
  const { rows: [facture] } = await dbClient.query(
    `INSERT INTO factures (
      numero_facture, type_origine, contrat_id, client_id,
      code_client, client_raison_sociale, client_adresse, client_cp, client_ville,
      client_email, client_tva_numero,
      site_concerne_nom, site_concerne_adresse, site_concerne_cp, site_concerne_ville,
      numero_contrat, numero_serie, modele_machine,
      date_creation, date_echeance, periode_debut, periode_fin,
      mode_reglement, frais_techniques, eco_contribution, taux_tva, statut
    ) VALUES (
      $1, 'Contrat', $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16, $17,
      CURRENT_DATE, $18, $19, $20,
      $21, $22, $23, 20, 'Brouillon'
    ) RETURNING *`,
    [
      numero, contrat.id, contrat.client_id,
      snapshot.code_client, snapshot.client_raison_sociale, snapshot.client_adresse,
      snapshot.client_cp, snapshot.client_ville, snapshot.client_email, snapshot.client_tva_numero,
      snapshot.client_raison_sociale, snapshot.client_adresse, snapshot.client_cp, snapshot.client_ville,
      contrat.numero_contrat, numero_serie || null, modele_machine || null,
      dateEcheance, periodeDebut, periodeFin,
      snapshot.mode_reglement,
      parseFloat(contrat.ftc) || 0,
      parseFloat(contrat.ect) || 0,
    ]
  );

  for (const l of lignes) {
    await dbClient.query(
      `INSERT INTO facture_lignes (
        facture_id, position, type_ligne, reference, designation, description,
        ligne_periode_debut, ligne_periode_fin,
        ancien_compteur, nouveau_compteur, compteur_periode_debut, compteur_periode_fin,
        quantite, prix_unitaire, remise_pourcentage, remise_montant, taux_tva, total_ht,
        releve_compteur_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        facture.id, l.position, l.type_ligne, l.reference || null,
        l.designation, l.description || null,
        l.ligne_periode_debut || null, l.ligne_periode_fin || null,
        l.ancien_compteur || null, l.nouveau_compteur || null,
        l.compteur_periode_debut || null, l.compteur_periode_fin || null,
        l.quantite || 0, l.prix_unitaire || 0,
        l.remise_pourcentage || 0, l.remise_montant || 0,
        l.taux_tva || 20, l.total_ht || 0,
        l.releve_compteur_id || null,
      ]
    );
  }

  await recalculerFacture(dbClient, facture.id);
  return { rows: [await dbClient.query('SELECT * FROM factures WHERE id = $1', [facture.id]).then(r => r.rows[0])] };
}

async function updateContratApresFacturation(dbClient, contrat, facture, mois, periodeFin) {
  const base = toDateStr(contrat.prochaine_date_facturation) || toDateStr(contrat.date_prochaine_facture) || new Date().toISOString().slice(0, 10);
  const nextDate = addMonthsUTC(base, mois);
  const derniereDateFact = toDateStr(periodeFin) || new Date().toISOString().slice(0, 10);

  await dbClient.query(
    `UPDATE contrats SET
      date_prochaine_facture = $1,
      prochaine_date_facturation = $1,
      derniere_facture_date = CURRENT_DATE,
      derniere_date_facturation = $5,
      derniere_facture_numero = $2,
      derniere_facture_montant_ht = $3,
      updated_at = NOW()
    WHERE id = $4`,
    [nextDate, facture.numero_facture, facture.total_ht, contrat.id, derniereDateFact]
  );
}
