import { query, pool, getClient } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { ABONNEMENT_TYPES } from '../../config/contratCategories.js';
import { toDateStr, addMonthsUTC as addMonths, subDayUTC as subDay } from '../../utils/dateUtils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateFR(d) {
  if (!d) return '';
  const s = toDateStr(d);
  if (!s) return '';
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
}

function getFrequencyMonths(periodicite) {
  const map = {
    Mensuel: 1, M: 1,
    Bimestriel: 2,
    Trimestriel: 3, T: 3,
    Semestriel: 6, S: 6,
    Annuel: 12, A: 12,
  };
  return map[periodicite] || 1;
}

async function generateNumeroFacture(dbClient) {
  const result = await dbClient.query("SELECT nextval('facture_numero_seq')::int AS seq");
  return `FA-${String(result.rows[0].seq).padStart(5, '0')}`;
}

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
    delai_paiement: client.delai_paiement || '30_JOURS',
  };
}

function getDelaiJours(delai) {
  const map = { COMPTANT: 0, '15_JOURS': 15, '30_JOURS': 30, '45_JOURS_FIN_MOIS': 45, '60_JOURS': 60 };
  return map[delai] || 30;
}

function resolveAbonnementTypes(typeFilter) {
  if (!typeFilter || typeFilter === 'Tous') return ABONNEMENT_TYPES;
  if (ABONNEMENT_TYPES.includes(typeFilter)) return [typeFilter];
  return ABONNEMENT_TYPES;
}

// ---------------------------------------------------------------------------
// GET — Contrats abonnement à facturer (tous types ou filtrés)
// ---------------------------------------------------------------------------

export async function getContratsAbonnement(dateFacturation, typeFilter) {
  const dateFact = dateFacturation || new Date().toISOString().slice(0, 10);
  const types = resolveAbonnementTypes(typeFilter);

  const placeholders = types.map((_, i) => `$${i + 2}`).join(', ');

  const { rows: contrats } = await query(
    `SELECT c.id, c.numero_contrat, c.type_contrat, c.periodicite,
            c.client_id, cl.raison_sociale AS client_raison_sociale,
            cl.numero_client AS client_code,
            COALESCE(c.prochaine_date_facturation, c.date_prochaine_facture) AS prochaine_facturation,
            c.date_renouvellement, c.ftc, c.terme_facturation,
            (SELECT COALESCE(SUM(
              CASE WHEN lg.actif AND lg.categorie_ligne != 'Hors Forfait'
                THEN lg.quantite * lg.prix_unitaire_ht * (1 - COALESCE(lg.remise_pourcentage, 0) / 100)
                ELSE 0 END
            ), 0) FROM contrat_lignes lg WHERE lg.contrat_id = c.id) AS montant_abonnement_ht,
            (SELECT string_agg(DISTINCT lg2.categorie_ligne, ', ')
             FROM contrat_lignes lg2
             WHERE lg2.contrat_id = c.id AND lg2.actif = true AND lg2.prix_unitaire_ht > 0
            ) AS rubriques_actives
     FROM contrats c
     JOIN clients cl ON cl.id = c.client_id
     WHERE c.type_contrat IN (${placeholders})
       AND (c.statut = 'Actif' OR c.statut = 'actif')
       AND c.deleted_at IS NULL
       AND COALESCE(c.prochaine_date_facturation, c.date_prochaine_facture) <= $1
     ORDER BY c.type_contrat, COALESCE(c.prochaine_date_facturation, c.date_prochaine_facture) ASC`,
    [dateFact, ...types]
  );

  const result = contrats.map(c => {
    const mois = getFrequencyMonths(c.periodicite);
    const terme = c.terme_facturation || 'TEC';
    const prochaine = c.prochaine_facturation;
    let periodeDebut, periodeFin;
    if (!prochaine) {
      periodeDebut = null;
      periodeFin = null;
    } else if (terme === 'TEC') {
      periodeDebut = addMonths(prochaine, -mois);
      periodeFin = subDay(prochaine);
    } else {
      periodeDebut = prochaine;
      periodeFin = subDay(addMonths(prochaine, mois));
    }
    const ftc = parseFloat(c.ftc) || 0;
    const montantAbonnement = parseFloat(c.montant_abonnement_ht) || 0;
    const totalHT = montantAbonnement + ftc;

    return {
      ...c,
      periode_debut: periodeDebut,
      periode_fin: periodeFin,
      montant_abonnement_ht: Math.round(montantAbonnement * 100) / 100,
      ftc: Math.round(ftc * 100) / 100,
      total_ht: Math.round(totalHT * 100) / 100,
      rubriques: c.rubriques_actives ? c.rubriques_actives.split(', ').filter(Boolean) : [],
    };
  });

  const totalHT = result.reduce((sum, c) => sum + c.total_ht, 0);
  const count = result.length;

  return {
    contrats: result,
    total_ht: Math.round(totalHT * 100) / 100,
    total_ttc: Math.round(totalHT * 1.2 * 100) / 100,
    count,
    types_inclus: types,
  };
}

// ---------------------------------------------------------------------------
// POST — Générer les factures abonnement (transaction unique)
// ---------------------------------------------------------------------------

export async function genererFacturesAbonnement(dateFacturation, contratIds, userId) {
  if (!contratIds || contratIds.length === 0) {
    throw new ApiError(400, 'Aucun contrat sélectionné');
  }

  const dateFact = dateFacturation || new Date().toISOString().slice(0, 10);
  const alsClient = getClient();
  const dbClient = alsClient || await pool.connect();
  const ownConnection = !alsClient;

  try {
    if (ownConnection) await dbClient.query('BEGIN');

    const rapport = {
      factures_creees: 0,
      montant_total_ht: 0,
      montant_total_ttc: 0,
      factures: [],
      augmentations: [],
    };

    for (const contratId of contratIds) {
      const { rows: [contrat] } = await dbClient.query(
        `SELECT c.*, cl.raison_sociale AS client_raison_sociale,
                cl.numero_client AS client_code,
                cl.email_principal AS client_email,
                cl.mode_paiement_prefere AS client_mode_paiement,
                cl.delai_paiement AS client_delai_paiement
         FROM contrats c
         JOIN clients cl ON cl.id = c.client_id
         WHERE c.id = $1 AND c.deleted_at IS NULL`,
        [contratId]
      );

      if (!contrat) continue;
      if (!ABONNEMENT_TYPES.includes(contrat.type_contrat)) continue;
      if (contrat.statut !== 'Actif' && contrat.statut !== 'actif') continue;

      const mois = getFrequencyMonths(contrat.periodicite);
      const prochaineFacturation = toDateStr(contrat.prochaine_date_facturation) || toDateStr(contrat.date_prochaine_facture);
      if (!prochaineFacturation) continue;

      const terme = contrat.terme_facturation || 'TEC';
      let periodeDebut, periodeFin;
      if (terme === 'TEC') {
        periodeDebut = addMonths(prochaineFacturation, -mois);
        periodeFin = subDay(prochaineFacturation);
      } else {
        periodeDebut = prochaineFacturation;
        periodeFin = subDay(addMonths(prochaineFacturation, mois));
      }

      // --- Augmentation annuelle ---
      const dateRenouvellement = contrat.date_renouvellement;
      let augmentationAppliquee = null;

      if (dateRenouvellement && new Date(dateRenouvellement) <= new Date(dateFact)) {
        const { rows: notesRows } = await dbClient.query(
          `SELECT notes FROM contrats WHERE id = $1`, [contratId]
        );
        const notes = notesRows[0]?.notes || '';
        const augMatch = notes.match(/Augmentation:\s*([\d.,]+)%/);
        const pourcentageAugm = augMatch ? parseFloat(augMatch[1].replace(',', '.')) : 0;

        if (pourcentageAugm > 0) {
          const { rows: lignesAugm } = await dbClient.query(
            `SELECT id, designation, prix_unitaire_ht, categorie_ligne FROM contrat_lignes
             WHERE contrat_id = $1 AND actif = true AND categorie_ligne != 'Hors Forfait'`,
            [contratId]
          );

          const detailsAugm = [];
          for (const ligne of lignesAugm) {
            const ancienMontant = parseFloat(ligne.prix_unitaire_ht) || 0;
            const nouveauMontant = Math.round(ancienMontant * (1 + pourcentageAugm / 100) * 100) / 100;

            await dbClient.query(
              `UPDATE contrat_lignes SET prix_unitaire_ht = $1, updated_at = NOW() WHERE id = $2`,
              [nouveauMontant, ligne.id]
            );

            detailsAugm.push({
              designation: ligne.designation,
              categorie: ligne.categorie_ligne,
              ancien_montant: ancienMontant,
              nouveau_montant: nouveauMontant,
            });
          }

          const nouvelleDate = addMonths(dateRenouvellement, 12);
          await dbClient.query(
            `UPDATE contrats SET date_renouvellement = $1, updated_at = NOW() WHERE id = $2`,
            [nouvelleDate, contratId]
          );

          augmentationAppliquee = {
            contrat_id: contratId,
            numero_contrat: contrat.numero_contrat,
            pourcentage: pourcentageAugm,
            lignes: detailsAugm,
            ancienne_date_renouvellement: dateRenouvellement,
            nouvelle_date_renouvellement: nouvelleDate,
          };
          rapport.augmentations.push(augmentationAppliquee);
        }
      }

      // --- Récupérer les lignes du contrat (après augmentation éventuelle) ---
      const { rows: contratLignes } = await dbClient.query(
        `SELECT * FROM contrat_lignes WHERE contrat_id = $1 AND actif = true ORDER BY ordre`,
        [contratId]
      );

      if (contratLignes.length === 0) continue;

      // --- Créer la facture ---
      const snapshot = await getClientSnapshot(dbClient, contrat.client_id);
      const numero = await generateNumeroFacture(dbClient);
      const delaiJours = getDelaiJours(snapshot.delai_paiement);
      const dateEcheance = new Date(new Date(dateFact).getTime() + delaiJours * 86400000).toISOString().slice(0, 10);
      const ftc = parseFloat(contrat.ftc) || 0;

      const { rows: [facture] } = await dbClient.query(
        `INSERT INTO factures (
          numero_facture, type_origine, contrat_id, client_id,
          code_client, client_raison_sociale, client_adresse, client_cp, client_ville,
          client_email, client_tva_numero,
          site_concerne_nom, site_concerne_adresse, site_concerne_cp, site_concerne_ville,
          numero_contrat,
          date_creation, date_echeance, periode_debut, periode_fin,
          mode_reglement, frais_techniques, eco_contribution, taux_tva, statut
        ) VALUES (
          $1, 'Contrat', $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15,
          $16, $17, $18, $19,
          $20, $21, 0, 20, 'Brouillon'
        ) RETURNING *`,
        [
          numero, contrat.id, contrat.client_id,
          snapshot.code_client, snapshot.client_raison_sociale, snapshot.client_adresse,
          snapshot.client_cp, snapshot.client_ville, snapshot.client_email, snapshot.client_tva_numero,
          snapshot.client_raison_sociale, snapshot.client_adresse, snapshot.client_cp, snapshot.client_ville,
          contrat.numero_contrat,
          dateFact, dateEcheance, periodeDebut, periodeFin,
          snapshot.mode_reglement, ftc,
        ]
      );

      // --- Créer les lignes de facture ---
      let position = 0;
      const categories = [...new Set(contratLignes.map(l => l.categorie_ligne))];

      for (const categorie of categories) {
        if (categorie === 'Hors Forfait') continue;

        const lignesDuGroupe = contratLignes.filter(l => l.categorie_ligne === categorie && l.categorie_ligne !== 'Hors Forfait');
        if (lignesDuGroupe.length === 0) continue;

        for (const cl of lignesDuGroupe) {
          const qte = parseFloat(cl.quantite) || 1;
          const pu = parseFloat(cl.prix_unitaire_ht) || 0;
          if (pu === 0) continue;

          const remPct = parseFloat(cl.remise_pourcentage) || 0;
          const totalHt = Math.round(qte * pu * (1 - remPct / 100) * 100) / 100;

          const typeMap = {
            'Forfait Fixe': 'ABONNEMENT', 'Forfait Mobile': 'ABONNEMENT', 'Lien Internet': 'ABONNEMENT',
            'Location Matériel': 'LOCATION', 'Services': 'SERVICE', 'Autre': 'PRODUIT',
            'Personnalisé': 'PRODUIT',
            'Vidéosurveillance': 'ABONNEMENT', 'Contrôle d\'accès': 'ABONNEMENT',
            'Téléassistance': 'ABONNEMENT', 'Générateur de brouillard': 'ABONNEMENT',
            'Maintenance serveur': 'ABONNEMENT', 'Maintenance informatique': 'ABONNEMENT',
            'Cloud': 'ABONNEMENT', 'Office 365': 'ABONNEMENT', 'Logiciel / Licence': 'PRODUIT',
          };

          await dbClient.query(
            `INSERT INTO facture_lignes (
              facture_id, position, type_ligne, reference, designation, description,
              ligne_periode_debut, ligne_periode_fin,
              quantite, prix_unitaire, remise_pourcentage, remise_montant, taux_tva, total_ht
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [
              facture.id, position++,
              typeMap[categorie] || 'PRODUIT',
              cl.reference || null,
              cl.designation,
              `Période du ${formatDateFR(periodeDebut)} au ${formatDateFR(periodeFin)}${cl.complement_info ? '\n' + cl.complement_info : ''}`,
              periodeDebut, periodeFin,
              qte, pu,
              remPct, 0,
              cl.taux_tva || 20, totalHt,
            ]
          );
        }
      }

      // --- Ligne FTC ---
      if (ftc > 0) {
        await dbClient.query(
          `INSERT INTO facture_lignes (
            facture_id, position, type_ligne, reference, designation, description,
            ligne_periode_debut, ligne_periode_fin,
            quantite, prix_unitaire, remise_pourcentage, remise_montant, taux_tva, total_ht
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            facture.id, position++,
            'SERVICE', 'FTC',
            'Frais techniques complémentaires',
            null,
            null, null,
            1, ftc,
            0, 0,
            20, ftc,
          ]
        );
      }

      // --- Recalculer les totaux ---
      const { rows: lignesFacture } = await dbClient.query(
        `SELECT * FROM facture_lignes WHERE facture_id = $1`, [facture.id]
      );
      const totalLignesHT = lignesFacture
        .filter(l => !['COMMENTAIRE', 'SOUS_TOTAL', 'SAUT_DE_LIGNE'].includes(l.type_ligne))
        .reduce((sum, l) => sum + parseFloat(l.total_ht || 0), 0);

      const totalHT = Math.round(totalLignesHT * 100) / 100;
      const montantTVA = Math.round(totalHT * 0.20 * 100) / 100;
      const totalTTC = Math.round((totalHT + montantTVA) * 100) / 100;

      await dbClient.query(
        `UPDATE factures SET
          total_ht = $1, montant_tva = $2, total_ttc = $3,
          frais_techniques = $4, net_a_payer = $3, total_regle = 0, updated_at = NOW()
        WHERE id = $5`,
        [totalHT, montantTVA, totalTTC, ftc, facture.id]
      );

      // --- Historique ---
      await dbClient.query(
        `INSERT INTO facture_historique (facture_id, action, description, utilisateur)
         VALUES ($1, $2, $3, $4)`,
        [facture.id, 'Création', `Facture générée - Facturation périodique ${contrat.type_contrat.toLowerCase()} (contrat ${contrat.numero_contrat})`, userId]
      );

      // --- Mettre à jour le contrat ---
      const prochaineDate = addMonths(prochaineFacturation, mois);
      await dbClient.query(
        `UPDATE contrats SET
          date_prochaine_facture = $1,
          prochaine_date_facturation = $1,
          derniere_facture_date = $2,
          derniere_date_facturation = $2,
          derniere_facture_numero = $3,
          derniere_facture_montant_ht = $4,
          updated_at = NOW()
        WHERE id = $5`,
        [prochaineDate, dateFact, numero, totalHT, contratId]
      );

      rapport.factures_creees++;
      rapport.montant_total_ht += totalHT;
      rapport.montant_total_ttc += totalTTC;
      rapport.factures.push({
        facture_id: facture.id,
        numero_facture: numero,
        contrat_id: contratId,
        numero_contrat: contrat.numero_contrat,
        type_contrat: contrat.type_contrat,
        client: snapshot.client_raison_sociale,
        client_code: snapshot.code_client,
        montant_ht: totalHT,
        montant_ttc: totalTTC,
        periode_debut: periodeDebut,
        periode_fin: periodeFin,
      });
    }

    rapport.montant_total_ht = Math.round(rapport.montant_total_ht * 100) / 100;
    rapport.montant_total_ttc = Math.round(rapport.montant_total_ttc * 100) / 100;

    if (ownConnection) await dbClient.query('COMMIT');
    return rapport;

  } catch (err) {
    if (ownConnection) await dbClient.query('ROLLBACK');
    throw err;
  } finally {
    if (ownConnection) dbClient.release();
  }
}

// ---------------------------------------------------------------------------
// Simulation (aperçu sans création)
// ---------------------------------------------------------------------------

export async function simulerFactureAbonnement(contratId, dateFacturation) {
  const dateFact = dateFacturation || new Date().toISOString().slice(0, 10);

  const { rows: [contrat] } = await query(
    `SELECT c.*, cl.raison_sociale AS client_raison_sociale, cl.numero_client AS client_code
     FROM contrats c
     JOIN clients cl ON cl.id = c.client_id
     WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [contratId]
  );

  if (!contrat) throw new ApiError(404, 'Contrat introuvable');

  const mois = getFrequencyMonths(contrat.periodicite);
  const prochaineFacturation = toDateStr(contrat.prochaine_date_facturation) || toDateStr(contrat.date_prochaine_facture);
  const prochaine = prochaineFacturation || dateFact;
  const terme = contrat.terme_facturation || 'TEC';
  let periodeDebut, periodeFin;
  if (terme === 'TEC') {
    periodeDebut = addMonths(prochaine, -mois);
    periodeFin = subDay(prochaine);
  } else {
    periodeDebut = prochaine;
    periodeFin = subDay(addMonths(prochaine, mois));
  }

  const { rows: contratLignes } = await query(
    `SELECT * FROM contrat_lignes WHERE contrat_id = $1 AND actif = true ORDER BY ordre`,
    [contratId]
  );

  const lignes = [];
  const categories = [...new Set(contratLignes.map(l => l.categorie_ligne))];

  for (const categorie of categories) {
    if (categorie === 'Hors Forfait') continue;
    const lignesDuGroupe = contratLignes.filter(l => l.categorie_ligne === categorie && l.categorie_ligne !== 'Hors Forfait');

    for (const cl of lignesDuGroupe) {
      const qte = parseFloat(cl.quantite) || 1;
      const pu = parseFloat(cl.prix_unitaire_ht) || 0;
      if (pu === 0) continue;
      const remPct = parseFloat(cl.remise_pourcentage) || 0;
      const totalHt = Math.round(qte * pu * (1 - remPct / 100) * 100) / 100;

      lignes.push({
        categorie,
        reference: cl.reference,
        designation: cl.designation,
        quantite: qte,
        prix_unitaire_ht: pu,
        remise_pourcentage: remPct,
        total_ht: totalHt,
        periode: `${formatDateFR(periodeDebut)} au ${formatDateFR(periodeFin)}`,
      });
    }
  }

  const ftc = parseFloat(contrat.ftc) || 0;
  const totalLignesHT = lignes.reduce((sum, l) => sum + l.total_ht, 0);
  const totalHT = Math.round((totalLignesHT + ftc) * 100) / 100;
  const montantTVA = Math.round(totalHT * 0.20 * 100) / 100;
  const totalTTC = Math.round((totalHT + montantTVA) * 100) / 100;

  return {
    contrat: {
      id: contrat.id,
      numero_contrat: contrat.numero_contrat,
      type_contrat: contrat.type_contrat,
      client: contrat.client_raison_sociale,
      client_code: contrat.client_code,
      periodicite: contrat.periodicite,
    },
    periode_debut: periodeDebut,
    periode_fin: periodeFin,
    lignes,
    ftc,
    total_ht: totalHT,
    montant_tva: montantTVA,
    total_ttc: totalTTC,
  };
}
