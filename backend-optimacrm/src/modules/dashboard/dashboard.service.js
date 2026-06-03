import { query } from '../../config/database.js';

export async function getDashboardStats() {
  const now = new Date();
  const moisDebut = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const moisFin = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const in3Months = new Date(now.getFullYear(), now.getMonth() + 3, now.getDate()).toISOString().slice(0, 10);

  const moisPrecedentDebut = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
  const moisPrecedentFin = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

  const anneeDebut = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);

  const [
    clientsTotal,
    clientsActifs,
    clientsNouveauxMois,
    facturesCaMois,
    facturesCaMoisPrecedent,
    facturesEnAttente,
    facturesEnRetard,
    facturesPayeesMois,
    facturesRecentesRes,
    devisTotalMois,
    devisEnAttente,
    devisAcceptesMois,
    devisConversion,
    contratsActifs,
    contratsParType,
    contratsAFacturer,
    contratsEcheance3m,
    contratsCA,
    parcTotal,
    parcParStatut,
    parcAlertesCompteurs,
    catalogueProduits,
    activityRecentRes,
    activityTodayCount,
    facturesParMoisRes,
    devisParMoisRes,
    topClientsRes,
    facturesParStatutRes,
    caAnnuelRes,
    avoirsStatsRes,
    facturesBrouillonsRes,
    dsoRes,
    caParTypeContratRes,
    clientsNouveauxParMoisRes,
    parcParCategorieRes,
    facturesPayeesParMoisRes,
  ] = await Promise.all([
    query(`SELECT COUNT(*)::int AS c FROM clients`),
    query(`SELECT COUNT(*)::int AS c FROM clients WHERE statut = 'ACTIF'`),
    query(`SELECT COUNT(*)::int AS c FROM clients WHERE created_at >= $1`, [moisDebut]),

    query(
      `SELECT COALESCE(SUM(total_ttc), 0) AS montant, COUNT(*)::int AS count FROM factures
       WHERE date_creation >= $1 AND date_creation <= $2 AND statut != 'Annulée'`,
      [moisDebut, moisFin],
    ),
    query(
      `SELECT COALESCE(SUM(total_ttc), 0) AS montant FROM factures
       WHERE date_creation >= $1 AND date_creation <= $2 AND statut != 'Annulée'`,
      [moisPrecedentDebut, moisPrecedentFin],
    ),
    query(
      `SELECT COALESCE(SUM(net_a_payer), 0) AS montant, COUNT(*)::int AS count FROM factures
       WHERE statut IN ('Envoyée', 'Validée') AND net_a_payer > 0`,
    ),
    query(
      `SELECT COALESCE(SUM(net_a_payer), 0) AS montant, COUNT(*)::int AS count FROM factures
       WHERE date_echeance < $1 AND statut NOT IN ('Payée', 'Annulée') AND net_a_payer > 0`,
      [today],
    ),
    query(
      `SELECT COALESCE(SUM(total_ttc), 0) AS montant, COUNT(*)::int AS count FROM factures
       WHERE statut = 'Payée' AND date_creation >= $1 AND date_creation <= $2`,
      [moisDebut, moisFin],
    ),
    query(
      `SELECT f.id, f.numero_facture, f.client_raison_sociale, f.total_ttc, f.net_a_payer,
              f.statut, f.date_creation, f.date_echeance
       FROM factures f
       WHERE f.statut != 'Annulée'
       ORDER BY f.date_creation DESC LIMIT 7`,
    ),

    query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(montant_ttc), 0)::decimal AS montant
       FROM devis WHERE deleted_at IS NULL AND date_creation >= $1`,
      [moisDebut],
    ),
    query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(montant_ttc), 0)::decimal AS montant
       FROM devis WHERE deleted_at IS NULL AND statut = 'ENVOYE'`,
    ),
    query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(montant_ttc), 0)::decimal AS montant
       FROM devis WHERE deleted_at IS NULL AND statut = 'ACCEPTE' AND date_acceptation >= $1`,
      [moisDebut],
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE statut IN ('ACCEPTE','FACTURE'))::int AS acceptes,
         COUNT(*) FILTER (WHERE statut IN ('ACCEPTE','FACTURE','ENVOYE','REFUSE','EXPIRE'))::int AS total
       FROM devis WHERE deleted_at IS NULL`,
    ),

    query(`SELECT COUNT(*)::int AS total FROM contrats WHERE statut = 'Actif' AND deleted_at IS NULL`),
    query(`SELECT type_contrat, COUNT(*)::int AS count FROM contrats WHERE statut = 'Actif' AND deleted_at IS NULL GROUP BY type_contrat`),
    query(
      `SELECT COUNT(*)::int AS total FROM contrats WHERE statut = 'Actif' AND deleted_at IS NULL AND date_prochaine_facture <= $1`,
      [moisFin],
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM contrats WHERE statut = 'Actif' AND deleted_at IS NULL AND date_echeance <= $1`,
      [in3Months],
    ),
    query(`
      SELECT COALESCE(SUM(
        CASE WHEN lg.actif THEN lg.quantite * lg.prix_unitaire_ht * (1 - lg.remise_pourcentage / 100) ELSE 0 END
      ), 0) AS total_ht
      FROM contrat_lignes lg
      JOIN contrats c ON c.id = lg.contrat_id
      WHERE c.statut = 'Actif' AND c.deleted_at IS NULL
    `),

    query(`SELECT COUNT(*)::int AS c FROM parc_machines`),
    query(`SELECT statut, COUNT(*)::int AS count FROM parc_machines GROUP BY statut`),
    query(
      `SELECT COUNT(*)::int AS count FROM parc_machines
       WHERE categorie = 'Copieur' AND statut = 'En service'
         AND (date_dernier_releve IS NULL OR date_dernier_releve < NOW() - INTERVAL '90 days')`,
    ),

    query(`SELECT COUNT(*)::int AS c FROM catalogue_produits WHERE actif = true`),

    query(`SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 10`),
    query(`SELECT COUNT(*)::int AS c FROM activity_logs WHERE created_at >= CURRENT_DATE`),

    query(`
      SELECT to_char(date_creation, 'YYYY-MM') AS mois,
             COALESCE(SUM(total_ttc), 0)::decimal AS montant,
             COUNT(*)::int AS count
      FROM factures
      WHERE date_creation >= (CURRENT_DATE - INTERVAL '11 months')
        AND statut != 'Annulée'
      GROUP BY to_char(date_creation, 'YYYY-MM')
      ORDER BY mois
    `),
    query(`
      SELECT to_char(date_creation, 'YYYY-MM') AS mois,
             COALESCE(SUM(montant_ttc), 0)::decimal AS montant,
             COUNT(*)::int AS count
      FROM devis
      WHERE deleted_at IS NULL
        AND date_creation >= (CURRENT_DATE - INTERVAL '11 months')
      GROUP BY to_char(date_creation, 'YYYY-MM')
      ORDER BY mois
    `),

    // Top 5 clients par CA (année en cours)
    query(`
      SELECT c.id, c.raison_sociale, c.numero_client,
             COALESCE(SUM(f.total_ttc), 0)::decimal AS ca_total,
             COUNT(f.id)::int AS nb_factures
      FROM clients c
      LEFT JOIN factures f ON f.client_id = c.id
        AND f.statut != 'Annulée'
        AND f.date_creation >= $1
      WHERE c.statut = 'ACTIF'
      GROUP BY c.id, c.raison_sociale, c.numero_client
      HAVING COALESCE(SUM(f.total_ttc), 0) > 0
      ORDER BY ca_total DESC
      LIMIT 5
    `, [anneeDebut]),

    // Répartition factures par statut
    query(`
      SELECT statut, COUNT(*)::int AS count,
             COALESCE(SUM(total_ttc), 0)::decimal AS montant
      FROM factures
      GROUP BY statut
      ORDER BY count DESC
    `),

    // CA annuel cumulé
    query(`
      SELECT COALESCE(SUM(total_ttc), 0)::decimal AS ca_annuel,
             COUNT(*)::int AS nb_factures
      FROM factures
      WHERE date_creation >= $1 AND statut != 'Annulée'
    `, [anneeDebut]),

    // Avoirs stats
    query(`
      SELECT COUNT(*)::int AS total,
             COALESCE(SUM(montant_ttc), 0)::decimal AS montant_total,
             COUNT(*) FILTER (WHERE date_avoir >= $1)::int AS ce_mois,
             COALESCE(SUM(montant_ttc) FILTER (WHERE date_avoir >= $1), 0)::decimal AS montant_ce_mois
      FROM avoirs
      WHERE statut != 'Annulé'
    `, [moisDebut]),

    // Factures brouillons
    query(`
      SELECT COUNT(*)::int AS count,
             COALESCE(SUM(total_ttc), 0)::decimal AS montant
      FROM factures WHERE statut = 'Brouillon'
    `),

    // DSO (Days Sales Outstanding) - âge moyen des créances
    query(`
      SELECT COALESCE(AVG(CURRENT_DATE - date_creation::date), 0)::int AS dso
      FROM factures
      WHERE statut IN ('Envoyée', 'Validée') AND net_a_payer > 0
    `),

    // CA par type de contrat
    query(`
      SELECT c.type_contrat,
             COALESCE(SUM(
               CASE WHEN lg.actif THEN lg.quantite * lg.prix_unitaire_ht * (1 - lg.remise_pourcentage / 100) ELSE 0 END
             ), 0)::decimal AS ca_mensuel,
             COUNT(DISTINCT c.id)::int AS nb_contrats
      FROM contrats c
      LEFT JOIN contrat_lignes lg ON lg.contrat_id = c.id
      WHERE c.statut = 'Actif' AND c.deleted_at IS NULL
      GROUP BY c.type_contrat
      ORDER BY ca_mensuel DESC
    `),

    // Nouveaux clients par mois (12 derniers mois)
    query(`
      SELECT to_char(created_at, 'YYYY-MM') AS mois,
             COUNT(*)::int AS count
      FROM clients
      WHERE created_at >= (CURRENT_DATE - INTERVAL '11 months')
      GROUP BY to_char(created_at, 'YYYY-MM')
      ORDER BY mois
    `),

    // Parc par catégorie
    query(`
      SELECT categorie, COUNT(*)::int AS count
      FROM parc_machines
      WHERE statut = 'En service'
      GROUP BY categorie
      ORDER BY count DESC
    `),

    // Taux de recouvrement (factures payées / total factures sur 12 mois)
    query(`
      SELECT
        COUNT(*) FILTER (WHERE statut = 'Payée')::int AS payees,
        COUNT(*)::int AS total,
        COALESCE(SUM(total_ttc) FILTER (WHERE statut = 'Payée'), 0)::decimal AS montant_paye,
        COALESCE(SUM(total_ttc), 0)::decimal AS montant_total
      FROM factures
      WHERE date_creation >= (CURRENT_DATE - INTERVAL '12 months')
        AND statut != 'Annulée'
    `),
  ]);

  const convRow = devisConversion.rows[0];
  const tauxConversion = convRow.total > 0
    ? Math.round((convRow.acceptes / convRow.total) * 10000) / 100
    : 0;

  const parTypeContrat = { Copieur: 0, Telephonie: 0, Informatique: 0, Securite: 0 };
  for (const row of contratsParType.rows) parTypeContrat[row.type_contrat] = row.count;

  const parcStatut = {};
  for (const row of parcParStatut.rows) parcStatut[row.statut] = row.count;

  const caMois = parseFloat(facturesCaMois.rows[0].montant);
  const caMoisPrecedent = parseFloat(facturesCaMoisPrecedent.rows[0].montant);
  const evolutionCA = caMoisPrecedent > 0
    ? Math.round(((caMois - caMoisPrecedent) / caMoisPrecedent) * 10000) / 100
    : 0;

  const moisLabels = [];
  for (let m = 11; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    moisLabels.push(d.toISOString().slice(0, 7));
  }

  const facturesParMois = moisLabels.map(label => {
    const found = facturesParMoisRes.rows.find(r => r.mois === label);
    return { mois: label, montant: found ? parseFloat(found.montant) : 0, count: found ? found.count : 0 };
  });

  const devisParMois = moisLabels.map(label => {
    const found = devisParMoisRes.rows.find(r => r.mois === label);
    return { mois: label, montant: found ? parseFloat(found.montant) : 0, count: found ? found.count : 0 };
  });

  const clientsParMois = moisLabels.map(label => {
    const found = clientsNouveauxParMoisRes.rows.find(r => r.mois === label);
    return { mois: label, count: found ? found.count : 0 };
  });

  const facturesParStatut = {};
  for (const row of facturesParStatutRes.rows) {
    facturesParStatut[row.statut] = { count: row.count, montant: parseFloat(row.montant) };
  }

  const parcParCategorie = {};
  for (const row of parcParCategorieRes.rows) {
    parcParCategorie[row.categorie] = row.count;
  }

  const caParTypeContrat = {};
  for (const row of caParTypeContratRes.rows) {
    caParTypeContrat[row.type_contrat] = {
      ca_mensuel: parseFloat(row.ca_mensuel),
      nb_contrats: row.nb_contrats,
    };
  }

  const recouvrementRow = facturesPayeesParMoisRes.rows[0] || { montant_paye: '0', montant_total: '0' };
  const tauxRecouvrement = parseFloat(recouvrementRow.montant_total) > 0
    ? Math.round((parseFloat(recouvrementRow.montant_paye) / parseFloat(recouvrementRow.montant_total)) * 10000) / 100
    : 100;

  const avoirStats = avoirsStatsRes.rows[0] || {};

  return {
    clients: {
      total: clientsTotal.rows[0].c,
      actifs: clientsActifs.rows[0].c,
      nouveaux_mois: clientsNouveauxMois.rows[0].c,
      par_mois: clientsParMois,
    },
    factures: {
      ca_mois: { count: facturesCaMois.rows[0].count, montant: caMois },
      evolution_ca: evolutionCA,
      en_attente: { count: facturesEnAttente.rows[0].count, montant: parseFloat(facturesEnAttente.rows[0].montant) },
      en_retard: { count: facturesEnRetard.rows[0].count, montant: parseFloat(facturesEnRetard.rows[0].montant) },
      payees_mois: { count: facturesPayeesMois.rows[0].count, montant: parseFloat(facturesPayeesMois.rows[0].montant) },
      brouillons: { count: facturesBrouillonsRes.rows[0].count, montant: parseFloat(facturesBrouillonsRes.rows[0].montant) },
      recentes: facturesRecentesRes.rows,
      par_mois: facturesParMois,
      par_statut: facturesParStatut,
      ca_annuel: parseFloat(caAnnuelRes.rows[0].ca_annuel),
      nb_factures_annuel: caAnnuelRes.rows[0].nb_factures,
      dso: dsoRes.rows[0].dso,
      taux_recouvrement: tauxRecouvrement,
    },
    devis: {
      total_mois: { count: devisTotalMois.rows[0].count, montant: parseFloat(devisTotalMois.rows[0].montant) },
      en_attente: { count: devisEnAttente.rows[0].count, montant: parseFloat(devisEnAttente.rows[0].montant) },
      acceptes_mois: { count: devisAcceptesMois.rows[0].count, montant: parseFloat(devisAcceptesMois.rows[0].montant) },
      taux_conversion: tauxConversion,
      par_mois: devisParMois,
    },
    contrats: {
      total_actifs: contratsActifs.rows[0].total,
      par_type: parTypeContrat,
      a_facturer_ce_mois: contratsAFacturer.rows[0].total,
      echeance_3_mois: contratsEcheance3m.rows[0].total,
      ca_recurrent_mensuel: parseFloat(contratsCA.rows[0].total_ht) || 0,
      ca_par_type: caParTypeContrat,
    },
    parc: {
      total: parcTotal.rows[0].c,
      en_service: parcStatut['En service'] || 0,
      en_stock: parcStatut['En stock'] || 0,
      en_sav: parcStatut['En SAV'] || 0,
      alertes_compteurs: parcAlertesCompteurs.rows[0].count,
      par_categorie: parcParCategorie,
    },
    catalogue: {
      produits_actifs: catalogueProduits.rows[0].c,
    },
    avoirs: {
      total: avoirStats.total || 0,
      montant_total: parseFloat(avoirStats.montant_total) || 0,
      ce_mois: avoirStats.ce_mois || 0,
      montant_ce_mois: parseFloat(avoirStats.montant_ce_mois) || 0,
    },
    top_clients: topClientsRes.rows.map(r => ({
      id: r.id,
      raison_sociale: r.raison_sociale,
      numero_client: r.numero_client,
      ca_total: parseFloat(r.ca_total),
      nb_factures: r.nb_factures,
    })),
    activite: {
      recentes: activityRecentRes.rows,
      actions_aujourdhui: activityTodayCount.rows[0].c,
    },
  };
}
